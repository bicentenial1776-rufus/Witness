// Witness ops watcher — the "someone watching" half of database operations
// (docs: the 2026-09-17 incidents; run by .github/workflows/ops-watch.yml
// every ten minutes). Reads four kinds of signal and turns them into one
// GitHub issue labelled ops-alert: opened when a threshold trips (GitHub
// emails the owner), commented on while the trouble lasts (at most hourly,
// or whenever the set of alerts changes), closed with a recovery note when
// everything is clear again. Never fails the workflow run itself — the
// issue is the channel, not the red X.
//
//   node scripts/ops-watch.mjs            # check, and open/comment/close the issue
//   node scripts/ops-watch.mjs --dry-run  # check and print; touch nothing
//
// Env: SUPABASE_ACCESS_TOKEN (management API), SUPABASE_SERVICE_ROLE_KEY
// (metrics endpoint), SUPABASE_PROJECT_REF, and in CI GITHUB_TOKEN +
// GITHUB_REPOSITORY for the issue.

const REF = process.env.SUPABASE_PROJECT_REF ?? 'bdjsahbjptpcmouqozvs';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry-run');
const WINDOW_MIN = 10;

// Thresholds — tuned to the Micro instance's behaviour on 2026-09-17: the
// two overloads showed as 20+ 5xx and 35 statement timeouts inside 25 min,
// load well above the 2 cores, and pool waits.
const T = {
  fiveXX: 8, // API responses ≥ 500 in the window
  timeouts: 5, // "canceling statement due to statement timeout" in the window
  load1PerCore: 1.5, // 1-minute load ÷ cores
  memAvailPct: 10, // % of RAM still available
  activeBackends: 25, // client backends running a statement right now
  longestQuerySec: 60, // oldest active statement
  diskAvailPct: 15,
};

if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN is required');

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
};

const logsSql = async (sql) => {
  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_MIN * 60_000);
  const q = new URLSearchParams({ iso_timestamp_start: start.toISOString(), iso_timestamp_end: end.toISOString(), sql });
  const r = await api(`/analytics/endpoints/logs.all?${q}`);
  return r.ok && r.body && Array.isArray(r.body.result) ? r.body.result : null;
};

const dbQuery = async (query) => {
  const r = await api('/database/query', { method: 'POST', body: JSON.stringify({ query }) });
  return r.ok && Array.isArray(r.body) ? r.body : null;
};

const metric = (text, name) => {
  const re = new RegExp(`^${name}(?:\\{[^}]*\\})? (\\S+)$`, 'm');
  const m = text.match(re);
  return m ? Number(m[1]) : null;
};

// ── Signals ────────────────────────────────────────────────────────────
const alerts = [];
const notes = [];
const alert = (key, text) => alerts.push({ key, text });

// 1. Service health.
const health = await api('/health?services=db&services=rest&services=auth');
const services = Array.isArray(health.body) ? health.body : [];
for (const s of services) {
  if (!s.healthy) alert(`unhealthy:${s.name}`, `**${s.name} is UNHEALTHY** — ${s.error ?? s.status ?? 'no detail'}`);
}
if (services.length === 0) alert('health:unknown', `Health endpoint did not answer (HTTP ${health.status})`);
notes.push(`health: ${services.map((s) => `${s.name}=${s.healthy ? 'ok' : 'DOWN'}`).join(' ') || 'n/a'}`);

// 2. API errors and statement timeouts in the window (log explorer).
const fivexx = await logsSql(
  'select count(*) as n from edge_logs cross join unnest(metadata) as m cross join unnest(m.response) as r where r.status_code >= 500',
);
const n5xx = fivexx?.[0]?.n ?? null;
if (n5xx !== null && n5xx >= T.fiveXX) alert('5xx', `**${n5xx} API responses ≥ 500** in the last ${WINDOW_MIN} min`);
const timeouts = await logsSql(
  "select count(*) as n from postgres_logs cross join unnest(metadata) as m cross join unnest(m.parsed) as p where p.error_severity = 'ERROR' and event_message like '%statement timeout%'",
);
const nTimeouts = timeouts?.[0]?.n ?? null;
if (nTimeouts !== null && nTimeouts >= T.timeouts)
  alert('timeouts', `**${nTimeouts} statement timeouts** in the last ${WINDOW_MIN} min`);
