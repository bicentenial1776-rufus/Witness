import { curateShelf, type ShelfEntry } from '@witness/core/history';

import { getEventLibrary } from '@/lib/event-library';
import { getGeographyIndex, onGeographyInvalidated } from '@/lib/geography-cache';

// The curated shelf is recomputed per tree per calendar month (the month
// is part of the cache key, so a new month naturally re-scores — and with
// it, anniversary labels) and on re-import: the shelf derives from the
// geography index, so invalidating geography clears it too.
const cache = new Map<string, Promise<ShelfEntry[]>>();

onGeographyInvalidated(() => cache.clear());

export function getShelf(treeId: string): Promise<ShelfEntry[]> {
  const now = new Date();
  const key = `${treeId}:${now.getFullYear()}-${now.getMonth() + 1}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = Promise.all([getEventLibrary(), getGeographyIndex(treeId)])
      .then(([events, index]) => curateShelf(events, index, now.getFullYear()))
      .catch((error: unknown) => {
        cache.delete(key); // don't cache failures
        throw error;
      });
    cache.set(key, pending);
  }
  return pending;
}
