import { fetchTreeIndex, type TreeIndex } from '@witness/core/query';

import { supabase } from '@/lib/supabase';

// One tree index per tree per session — the Family Stage and future
// home-screen views share the copy.
const cache = new Map<string, Promise<TreeIndex>>();

export function getTreeIndex(treeId: string): Promise<TreeIndex> {
  let pending = cache.get(treeId);
  if (!pending) {
    pending = fetchTreeIndex(supabase, treeId).catch((error: unknown) => {
      cache.delete(treeId); // don't cache failures
      throw error;
    });
    cache.set(treeId, pending);
  }
  return pending;
}

export function invalidateTreeIndexCache(): void {
  cache.clear();
}
