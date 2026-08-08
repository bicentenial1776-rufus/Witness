import type { WitnessSupabaseClient } from '../supabase/client.js';
import { fetchAllPages } from '../supabase/paginate.js';
import {
  buildGraphFromRows,
  type FamilyGraph,
  type GraphFamilyChildRow,
  type GraphFamilyRow,
  type GraphIndividualRow,
} from './graph.js';
import { ancestorDepths, calculateRelationship } from './relationship.js';

const INSERT_BATCH = 500;

/** Loads the whole tree's parent/spouse structure into a FamilyGraph. */
export async function fetchFamilyGraph(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<FamilyGraph> {
  const [individuals, families, familyChildren] = await Promise.all([
    fetchAllPages<GraphIndividualRow>(
      (from, to) =>
        client
          .from('individuals')
          .select('id, full_name, sex, birth_year, death_year, living')
          .eq('tree_id', treeId)
          .order('id')
          .range(from, to),
      'Fetching individuals failed',
    ),
    fetchAllPages<GraphFamilyRow>(
      (from, to) =>
        client
          .from('families')
          .select('id, husband_id, wife_id')
          .eq('tree_id', treeId)
          .order('id')
          .range(from, to),
      'Fetching families failed',
    ),
    fetchAllPages<GraphFamilyChildRow & { families: { tree_id: string } | null }>(
      (from, to) =>
        client
          .from('family_children')
          .select('family_id, individual_id, families!inner(tree_id)')
          .eq('families.tree_id', treeId)
          .order('family_id')
          .order('individual_id')
          .range(from, to),
      'Fetching family children failed',
    ),
  ]);
  return buildGraphFromRows(individuals, families, familyChildren);
}

export interface HomePersonCandidate {
  id: string;
  full_name: string;
  birth_year: number | null;
  living: boolean;
}

/**
 * Pure heuristic shared by the DB-backed suggestHomePerson: the living
 * person with the most recent birth year, falling back to the most
 * recent birth overall.
 */
export function pickHomePersonCandidate(
  people: Iterable<{ id: string; name: string; birthYear: number | null; living: boolean }>,
): { id: string; name: string; birthYear: number | null; living: boolean } | null {
  let bestLiving: { id: string; name: string; birthYear: number | null; living: boolean } | null = null;
  let bestAny: { id: string; name: string; birthYear: number | null; living: boolean } | null = null;
  for (const person of people) {
    if (person.birthYear === null) continue;
    if (!bestAny || person.birthYear > (bestAny.birthYear ?? -Infinity)) bestAny = person;
    if (person.living && (!bestLiving || person.birthYear > (bestLiving.birthYear ?? -Infinity))) {
      bestLiving = person;
    }
  }
  return bestLiving ?? bestAny;
}

/**
 * The most likely home person: the living individual with the most recent
 * birth year. Falls back to the most recent birth overall when the tree
 * flags nobody as living.
 */
export async function suggestHomePerson(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<HomePersonCandidate | null> {
  const { data: living } = await client
    .from('individuals')
    .select('id, full_name, birth_year, living')
    .eq('tree_id', treeId)
    .eq('living', true)
    .not('birth_year', 'is', null)
    .order('birth_year', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (living) return living;

  const { data: fallback } = await client
    .from('individuals')
    .select('id, full_name, birth_year, living')
    .eq('tree_id', treeId)
    .not('birth_year', 'is', null)
    .order('birth_year', { ascending: false })
    .limit(1)
    .maybeSingle();
  return fallback;
}

export interface SetHomePersonOptions {
  /** Skip the relationship precompute (it can be run separately). */
  precompute?: boolean;
  onProgress?: (computed: number, total: number) => void;
}

/** All blood relatives of homeId: ancestors, descendants, and anyone
 *  sharing an ancestor. Cheap set-intersection prefilter so the heavier
 *  per-person labeling only runs on actual relatives. */
function bloodRelativeIds(graph: FamilyGraph, homeId: string): string[] {
  const homeAncestors = ancestorDepths(graph, homeId);
  const ids: string[] = [];
  for (const person of graph.people.values()) {
    if (person.id === homeId) continue;
    if (homeAncestors.has(person.id)) {
      ids.push(person.id);
      continue;
    }
    const theirs = ancestorDepths(graph, person.id);
    if (theirs.has(homeId)) {
      ids.push(person.id); // descendant
      continue;
    }
    for (const ancestorId of theirs.keys()) {
      if (homeAncestors.has(ancestorId)) {
        ids.push(person.id); // collateral
        break;
      }
    }
  }
  return ids;
}

/**
 * Designates the home person and (by default) pre-computes relationship
 * rows for every blood relative — direct ancestors, descendants, and
 * collaterals (cousins, uncles/aunts), each with its label and path.
 * Existing cached relationships for the tree are replaced — a changed
 * home person invalidates all of them.
 */
export async function setHomePerson(
  client: WitnessSupabaseClient,
  treeId: string,
  individualId: string,
  options: SetHomePersonOptions = {},
): Promise<{ cachedAncestors: number }> {
  const { error: updateError } = await client
    .from('trees')
    .update({ home_person_id: individualId })
    .eq('id', treeId);
  if (updateError) throw new Error(`Setting home person failed: ${updateError.message}`);

  if (options.precompute === false) {
    // Explicit opt-out still clears the stale cache — the old rows describe
    // the old home person.
    const { error } = await client.from('relationships').delete().eq('tree_id', treeId);
    if (error) throw new Error(`Clearing old relationships failed: ${error.message}`);
    return { cachedAncestors: 0 };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');

  const graph = await fetchFamilyGraph(client, treeId);
  const relativeIds = bloodRelativeIds(graph, individualId);

  const rows = [];
  let computed = 0;
  for (const relativeId of relativeIds) {
    const result = calculateRelationship(graph, individualId, relativeId);
    computed += 1;
    options.onProgress?.(computed, relativeIds.length);
    // Blood only: the prefilter can surface people the labeler resolves
    // as in-laws (spouse links win over distant blood); skip non-blood.
    if (!result.isDirectAncestor && !result.isDirectDescendant && !result.isCollateral) continue;
    if (result.confidence === 'none') continue;
    rows.push({
      tree_id: treeId,
      user_id: userId,
      home_person_id: individualId,
      individual_id: relativeId,
      label: result.label,
      generation_distance: result.generationDistance,
      line: result.line,
      path: result.path,
      is_direct_ancestor: result.isDirectAncestor,
      is_direct_descendant: result.isDirectDescendant,
      is_collateral: result.isCollateral,
    });
  }

  // Compute-then-swap: the old rows are cleared only once the replacements
  // exist. The old order deleted FIRST, so an interrupted compute — the app
  // backgrounded mid-walk on a large tree — left zero rows and silently
  // stripped every lineage mark, relationship label, and scope count until
  // someone noticed (2026-08-08, Rufus's 08-06 import, on device).
  const { error: clearError } = await client.from('relationships').delete().eq('tree_id', treeId);
  if (clearError) throw new Error(`Clearing old relationships failed: ${clearError.message}`);

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error } = await client.from('relationships').insert(rows.slice(i, i + INSERT_BATCH));
    if (error) throw new Error(`Caching relationships failed: ${error.message}`);
  }

  return { cachedAncestors: rows.length };
}
