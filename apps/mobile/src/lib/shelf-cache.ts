import { getCuratedShelf, type ShelfEntry } from '@witness/core/history';

import { getGeographyIndex } from '@/lib/geography-cache';
import { supabase } from '@/lib/supabase';

// The curated shelf is recomputed per tree per calendar month (the month
// is part of the cache key, so a new month naturally re-scores — and with
// it, anniversary labels) and on re-import (invalidated alongside the
// geography cache it is derived from).
const cache = new Map<string, Promise<ShelfEntry[]>>();

export function getShelf(treeId: string): Promise<ShelfEntry[]> {
  const now = new Date();
  const key = `${treeId}:${now.getFullYear()}-${now.getMonth() + 1}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = getGeographyIndex(treeId)
      .then((index) => getCuratedShelf(supabase, treeId, now.getFullYear(), index))
      .catch((error: unknown) => {
        cache.delete(key); // don't cache failures
        throw error;
      });
    cache.set(key, pending);
  }
  return pending;
}

/** Call after any import or tree delete so Explore rebuilds the shelf. */
export function invalidateShelfCache(): void {
  cache.clear();
}
