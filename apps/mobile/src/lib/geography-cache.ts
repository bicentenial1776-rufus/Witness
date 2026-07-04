import { fetchGeographyIndex, type GeographyIndex } from '@witness/core/query';

import { supabase } from '@/lib/supabase';

// The geography index is a few-second fetch over ~20k rows; the places,
// region, and migrations screens all share one copy per tree.
const cache = new Map<string, Promise<GeographyIndex>>();

export function getGeographyIndex(treeId: string): Promise<GeographyIndex> {
  let pending = cache.get(treeId);
  if (!pending) {
    pending = fetchGeographyIndex(supabase, treeId).catch((error: unknown) => {
      cache.delete(treeId); // don't cache failures
      throw error;
    });
    cache.set(treeId, pending);
  }
  return pending;
}

/** Call after any import or tree delete so screens refetch fresh data. */
export function invalidateGeographyCache(): void {
  cache.clear();
}