notes.push(`window ${WINDOW_MIN} min: 5xx=${n5xx ?? 'n/a'} timeouts=${nTimeouts ?? 'n/a'}`);

// 3. Machine: load, memory, disk (Prometheus endpoint, service-role auth).
if (SERVICE_KEY) {
  const res = await fetch(`https://${REF}.supabase.co/customer/v1/privileged/metrics`, {
    headers: { Authorization: `Basic ${Buffer.from(`service_role:${SERVICE_KEY}`).toString('base64')}` },
  }).catch(() => null);
  if (res && res.ok) {
    const text = await res.text();
    const cores = (text.match(/^node_cpu_seconds_total\{[^}]*cpu="(\d+)"[^}]*mode="idle"/gm) ?? []).length || 2;
    const load1 = metric(text, 'node_load1');
    const memAvail = metric(text, 'node_memory_MemAvailable_bytes');
    const memTotal = metric(text, 'node_memory_MemTotal_bytes');
    const memPct = memAvail !== null && memTotal ? Math.round((memAvail / memTotal) * 100) : null;
    // Every mount, worst first: the data volume (/data, 2 GB on 2026-09-18
    // with 13% free) is the one that matters, not the 10 GB root.
    const mounts = new Map();
    for (const m of text.matchAll(/^node_filesystem_(size|avail)_bytes\{[^}]*mountpoint="([^"]*)"[^}]*\} (\S+)$/gm)) {
      const entry = mounts.get(m[2]) ?? {};
      entry[m[1]] = Number(m[3]);
      mounts.set(m[2], entry);
    }
    const worst = [...mounts.entries()]
      .filter(([, v]) => v.size && v.avail !== undefined)
      .map(([mount, v]) => ({ mount, pct: Math.round((v.avail / v.size) * 100), size: v.size, avail: v.avail }))
      .sort((a, b) => a.pct - b.pct)[0];
    const diskPct = worst ? worst.pct : null;
    const diskLabel = worst ? `${worst.mount} ${(worst.avail / 1e9).toFixed(2)} of ${(worst.size / 1e9).toFixed(2)} GB free (${worst.pct}%)` : 'n/a';
    const dbBytes = metric(text, 'pg_database_size_bytes');
    if (load1 !== null && load1 / cores >= T.load1PerCore)
      alert('load', `**Load ${load1.toFixed(2)} on ${cores} cores** (${(load1 / cores).toFixed(2)} per core)`);
    if (memPct !== null && memPct <= T.memAvailPct) alert('memory', `**Only ${memPct}% of memory available**`);
    if (diskPct !== null && diskPct <= T.diskAvailPct) alert('disk', `**Disk nearly full: ${diskLabel}**`);
    notes.push(
      `machine: load1=${load1?.toFixed(2) ?? 'n/a'}/${cores} cores · mem avail ${memPct ?? 'n/a'}% · disk ${diskLabel}${dbBytes ? ` · db ${(dbBytes / 1e9).toFixed(2)} GB` : ''}`,
    );
  } else {
    notes.push(`machine: metrics endpoint ${res ? `HTTP ${res.status}` : 'unreachable'}`);
  }
}

// 4. Inside Postgres: backends, longest statement, top statements.
const activity = await dbQuery(`
  select
    count(*) filter (where state = 'active') as active,
    count(*) filter (where wait_event_type = 'Lock') as lock_waits,
    coalesce(max(extract(epoch from now() - query_start)) filter (where state = 'active'), 0)::int as longest_s
  from pg_stat_activity
  where backend_type = 'client backend' and pid <> pg_backend_pid()`);
