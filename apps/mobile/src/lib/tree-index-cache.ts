import { fetchTreeIndex, type TreeIndex } from '@witness/core/query';

import { loadTreeIndexCopy, saveTreeIndexCopy } from '@/lib/offline-tree';
import { supabase } from '@/lib/supabase';

// One tree index per tree per session — the Family Stage and future
// home-screen views share the copy.
const cache = new Map<string, Promise<TreeIndex>>();

// On one bar of LTE requests hang rather than fail, so the field copy
// steps in on a short fuse, not only on a hard error
// (SPEC_offline-field-mode.md).
const FIELD_TIMEOUT_MS = 4000;

/**
 * Live fetch first; the saved field copy answers when the network fails
 * or stalls. A live success refreshes the copy on disk either way, so the
 * next signal-less visit reads the newest tree this device has seen.
 */
async function fetchWithFieldCopy(treeId: string): Promise<TreeIndex> {
  const live = fetchTreeIndex(supabase, treeId);
  live.then((index) => saveTreeIndexCopy(treeId, index)).catch(() => {});

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

  const copy = await loadTreeIndexCopy(treeId);
  if (copy) return copy;
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
