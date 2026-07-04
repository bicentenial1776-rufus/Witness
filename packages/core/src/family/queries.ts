import type { WitnessSupabaseClient } from '../supabase/client.js';
import { aliveDuring, type AliveMatch, type YearRange } from '../query/aliveDuring.js';
import { fetchFamilyGraph } from './homePerson.js';
import { calculateRelationship, parentLine, type RelationshipResult } from './relationship.js';
import type { GraphPerson } from './graph.js';

/**
 * Relationship-aware queries. Cached rows (direct ancestors) answer most
 * of these; anything uncached falls back to a live calculation over the
 * family graph.
 */

export interface CachedRelationship {
  individual_id: string;
  label: string;
  generation_distance: number;
  line: string;
  is_direct_ancestor: boolean;
}

const PAGE_SIZE = 1000;

async function fetchCached(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<CachedRelationship[]> {
  const rows: CachedRelationship[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('relationships')
      .select('individual_id, label, generation_distance, line, is_direct_ancestor')
      .eq('tree_id', treeId)
      .order('generation_distance')
      .order('individual_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Fetching relationships failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** individual_id → relationship label, for annotating any result list. */
export async function fetchRelationshipMap(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<Map<string, string>> {
  const rows = await fetchCached(client, treeId);
  return new Map(rows.map((row) => [row.individual_id, row.label]));
}

export interface DirectAncestor extends CachedRelationship {
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
}

/** All cached direct ancestors with names, nearest generations first. */
export async function getDirectAncestors(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<DirectAncestor[]> {
  const cached = (await fetchCached(client, treeId)).filter((r) => r.is_direct_ancestor);
  if (!cached.length) return [];

  const names = new Map<string, { full_name: string; birth_year: number | null; death_year: number | null }>();
  const ids = cached.map((r) => r.individual_id);
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const { data, error } = await client
      .from('individuals')
      .select('id, full_name, birth_year, death_year')
      .in('id', ids.slice(i, i + PAGE_SIZE));
    if (error) throw new Error(`Fetching ancestor names failed: ${error.message}`);
    for (const row of data ?? []) names.set(row.id, row);
  }

  return cached.map((row) => ({
    ...row,
    full_name: names.get(row.individual_id)?.full_name ?? 'Unknown',
    birth_year: names.get(row.individual_id)?.birth_year ?? null,
    death_year: names.get(row.individual_id)?.death_year ?? null,
  }));
}

/** e.g. getAncestorsByRelationship(client, treeId, 'grandmother'). */
export async function getAncestorsByRelationship(
  client: WitnessSupabaseClient,
  treeId: string,
  relationshipLabel: string,
): Promise<DirectAncestor[]> {
  const all = await getDirectAncestors(client, treeId);
  const wanted = relationshipLabel.toLowerCase().replace(/s$/, '');
  return all.filter((a) => a.label.toLowerCase() === wanted);
}

/** Chain of mothers from the home person back through time. */
export async function getMaternalLine(
  client: WitnessSupabaseClient,
  treeId: string,
  homePersonId: string,
): Promise<GraphPerson[]> {
  const graph = await fetchFamilyGraph(client, treeId);
  return parentLine(graph, homePersonId, 'mother');
}

/** Chain of fathers from the home person back through time. */
export async function getPaternalLine(
  client: WitnessSupabaseClient,
  treeId: string,
  homePersonId: string,
): Promise<GraphPerson[]> {
  const graph = await fetchFamilyGraph(client, treeId);
  return parentLine(graph, homePersonId, 'father');
}

export interface RelativeAliveMatch extends AliveMatch {
  relationship: string;
}

/** Temporal query filtered to direct ancestors, each with their label. */
export async function getDirectAncestorsAliveAtEvent(
  client: WitnessSupabaseClient,
  treeId: string,
  range: YearRange,
): Promise<RelativeAliveMatch[]> {
  const [result, labels] = await Promise.all([
    aliveDuring(client, treeId, range),
    fetchRelationshipMap(client, treeId),
  ]);
  return result.matches
    .filter((match) => labels.has(match.individual.id))
    .map((match) => ({ ...match, relationship: labels.get(match.individual.id)! }));
}

/**
 * On-demand relationship for anyone not in the cache (collaterals,
 * descendants, in-laws): a live graph walk.
 */
export async function getRelationship(
  client: WitnessSupabaseClient,
  treeId: string,
  homePersonId: string,
  targetId: string,
): Promise<RelationshipResult> {
  const graph = await fetchFamilyGraph(client, treeId);
  return calculateRelationship(graph, homePersonId, targetId);
}
