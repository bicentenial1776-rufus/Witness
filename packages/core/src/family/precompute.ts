// Mirrored at supabase/functions/_shared/family/precompute.ts — keep in sync
// (portSync.test.ts enforces byte equality outside this header).

import { buildGraphFromRows, type FamilyGraph, type GraphFamilyChildRow, type GraphFamilyRow, type GraphIndividualRow } from './graph.js';
import { ancestorDepths, calculateRelationship } from './relationship.js';
import { fetchAllPages } from '../supabase/paginate.js';

/**
 * The relationship precompute, kept free of app/server specifics so the
 * same file runs on device and in the Deno edge function: the client is
 * typed structurally (any supabase-js client satisfies it), and rows come
 * back unstamped — the caller adds tree_id/user_id/home_person_id.
 */
type DbClient = { from(table: string): any };

/** Loads the whole tree's parent/spouse structure into a FamilyGraph. */
export async function fetchFamilyGraph(client: DbClient, treeId: string): Promise<FamilyGraph> {
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

/**
 * Candidate blood relatives of homeId: everyone reachable by descending
 * child-links from any of the home person's ancestors (the home person
 * included), plus those ancestors themselves. One upward BFS + one
 * downward BFS — O(people + links) — where the old shape re-walked
 * ancestorDepths for all ~5k people. Child-links are a superset of
 * parent-links (wire() keeps every family's children even when a parent
 * slot was already claimed), so this can surface a few extra candidates;
 * they resolve as non-blood in calculateRelationship and are filtered by
 * the caller — the final row set is identical (precompute.test.ts).
 */
export function bloodRelativeIds(graph: FamilyGraph, homeId: string): string[] {
  const visited = new Set<string>(ancestorDepths(graph, homeId).keys());
  let frontier = [...visited];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      const person = graph.people.get(id);
      if (!person) continue;
      for (const childId of person.children) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        next.push(childId);
      }
    }
    frontier = next;
  }
  visited.delete(homeId);
  return [...visited];
}

/** A computed relationship row, minus the ownership columns the caller stamps. */
export interface PrecomputedRelationship {
  individual_id: string;
  label: string;
  generation_distance: number;
  line: string;
  path: string[];
  is_direct_ancestor: boolean;
  is_direct_descendant: boolean;
  is_collateral: boolean;
}

/** Labels every blood relative of homeId. */
export function computeRelationshipRows(
  graph: FamilyGraph,
  homeId: string,
  onProgress?: (computed: number, total: number) => void,
): PrecomputedRelationship[] {
  const relativeIds = bloodRelativeIds(graph, homeId);
  const homeAncestors = ancestorDepths(graph, homeId);
  const rows: PrecomputedRelationship[] = [];
  let computed = 0;
  for (const relativeId of relativeIds) {
    const result = calculateRelationship(graph, homeId, relativeId, homeAncestors);
    computed += 1;
    onProgress?.(computed, relativeIds.length);
    // Blood only: the prefilter can surface people the labeler resolves
    // as in-laws (spouse links win over distant blood); skip non-blood.
    if (!result.isDirectAncestor && !result.isDirectDescendant && !result.isCollateral) continue;
    if (result.confidence === 'none') continue;
    rows.push({
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
  return rows;
}
