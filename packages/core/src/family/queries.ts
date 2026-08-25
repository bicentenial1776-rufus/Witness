import type { WitnessSupabaseClient } from '../supabase/client.js';
import { aliveDuring, type AliveMatch, type YearRange } from '../query/aliveDuring.js';
import { fetchFamilyGraph } from './precompute.js';
import {
  calculateRelationship,
  parentLine,
  type RelationshipResult,
  type RelationshipTier,
} from './relationship.js';
import type { GraphPerson } from './graph.js';

/**
 * Relationship-aware queries. Cached rows (direct ancestors) answer most
 * of these; anything uncached falls back to a live calculation over the
 * family graph.
 */

export interface CachedRelationship {
  individual_id: string;
  label: string;
  tier: RelationshipTier;
  qualifier: string | null;
  generation_distance: number;
  line: string;
  is_direct_ancestor: boolean;
  is_direct_descendant: boolean;
}

/**
 * Which relatives count as "yours" for featuring and family-scoped
 * filters, as a ceiling on the tier: the direct line only, blood
 * relatives including collaterals, or those plus everyone married in.
 * 'all' is the legacy spelling of 'blood' and still reads that way, so a
 * setting chosen before the distant tier existed keeps its meaning.
 */
export type LineageScope = 'direct' | 'blood' | 'distant';

const SCOPE_TIERS: Record<LineageScope, RelationshipTier[]> = {
  direct: ['direct'],
  blood: ['direct', 'blood'],
  distant: ['direct', 'blood', 'distant'],
};

export function tierInScope(tier: RelationshipTier, scope: LineageScope): boolean {
  return SCOPE_TIERS[scope].includes(tier);
}

export function inLineageScope(row: CachedRelationship, scope: LineageScope): boolean {
  return tierInScope(row.tier, scope);
}

const PAGE_SIZE = 1000;

/** Every cached relationship row for the tree, nearest generations first. */
export async function fetchRelationshipRows(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<CachedRelationship[]> {
  const rows: CachedRelationship[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('relationships')
      .select(
        'individual_id, label, tier, qualifier, generation_distance, line, is_direct_ancestor, is_direct_descendant',
      )
      .eq('tree_id', treeId)
      .order('generation_distance')
      .order('individual_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Fetching relationships failed: ${error.message}`);
    // tier is a plain text column with a check constraint; the enum lives
    // in the code rather than in Postgres, so narrow it on the way in.
    rows.push(...(data ?? []).map((row) => ({ ...row, tier: row.tier as RelationshipTier })));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

const fetchCached = fetchRelationshipRows;

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

export interface RelationshipPathPerson {
  id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
}

export interface RelationshipPath {
  label: string;
  /** Home person first, target last — the person-by-person chain. */
  people: RelationshipPathPerson[];
}

/**
 * The full chain behind a relationship label, for display and verification.
 * Cached direct-ancestor rows carry their path; anyone else (cousins,
 * descendants, in-laws) gets a live graph walk. Null when no home person
 * is set or no relationship exists.
 */
export async function getRelationshipPath(
  client: WitnessSupabaseClient,
  treeId: string,
  individualId: string,
): Promise<RelationshipPath | null> {
  let label: string;
  let pathIds: string[];

  const { data: cached } = await client
    .from('relationships')
    .select('label, path')
    .eq('tree_id', treeId)
    .eq('individual_id', individualId)
    .maybeSingle();

  if (cached && Array.isArray(cached.path) && cached.path.length > 0) {
    label = cached.label;
    pathIds = cached.path as string[];
  } else {
    const { data: tree } = await client
      .from('trees')
      .select('home_person_id')
      .eq('id', treeId)
      .single();
    if (!tree?.home_person_id) return null;
    const live = await getRelationship(client, treeId, tree.home_person_id, individualId);
    if (live.confidence === 'none' || live.path.length === 0) return null;
    label = live.label;
    pathIds = live.path;
  }

  const { data: people } = await client
    .from('individuals')
    .select('id, full_name, birth_year, death_year')
    .in('id', pathIds);
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const chain = pathIds
    .map((id) => byId.get(id))
    .filter((p): p is RelationshipPathPerson => Boolean(p));
  return chain.length ? { label, people: chain } : null;
}
