import { fetchTreeIndex, type TreeIndex } from '@witness/core/query';

import { loadTreeIndexCopy, saveTreeIndexCopy, type TreeIndexCopy } from '@/lib/offline-tree';
import { supabase } from '@/lib/supabase';

// One tree index per tree per session — the Family Stage and future
// home-screen views share the copy.
const cache = new Map<string, Promise<TreeIndex>>();

// On one bar of LTE requests hang rather than fail, so the field copy
// steps in on a short fuse, not only on a hard error
// (SPEC_offline-field-mode.md).
const FIELD_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * The tree's import stamp — the index is built only from import-time
 * tables, so a copy taken at the same imported_at is the same index.
 * Null when the row cannot be read in time (offline, or a stalled link).
 */
function fetchStamp(treeId: string): Promise<string | null> {
  return withTimeout(
    Promise.resolve(
      supabase
        .from('trees')
        .select('imported_at')
        .eq('id', treeId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error;
          return data?.imported_at ?? null;
        }),
    ),
    FIELD_TIMEOUT_MS,
  );
}

/**
 * The saved copy answers first when it is current: one small row instead
 * of paging the whole tree (a minute per browser session on a 61,773-
 * person tree, 2026-09-17). Otherwise live fetch, which refreshes the
 * copy; if the live fetch stalls, whatever copy exists — current or not —
 * steps in, exactly as the field mode always did. With no stamp readable
 * at all (offline) the copy answers straight away.
 */
async function fetchWithFieldCopy(treeId: string): Promise<TreeIndex> {
  const copyPromise: Promise<TreeIndexCopy | null> = loadTreeIndexCopy(treeId);
  const stamp = await fetchStamp(treeId);
  const copy = await copyPromise;
  if (copy && (stamp === null || (copy.stamp !== null && copy.stamp === stamp))) return copy.index;

  const live = fetchTreeIndex(supabase, treeId);
  live.then((index) => saveTreeIndexCopy(treeId, index, stamp)).catch(() => {});

  const first = await Promise.race([
    live.then(
      (index) => ({ settled: true as const, index }),
      () => ({ settled: true as const, index: null }),
    ),
    new Promise<{ settled: false }>((resolve) =>
      setTimeout(() => resolve({ settled: false }), FIELD_TIMEOUT_MS),
    ),
  ]);
  if (first.settled && first.index) return first.index;
  if (copy) return copy.index;
  // No copy on disk: the live fetch — however slow, however doomed — is
  // still the only answer there is.
  return live;
}

export function getTreeIndex(treeId: string): Promise<TreeIndex> {
  let pending = cache.get(treeId);
  if (!pending) {
    pending = fetchWithFieldCopy(treeId).catch((error: unknown) => {
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
