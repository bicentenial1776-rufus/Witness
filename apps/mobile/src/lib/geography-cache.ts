import { fetchGeographyExtras, geographyFromTreeIndex, type GeographyIndex } from '@witness/core/query';

import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';

// The geography index is assembled from the session's tree index (already
// fetched for the Tree tab, or read from the saved copy) plus one light
// read of coordinates and grave links — since 2026-09-17. Before, it was
// its own whole-tree fetch of the same people, events and places (~30
// pages on a 61,773-person tree), and Explore's search RPC starved
// behind it. The places, region, map, and migrations screens all share
// one copy per tree.
const cache = new Map<string, Promise<GeographyIndex>>();

// Caches derived from this one (the curated shelf) register here so that
// invalidating geography can never leave a derived cache serving entries
// computed from a stale index.
const dependents: (() => void)[] = [];

export function onGeographyInvalidated(clear: () => void): void {
  dependents.push(clear);
}

export function getGeographyIndex(treeId: string): Promise<GeographyIndex> {
  let pending = cache.get(treeId);
  if (!pending) {
    pending = Promise.all([getTreeIndex(treeId), fetchGeographyExtras(supabase, treeId)])
      .then(([index, extras]) => geographyFromTreeIndex(index, extras))
      .catch((error: unknown) => {
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
  for (const clear of dependents) clear();
}
