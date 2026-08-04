import {
  fetchRelationshipRows,
  inLineageScope,
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

function getRows(treeId: string): Promise<CachedRelationship[]> {
  let pending = cache.get(treeId);
  if (!pending) {
    pending = fetchRelationshipRows(supabase, treeId).catch((error: unknown) => {
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

/** The scope is read per call, so flipping the setting applies instantly. */
export async function getFeaturedIds(treeId: string): Promise<Set<string>> {
  const [rows, scope] = await Promise.all([getRows(treeId), getLineageScope()]);
  const ids = new Set<string>();
  for (const row of rows) if (inLineageScope(row, scope)) ids.add(row.individual_id);
  return ids;
}

/** Call after the home person changes or a tree is imported/deleted. */
export function invalidateRelationshipCache(): void {
  cache.clear();
}
