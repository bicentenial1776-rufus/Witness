import './node-polyfills.js';
import { createClient } from '@supabase/supabase-js';
import {
  ancestorDepths,
  calculateRelationship,
  fetchFamilyGraph,
  type FamilyGraph,
} from '../src/family/index.js';
import { loadEnv, requireEnv } from './env.js';
loadEnv();

// Rebuild the relationships cache for a tree whose precompute never landed
// (2026-08-06 import: home person set, zero rows). Service-role because the
// tree belongs to Rufus's real account; user_id supplied explicitly since
// there is no auth session. Logic mirrors setHomePerson() minus the
// delete (nothing to delete) and the trees update (home person is right).
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
const graph: FamilyGraph = await fetchFamilyGraph(supabase as never, tree.id);
console.log(`graph: ${graph.people.size} people`);

// bloodRelativeIds, inlined (private in homePerson.ts).
const homeAncestors = ancestorDepths(graph, tree.home_person_id);
const relativeIds: string[] = [];
for (const person of graph.people.values()) {
  if (person.id === tree.home_person_id) continue;
  if (homeAncestors.has(person.id)) { relativeIds.push(person.id); continue; }
  const theirs = ancestorDepths(graph, person.id);
  if (theirs.has(tree.home_person_id)) { relativeIds.push(person.id); continue; }
  for (const ancestorId of theirs.keys()) {
    if (homeAncestors.has(ancestorId)) { relativeIds.push(person.id); break; }
  }
}
console.log(`blood relatives: ${relativeIds.length}`);

const rows = [];
for (const relativeId of relativeIds) {
  const r = calculateRelationship(graph, tree.home_person_id, relativeId);
  if (!r.isDirectAncestor && !r.isDirectDescendant && !r.isCollateral) continue;
  if (r.confidence === 'none') continue;
  rows.push({
    tree_id: tree.id,
    user_id: tree.user_id,
    home_person_id: tree.home_person_id,
    individual_id: relativeId,
    label: r.label,
    generation_distance: r.generationDistance,
    line: r.line,
    path: r.path,
    is_direct_ancestor: r.isDirectAncestor,
    is_direct_descendant: r.isDirectDescendant,
    is_collateral: r.isCollateral,
  });
}
console.log(`labelled: ${rows.length}`);

// Idempotence: clear anything present, then insert in batches.
await supabase.from('relationships').delete().eq('tree_id', tree.id);
for (let i = 0; i < rows.length; i += 500) {
  const { error: insErr } = await supabase.from('relationships').insert(rows.slice(i, i + 500));
  if (insErr) throw insErr;
}
const { count } = await supabase
  .from('relationships')
  .select('individual_id', { count: 'exact', head: true })
  .eq('tree_id', tree.id);
console.log(`DONE — ${count} relationship rows for ${tree.name}`);
