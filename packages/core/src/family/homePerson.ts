import type { WitnessSupabaseClient } from '../supabase/client.js';
import {
  buildGraphFromRows,
  type FamilyGraph,
  type GraphFamilyChildRow,
  type GraphFamilyRow,
  type GraphIndividualRow,
} from './graph.js';
import { ancestorDepths, calculateRelationship } from './relationship.js';

const PAGE_SIZE = 1000;
const INSERT_BATCH = 500;

async function fetchAll<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Fetching ${label} failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Loads the whole tree's parent/spouse structure into a FamilyGraph. */
export async function fetchFamilyGraph(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<FamilyGraph> {
  const [individuals, families, familyChildren] = await Promise.all([
    fetchAll<GraphIndividualRow>(
      (from, to) =>
        client
          .from('individuals')
          .select('id, full_name, sex, birth_year, death_year, living')
          .eq('tree_id', treeId)
          .order('id')
          .range(from, to),
      'individuals',
    ),
    fetchAll<GraphFamilyRow>(
      (from, to) =>
        client
          .from('families')
          .select('id, husband_id, wife_id')
          .eq('tree_id', treeId)
          .order('id')
          .range(from, to),
      'families',
    ),
    fetchAll<GraphFamilyChildRow & { families: { tree_id: string } | null }>(
      (from, to) =>
        client
          .from('family_children')
          .select('family_id, individual_id, families!inner(tree_id)')
          .eq('families.tree_id', treeId)
          .order('family_id')
          .range(from, to),
      'family children',
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

/**
 * Designates the home person and (by default) pre-computes relationship
 * rows for every direct ancestor. Existing cached relationships for the
 * tree are replaced — a changed home person invalidates all of them.
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

  const { error: clearError } = await client.from('relationships').delete().eq('tree_id', treeId);
  if (clearError) throw new Error(`Clearing old relationships failed: ${clearError.message}`);

  if (options.precompute === false) return { cachedAncestors: 0 };

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');

  const graph = await fetchFamilyGraph(client, treeId);
  const ancestors = ancestorDepths(graph, individualId);
  const ancestorIds = [...ancestors.keys()].filter((id) => id !== individualId);

  const rows = [];
  let computed = 0;
  for (const ancestorId of ancestorIds) {
    const result = calculateRelationship(graph, individualId, ancestorId);
    if (!result.isDirectAncestor) continue; // reachable only as spouse-of-ancestor etc.
    rows.push({
      tree_id: treeId,
      user_id: userId,
      home_person_id: individualId,
      individual_id: ancestorId,
      label: result.label,
      generation_distance: result.generationDistance,
      line: result.line,
      path: result.path,
      is_direct_ancestor: true,
      is_direct_descendant: false,
      is_collateral: false,
    });
    computed += 1;
    options.onProgress?.(computed, ancestorIds.length);
  }

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error } = await client.from('relationships').insert(rows.slice(i, i + INSERT_BATCH));
    if (error) throw new Error(`Caching relationships failed: ${error.message}`);
  }

  return { cachedAncestors: rows.length };
}
