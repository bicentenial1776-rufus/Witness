// The Sympatrn beta feedback ingest (a tenant in this project — see
// migration 20260818170000). Two verbs, one endpoint:
//   POST { device_id, reports: [...] }        → upsert the batch
//   POST { device_id, action: "revoke" }      → delete everything the
//                                                device ever sent
//
// No account exists on the Sympatrn side, so there is no JWT to verify
// (config.toml stands the gateway check down); the device_id is a
// client-minted pseudonym. Abuse surface is accepted for a ~20-tester
// beta: payloads are shape-validated, capped at 50 rows of 2000 chars
// a field, and idempotent on (device_id, client_id).
//
// The sympatrn schema is deliberately NOT exposed through PostgREST —
// this function reaches it directly over SUPABASE_DB_URL, and the
// Witness API surface stays untouched.

import postgres from 'npm:postgres@3';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });

const MAX_REPORTS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const capped = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, 2000) : null;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const deviceId = body.device_id;
  if (typeof deviceId !== 'string' || deviceId.length === 0 || deviceId.length > 64) {
    return json(400, { error: 'device_id is required' });
  }

  // The withdrawal promise: everything this device sent, gone in one
  // statement. Idempotent — revoking an unknown device deletes zero.
  if (body.action === 'revoke') {
    const deleted = await sql`
      delete from sympatrn.feedback_reports where device_id = ${deviceId}
    `;
    return json(200, { deleted: deleted.count });
  }

  // The farming skill's read (developer-only): the whole table, gated
  // by a function secret that never ships in any app. device_id must
  // be "-" here — the export is not a device action.
  if (body.action === 'export') {
    const secret = Deno.env.get('FEEDBACK_EXPORT_SECRET');
    if (!secret || body.secret !== secret) {
      return json(403, { error: 'forbidden' });
    }
    const rows = await sql`
      select * from sympatrn.feedback_reports order by created_at desc limit 5000
    `;
    return json(200, { reports: rows });
  }

  if (!Array.isArray(body.reports) || body.reports.length === 0) {
    return json(400, { error: 'reports array is required' });
  }
  if (body.reports.length > MAX_REPORTS) {
    return json(400, { error: `at most ${MAX_REPORTS} reports per batch` });
  }

  const rows = [];
  for (const entry of body.reports) {
    if (typeof entry !== 'object' || entry === null) continue;
    const report = entry as Record<string, unknown>;
    const clientId = report.client_id;
    const createdAt = typeof report.created_at === 'string' ? new Date(report.created_at) : null;
    if (typeof clientId !== 'string' || !UUID_RE.test(clientId)) continue;
    if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
    rows.push({
      device_id: deviceId,
      client_id: clientId.toLowerCase(),
      created_at: createdAt.toISOString(),
      question_kind: capped(report.question_kind),
      question_text: capped(report.question_text),
      category: capped(report.category),
      detail: capped(report.detail),
      chips_shown: capped(report.chips_shown),
      typed_text: capped(report.typed_text),
      reason: capped(report.reason),
      app_version: capped(report.app_version),
    });
  }
  if (rows.length === 0) return json(400, { error: 'no valid reports in batch' });

  await sql`
    insert into sympatrn.feedback_reports ${sql(
      rows,
      'device_id', 'client_id', 'created_at', 'question_kind', 'question_text',
      'category', 'detail', 'chips_shown', 'typed_text', 'reason', 'app_version',
    )}
    on conflict (device_id, client_id) do nothing
  `;
  return json(200, { received: rows.length });
});
