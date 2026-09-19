import {
  downloadTreeIndexSnapshot,
  fetchTreeIndex,
  snapshotIsCurrent,
  uploadTreeIndexSnapshot,
  type TreeIndex,
  type TreeIndexStamps,
} from '@witness/core/query';

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
 * The tree's stamps — the index is built only from import-time tables,
 * so a copy taken at the same imported_at is the same index, and a
 * Storage snapshot stamped at or after it is too. Null when the row
 * cannot be read in time (offline, or a stalled link).
 */
function fetchStamps(treeId: string): Promise<TreeIndexStamps | null> {
  return withTimeout(
    Promise.resolve(
      supabase
        .from('trees')
        .select('imported_at, index_snapshot_at')
        .eq('id', treeId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error;
          return data ?? null;
        }),
    ),
    FIELD_TIMEOUT_MS,
  );
}

/**
 * The live index: the Storage snapshot when one exists for this import
 * (one CDN request instead of ~25 pages and the database's json_agg —
 * docs/COST_AUDIT_2026-09-19.md item 1), else paging the tables.
 */
async function fetchLive(treeId: string, stamps: TreeIndexStamps | null): Promise<TreeIndex> {
  if (stamps && snapshotIsCurrent(stamps)) {
    try {
      return await downloadTreeIndexSnapshot(supabase, treeId, stamps.index_snapshot_at);
    } catch (error) {
      console.warn('Tree index snapshot unavailable, paging the tree instead', error);
    }
  }
  return fetchTreeIndex(supabase, treeId);
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
  const stamps = await fetchStamps(treeId);
  const stamp = stamps?.imported_at ?? null;
  const copy = await copyPromise;
  if (copy && (stamp === null || (copy.stamp !== null && copy.stamp === stamp))) return copy.index;

  const live = fetchLive(treeId, stamps);
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

const settled = new Set<string>();

export function getTreeIndex(treeId: string): Promise<TreeIndex> {
  let pending = cache.get(treeId);
  if (!pending) {
    pending = fetchWithFieldCopy(treeId)
      .then((index) => {
        settled.add(treeId);
        return index;
      })
      .catch((error: unknown) => {
        cache.delete(treeId); // don't cache failures
        throw error;
      });
    cache.set(treeId, pending);
  }
  return pending;
}

/**
 * True once this session holds the tree index — the point at which any
 * index-backed fallback (search, lists) is free rather than a minute.
 */
export function hasTreeIndexInSession(treeId: string): boolean {
  return settled.has(treeId);
}

export function invalidateTreeIndexCache(): void {
  cache.clear();
  settled.clear();
}

/**
 * After an import: the index the importer just built from its own rows
 * becomes this session's copy and the on-device copy at once (the first
 * whole-tree screen opens instantly instead of paging the tree), and is
 * published to Storage so every other session and device reads one object.
 * Never fatal — the build-tree-index worker writes the snapshot within its
 * next tick if this upload is lost.
 */
export async function publishTreeIndex(treeId: string, index: TreeIndex): Promise<void> {
  cache.set(treeId, Promise.resolve(index));
  settled.add(treeId);
  const { data } = await supabase.from('trees').select('imported_at').eq('id', treeId).maybeSingle();
  saveTreeIndexCopy(treeId, index, data?.imported_at ?? null);
  await uploadTreeIndexSnapshot(supabase, treeId, index);
}
