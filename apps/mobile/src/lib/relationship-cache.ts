import {
  fetchRelationshipRows,
  inLineageScope,
  setHomePerson,
  type CachedRelationship,
} from '@witness/core/family';

import { getLineageScope } from '@/lib/lineage-scope';
import { supabase } from '@/lib/supabase';

// One fetch of the tree's pre-computed relationship rows, shared by every
// result list. Two views of it:
//  - getRelationshipMap: individual_id → label ("7th great-grandmother",
//    "2nd cousin 5 times removed") for ALL blood relatives — annotation
//    is information, so it never shrinks with the lineage-scope setting.
//  - getFeaturedIds: who qualifies for featuring (digest, notifications)
//    and "your family" filters, honoring the current lineage scope.
const cache = new Map<string, Promise<CachedRelationship[]>>();

/**
 * Zero rows with a home person set means the precompute never landed
 * (interrupted on-device walks bit the same tree twice, 2026-08-06 and
 * 2026-08-15): the app used to sit wrongly labelless until someone
 * repaired the tree by hand. Recompute instead — server-side, where
 * backgrounding the app can't kill the walk; the on-device compute stays
 * as the offline fallback. The home person id is deliberately not passed:
 * the function reads the current pointer itself. A tree whose home person
 * legitimately has no blood relatives re-runs once per session, but such
 * trees are tiny — the walk is proportionally tiny too.
 */
async function fetchRowsHealingInterruptedPrecompute(
  treeId: string,
): Promise<CachedRelationship[]> {
  const rows = await fetchRelationshipRows(supabase, treeId);
  if (rows.length > 0) return rows;
  const { data: tree } = await supabase
    .from('trees')
    .select('home_person_id')
    .eq('id', treeId)
    .maybeSingle();
  if (!tree?.home_person_id) return rows;
  const { error } = await supabase.functions.invoke('compute-relationships', {
    body: { treeId },
  });
  if (error) await setHomePerson(supabase, treeId, tree.home_person_id);
  return fetchRelationshipRows(supabase, treeId);
}

function getRows(treeId: string): Promise<CachedRelationship[]> {
  let pending = cache.get(treeId);
  if (!pending) {
    pending = fetchRowsHealingInterruptedPrecompute(treeId).catch((error: unknown) => {
      cache.delete(treeId);
      throw error;
    });
    cache.set(treeId, pending);
  }
  return pending;
}

export async function getRelationshipMap(treeId: string): Promise<Map<string, string>> {
  const rows = await getRows(treeId);
  return new Map(rows.map((row) => [row.individual_id, row.label]));
}

/**
 * The full cached row per relative — the label plus the compass fields
 * (generation_distance, line, is_direct_ancestor) the Portrait's identity
 * span reads. Same single fetch as the label map.
 */
export async function getRelationshipDetailMap(
  treeId: string,
): Promise<Map<string, CachedRelationship>> {
  const rows = await getRows(treeId);
  return new Map(rows.map((row) => [row.individual_id, row]));
}

/** The scope is read per call, so flipping the setting applies instantly. */
export async function getFeaturedIds(treeId: string): Promise<Set<string>> {
  const [rows, scope] = await Promise.all([getRows(treeId), getLineageScope()]);
  const ids = new Set<string>();
  for (const row of rows) if (inLineageScope(row, scope)) ids.add(row.individual_id);
  return ids;
}

/** The three lineage tiers, iconed in list views: the direct line, blood
    beyond it (collaterals). Non-blood people have no entry — absence is
    the marker. */
export type LineageTier = 'direct' | 'blood';

export async function getLineageTierMap(treeId: string): Promise<Map<string, LineageTier>> {
  const rows = await getRows(treeId);
  return new Map(
    rows.map((row) => [row.individual_id, inLineageScope(row, 'direct') ? 'direct' : 'blood']),
  );
}

export interface LineageCounts {
  direct: number;
  all: number;
}

/** How many people each lineage scope covers, for the settings UI. */
export async function getLineageCounts(treeId: string): Promise<LineageCounts> {
  const rows = await getRows(treeId);
  let direct = 0;
  for (const row of rows) if (inLineageScope(row, 'direct')) direct += 1;
  return { direct, all: rows.length };
}

/** Call after the home person changes or a tree is imported/deleted. */
export function invalidateRelationshipCache(): void {
  cache.clear();
}
