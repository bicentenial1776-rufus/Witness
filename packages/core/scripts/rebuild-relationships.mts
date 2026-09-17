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
const TREE = process.argv[2];
if (!TREE) throw new Error('usage: tsx rebuild-relationships.mts <treeId>');

const supabase = createClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
);

const { data: tree, error } = await supabase
  .from('trees')
  .select('id, name, user_id, home_person_id')
  .eq('id', TREE)
  .single();
if (error || !tree?.home_person_id) throw error ?? new Error('no home person');

console.log(`tree: ${tree.name} · home person ${tree.home_person_id}`);
const graph = await fetchFamilyGraph(supabase as never, tree.id);
console.log(`graph: ${graph.people.size} people`);

const rows = computeRelationshipRows(graph, tree.home_person_id).map((row) => ({
  tree_id: tree.id,
  user_id: tree.user_id,
  home_person_id: tree.home_person_id,
  ...row,
}));
console.log(`labelled: ${rows.length}`);

// What's cached now, to prune anyone who no longer qualifies.
const before = new Set<string>();
for (let from = 0; ; from += 1000) {
  const { data, error: readErr } = await supabase
    .from('relationships')
    .select('individual_id')
    .eq('tree_id', tree.id)
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
    .eq('tree_id', tree.id)
    .in('individual_id', stale.slice(i, i + 200));
  if (pruneErr) throw pruneErr;
}
if (stale.length) console.log(`pruned: ${stale.length} stale rows`);

const { count } = await supabase
  .from('relationships')
  .select('individual_id', { count: 'exact', head: true })
  .eq('tree_id', tree.id);
console.log(`DONE — ${count} relationship rows for ${tree.name}`);