const act = activity?.[0];
if (act) {
  if (Number(act.active) >= T.activeBackends) alert('backends', `**${act.active} statements running at once**`);
  if (Number(act.longest_s) >= T.longestQuerySec) alert('long-query', `**A statement has been running ${act.longest_s} s**`);
  if (Number(act.lock_waits) > 0) alert('locks', `**${act.lock_waits} backends waiting on locks**`);
  notes.push(`postgres: active=${act.active} lock_waits=${act.lock_waits} longest=${act.longest_s}s`);
} else {
  alert('db:query', 'Could not query pg_stat_activity through the management API');
}
const top = await dbQuery(`
  select calls, round(mean_exec_time)::int as mean_ms, round(total_exec_time / 1000)::int as total_s,
         left(regexp_replace(query, '\\s+', ' ', 'g'), 90) as q
  from pg_stat_statements
  where calls > 5
  order by total_exec_time desc limit 5`);

// ── Report ─────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const topLines = (top ?? []).map((r) => `| ${r.calls} | ${r.mean_ms} ms | ${r.total_s} s | \`${String(r.q).replace(/\|/g, '¦')}\` |`);
const report = [
  `**${stamp}** — ${alerts.length ? `${alerts.length} alert${alerts.length === 1 ? '' : 's'}` : 'all clear'}`,
  '',
  ...alerts.map((a) => `- ${a.text}`),
  alerts.length ? '' : '',
  '```',
  ...notes,
  '```',
  ...(topLines.length
    ? ['', '<details><summary>Heaviest statements since the last reset</summary>', '', '| calls | mean | total | statement |', '|---|---|---|---|', ...topLines, '', '</details>']
    : []),
].join('\n');

console.log(report);

if (DRY) process.exit(0);

// ── The issue ───────────────────────────────────────────────────────────
const GH = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
if (!GH || !REPO) {
  console.log('(no GITHUB_TOKEN/GITHUB_REPOSITORY — not touching issues)');
  process.exit(0);
}
const gh = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
};
const LABEL = 'ops-alert';
const signature = alerts.map((a) => a.key).sort().join(',');
const open = await gh(`/issues?state=open&labels=${LABEL}&per_page=1`);
const issue = Array.isArray(open.body) ? open.body[0] : null;

if (alerts.length === 0) {
  if (issue) {
    await gh(`/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `✅ Recovered.\n\n${report}` }) });
    await gh(`/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
    console.log(`closed issue #${issue.number}`);
  }
  process.exit(0);
}

const marker = `<!-- ops-watch:${signature} -->`;
if (!issue) {
  await gh('/labels', { method: 'POST', body: JSON.stringify({ name: LABEL, color: 'b60205', description: 'Witness ops watcher' }) }).catch(() => {});
  const created = await gh('/issues', {
    method: 'POST',
    body: JSON.stringify({
      title: `Ops alert: ${alerts.map((a) => a.key).join(', ')}`,
      labels: [LABEL],
      body: `${marker}\n${report}\n\n_Opened by scripts/ops-watch.mjs. It comments while the trouble lasts and closes this issue itself once every check is clear._`,
    }),
  });
  console.log(created.ok ? `opened issue #${created.body.number}` : `could not open issue: HTTP ${created.status}`);
  process.exit(0);
}

// Already open: comment when the alert set changed, or at most once an hour.
const comments = await gh(`/issues/${issue.number}/comments?per_page=100`);
const list = Array.isArray(comments.body) ? comments.body : [];
const last = list[list.length - 1];
const lastSig = (last?.body ?? issue.body ?? '').match(/<!-- ops-watch:([^ ]*) -->/)?.[1] ?? '';
const lastAt = new Date(last?.created_at ?? issue.created_at).getTime();
const changed = lastSig !== signature;
const hourPassed = Date.now() - lastAt >= 55 * 60_000;
if (changed || hourPassed) {
  await gh(`/issues/${issue.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: `${marker}\n${changed ? '⚠️ The alerts changed.' : '⏱ Still alerting.'}\n\n${report}` }),
  });
  console.log(`commented on issue #${issue.number}`);
} else {
  console.log(`issue #${issue.number} already open with the same alerts — no comment`);
}
