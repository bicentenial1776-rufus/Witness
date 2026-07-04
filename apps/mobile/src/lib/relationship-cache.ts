import { fetchRelationshipMap } from '@witness/core/family';

import { supabase } from '@/lib/supabase';

// individual_id → relationship label ("7th great-grandmother"), from the
// pre-computed direct-ancestor cache. Shared by every result list.
const cache = new Map<string, Promise<Map<string, string>>>();

export function getRelationshipMap(treeId: string): Promise<Map<string, string>> {
  let pending = cache.get(treeId);
  if (!pending) {
    pending = fetchRelationshipMap(supabase, treeId).catch((error: unknown) => {
      cache.delete(treeId);
      throw error;
    });
    cache.set(treeId, pending);
  }
  return pending;
}

/** Call after the home person changes or a tree is imported/deleted. */
export function invalidateRelationshipCache(): void {
  cache.clear();
}
