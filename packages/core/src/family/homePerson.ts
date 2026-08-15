import type { WitnessSupabaseClient } from '../supabase/client.js';
import { computeRelationshipRows, fetchFamilyGraph } from './precompute.js';

const INSERT_BATCH = 500;

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
 * rows for every blood relative — direct ancestors, descendants, and
 * collaterals (cousins, uncles/aunts), each with its label and path.
 *
 * Upsert-then-prune, not delete-then-insert: new rows land keyed to the
 * new home person (no collision with the old set), and rows for any other
 * home person are pruned only afterwards. So there is never a zero-rows
 * window — an interrupted run (the app backgrounded mid-walk, 2026-08-06
 * and 2026-08-15) leaves either the old rows intact or a partial new set
 * the self-heal converges on next launch. Upsert with DO UPDATE also
 * means a re-run refreshes stale labels after algorithm fixes, and two
 * concurrent runs converge instead of colliding on the unique key. The
 * prune keys off a re-read of trees.home_person_id so a racing run that
 * changed the home person after us wins.
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
  const rows = computeRelationshipRows(graph, individualId, options.onProgress).map((row) => ({
    tree_id: treeId,
    user_id: userId,
    home_person_id: individualId,
    ...row,
  }));

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error } = await client
      .from('relationships')
      .upsert(rows.slice(i, i + INSERT_BATCH), {
        onConflict: 'tree_id,home_person_id,individual_id',
      });
    if (error) throw new Error(`Caching relationships failed: ${error.message}`);
  }

  const { data: treeNow } = await client
    .from('trees')
    .select('home_person_id')
    .eq('id', treeId)
    .maybeSingle();
  const currentHome = treeNow?.home_person_id ?? individualId;
  const { error: pruneError } = await client
    .from('relationships')
    .delete()
    .eq('tree_id', treeId)
    .neq('home_person_id', currentHome);
  if (pruneError) throw new Error(`Pruning old relationships failed: ${pruneError.message}`);

  return { cachedAncestors: rows.length };
}
