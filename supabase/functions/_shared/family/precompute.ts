// Mirrored from packages/core/src/family/precompute.ts — keep in sync
// (portSync.test.ts enforces byte equality outside this header).

import { buildGraphFromRows, type FamilyGraph, type GraphFamilyChildRow, type GraphFamilyRow, type GraphIndividualRow } from './graph.ts';
import {
  bloodWithin,
  calculateRelationship,
  ancestorDepths,
  relationshipContext,
  type LinkQualifier,
  type RelationshipTier,
} from './relationship.ts';
import { fetchAllPages, PAGE_SIZE, seekAfter } from './paginate.ts';

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
      (after) => {
        let q = client
          .from('individuals')
          .select('id, full_name, sex, birth_year, death_year, living')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching individuals failed',
    ),
    fetchAllPages<GraphFamilyRow>(
      (after) => {
        let q = client
          .from('families')
          .select('id, husband_id, wife_id')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching families failed',
    ),
    fetchAllPages<GraphFamilyChildRow & { families: { tree_id: string } | null }>(
      (after) => {
        let q = client
          .from('family_children')
          .select('family_id, individual_id, father_relation, mother_relation, families!inner(tree_id)')
          .eq('families.tree_id', treeId)
          .order('family_id')
          .order('individual_id')
          .limit(PAGE_SIZE);
        if (after) q = seekAfter(q, ['family_id', 'individual_id'], [after.family_id, after.individual_id]);
        return q;
      },
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

/** How far up or down the line a step junction may sit (mirrors the labeler). */
const STEP_NEAR_MAX = 2;
/** How many blood steps past the marriage edge still read as family. */
const STEP_FAR_MAX = 2;

/**
 * Candidates for a married-in reading: the spouses of every blood
 * relative (married into your line), every blood relative of your own
 * spouses, and the close blood of whoever married into your near line
 * (step-family). A superset — the labeler makes the final call — but a
 * far tighter one than "everyone in the tree".
 */
function affinityCandidateIds(graph: FamilyGraph, homeId: string, blood: string[]): string[] {
  const candidates = new Set<string>();
  const home = graph.people.get(homeId);
  if (!home) return [];

  for (const id of blood) {
    for (const spouseId of graph.people.get(id)?.spouses ?? []) candidates.add(spouseId);
  }
  for (const spouseId of home.spouses) {
    for (const id of bloodRelativeIds(graph, spouseId)) candidates.add(id);
  }
  // Step-family: the near line, whoever married into it, and their own
  // close blood.
  for (const nearId of bloodWithin(graph, homeId, STEP_NEAR_MAX)) {
    for (const middleId of graph.people.get(nearId)?.spouses ?? []) {
      for (const id of bloodWithin(graph, middleId, STEP_FAR_MAX)) candidates.add(id);
    }
  }
  candidates.delete(homeId);
  return [...candidates];
}

/** A computed relationship row, minus the ownership columns the caller stamps. */
export interface PrecomputedRelationship {
  individual_id: string;
  label: string;
  tier: RelationshipTier;
  qualifier: LinkQualifier | null;
  generation_distance: number;
  line: string;
  path: string[];
  is_direct_ancestor: boolean;
  is_direct_descendant: boolean;
  is_collateral: boolean;
}

/**
 * Labels everyone the home person is connected to — blood and married-in
 * alike. People who resolve to no relationship store no row at all: the
 * absence is the reading (witness-relationship-taxonomy-spec.md §2).
 */
export function computeRelationshipRows(
  graph: FamilyGraph,
  homeId: string,
  onProgress?: (computed: number, total: number) => void,
): PrecomputedRelationship[] {
  const blood = bloodRelativeIds(graph, homeId);
  const seen = new Set(blood);
  const relativeIds = [...blood];
  for (const id of affinityCandidateIds(graph, homeId, blood)) {
    if (seen.has(id)) continue;
    seen.add(id);
    relativeIds.push(id);
  }

  const context = relationshipContext(graph, homeId);
  const rows: PrecomputedRelationship[] = [];
  let computed = 0;
  for (const relativeId of relativeIds) {
    const result = calculateRelationship(graph, homeId, relativeId, context);
    computed += 1;
    onProgress?.(computed, relativeIds.length);
    if (result.tier === 'none' || result.confidence === 'none') continue;
    rows.push({
      individual_id: relativeId,
      label: result.label,
      tier: result.tier,
      qualifier: result.qualifier,
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
