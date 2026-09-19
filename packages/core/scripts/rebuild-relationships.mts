import './node-polyfills.js';
import { createClient } from '@supabase/supabase-js';
import { computeRelationshipRows, fetchFamilyGraph } from '../src/family/index.js';
import { loadEnv, requireEnv } from './env.js';
loadEnv();

// Rebuild the relationships cache for a tree, service-role because the
// tree belongs to a real account with no auth session here; user_id
// supplied explicitly. The compute is the same engine the app and the
// compute-relationships edge function run — tier, qualifier, and the
// married-in (distant) rows included. Upsert-then-prune, so there is
// never a zero-rows window for a user browsing mid-rebuild.
//
//   npx tsx scripts/rebuild-relationships.mts <treeId>     the tree's owner pointer, unconditionally
//   npx tsx scripts/rebuild-relationships.mts --pending    every (tree, person, home person) with a pointer and no rows
//
// --pending is the backstop for the edge function (docs/COST_AUDIT_2026-09-19.md
// item 4): compute-relationships walks the whole graph inside one request
// and hits the edge runtime's limit on large trees; the home-person screen
// then records only the pointer for trees over its size cut-off, and this
// worker — on the ops-watch tick — computes the rows within ten minutes.
// Members' pointers (tree_members.home_person_id) are covered the same way.
const args = process.argv.slice(2);
const pendingOnly = args.includes('--pending');
const explicit = args.filter((a) => !a.startsWith('--'));
if (!pendingOnly && explicit.length !== 1) {
  throw new Error('usage: tsx rebuild-relationships.mts <treeId> | --pending');
}

const supabase = createClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
);

type Job = { treeId: string; treeName: string; userId: string; homePersonId: string };

async function ownerJob(treeId: string): Promise<Job> {
  const { data: tree, error } = await supabase
    .from('trees')
    .select('id, name, user_id, home_person_id')
    .eq('id', treeId)
    .single();
  if (error || !tree?.home_person_id) throw error ?? new Error('no home person');
  return { treeId: tree.id, treeName: tree.name, userId: tree.user_id, homePersonId: tree.home_person_id };
}

async function hasRows(job: Job): Promise<boolean> {
  const { count, error } = await supabase
    .from('relationships')
    .select('id', { count: 'exact', head: true })
    .eq('tree_id', job.treeId)
    .eq('user_id', job.userId)
    .eq('home_person_id', job.homePersonId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function pendingJobs(): Promise<Job[]> {
  const { data: trees, error } = await supabase
    .from('trees')
    .select('id, name, user_id, home_person_id')
    .eq('import_status', 'complete')
    .not('home_person_id', 'is', null);
  if (error) throw error;
  const { data: members, error: memberError } = await supabase
    .from('tree_members')
    .select('tree_id, user_id, home_person_id')
    .not('home_person_id', 'is', null);
  if (memberError) throw memberError;
  const nameOf = new Map((trees ?? []).map((t) => [t.id, t.name]));
  const candidates: Job[] = [
    ...(trees ?? []).map((t) => ({ treeId: t.id, treeName: t.name, userId: t.user_id, homePersonId: t.home_person_id! })),
    ...(members ?? [])
      .filter((m) => nameOf.has(m.tree_id))
      .map((m) => ({ treeId: m.tree_id, treeName: nameOf.get(m.tree_id)!, userId: m.user_id, homePersonId: m.home_person_id! })),
  ];
  const jobs: Job[] = [];
  for (const job of candidates) if (!(await hasRows(job))) jobs.push(job);
  return jobs;
}

async function rebuild(job: Job): Promise<void> {
  const started = Date.now();
  console.log(`tree: ${job.treeName} · home person ${job.homePersonId} · user ${job.userId}`);
  const graph = await fetchFamilyGraph(supabase as never, job.treeId);
  console.log(`  graph: ${graph.people.size} people`);

  const rows = computeRelationshipRows(graph, job.homePersonId).map((row) => ({
    tree_id: job.treeId,
    user_id: job.userId,
    home_person_id: job.homePersonId,
    ...row,
  }));
  console.log(`  labelled: ${rows.length}`);

  // What's cached now for this person, to prune anyone who no longer qualifies.
  const before = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error: readErr } = await supabase
      .from('relationships')
      .select('individual_id')
      .eq('tree_id', job.treeId)
      .eq('user_id', job.userId)
      .range(from, from + 999);
    if (readErr) throw readErr;
    for (const row of data ?? []) before.add(row.individual_id);
    if (!data || data.length < 1000) break;
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error: upsertErr } = await supabase
      .from('relationships')
      .upsert(rows.slice(i, i + 500), { onConflict: 'tree_id,user_id,home_person_id,individual_id' });
    if (upsertErr) throw upsertErr;
  }

  const kept = new Set(rows.map((row) => row.individual_id));
  const stale = [...before].filter((id) => !kept.has(id));
  for (let i = 0; i < stale.length; i += 200) {
    const { error: pruneErr } = await supabase
      .from('relationships')
      .delete()
      .eq('tree_id', job.treeId)
      .eq('user_id', job.userId)
      .in('individual_id', stale.slice(i, i + 200));
    if (pruneErr) throw pruneErr;
  }
  // Rows keyed to a previous home person of this user.
  const { error: oldHomeErr } = await supabase
    .from('relationships')
    .delete()
    .eq('tree_id', job.treeId)
    .eq('user_id', job.userId)
    .neq('home_person_id', job.homePersonId);
  if (oldHomeErr) throw oldHomeErr;
  if (stale.length) console.log(`  pruned: ${stale.length} stale rows`);
  console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

const jobs = pendingOnly ? await pendingJobs() : [await ownerJob(explicit[0]!)];
console.log(`${jobs.length} relationship rebuild(s)`);
let failed = 0;
for (const job of jobs) {
  try {
    await rebuild(job);
  } catch (error) {
    failed += 1;
    console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\nDONE — ${jobs.length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
