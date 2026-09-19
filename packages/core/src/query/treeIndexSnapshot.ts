import type { WitnessSupabaseClient } from '../supabase/client.js';
import { indexFromSnapshot, snapshotTreeIndex, type TreeIndexSnapshot } from './offline.js';
import type { TreeIndex } from './treeIndex.js';

/**
 * The tree index as one Storage object (migration 20260919210000,
 * docs/COST_AUDIT_2026-09-19.md item 1).
 *
 * Building the index by paging five tables through PostgREST cost ~25
 * requests and 63 MB of json_agg output on the 61,773-person tree, on
 * every cold session, and it is what the Large compute tier was bought
 * for. The index is a pure function of import-time rows, so it is written
 * once per import to `tree-index/<tree_id>/<stamp>.json` — by the importer
 * (which holds every row it just wrote) or by the build-tree-index worker
 * — and read back as one CDN-served, brotli-compressed request (4.2 MB of
 * JSON came back as 1.0 MB in the 2026-09-19 probe).
 *
 * `trees.index_snapshot_at` is the stamp: the object is trusted only when
 * that stamp is at or after `trees.imported_at`, the same rule the
 * on-device field copy applies. The stamp also names the object, so a
 * reader needs nothing beyond the tree row it already fetches.
 */

export const TREE_INDEX_BUCKET = 'tree-index';

export function treeIndexObjectPath(treeId: string, snapshotAt: string): string {
  return `${treeId}/${Date.parse(snapshotAt)}.json`;
}

export interface TreeIndexStamps {
  imported_at: string | null;
  index_snapshot_at: string | null;
}

/** True when a snapshot exists for this import (not an earlier one of the same tree row). */
export function snapshotIsCurrent(stamps: TreeIndexStamps): stamps is TreeIndexStamps & { index_snapshot_at: string } {
  if (!stamps.index_snapshot_at || !stamps.imported_at) return false;
  return Date.parse(stamps.index_snapshot_at) >= Date.parse(stamps.imported_at);
}

export interface UploadedTreeIndexSnapshot {
  path: string;
  snapshotAt: string;
  /** Uncompressed JSON size, for the log line. */
  bytes: number;
}

/**
 * Writes the snapshot, stamps the tree, then removes the tree's older
 * objects. The stamp goes on only after the upload succeeded, so a reader
 * never resolves a path that is not there; the prune is best-effort.
 * Callers: the owner's own session (storage policy "tree index owner all")
 * or the service-role worker.
 */
export async function uploadTreeIndexSnapshot(
  client: WitnessSupabaseClient,
  treeId: string,
  index: TreeIndex,
): Promise<UploadedTreeIndexSnapshot> {
  const snapshotAt = new Date().toISOString();
  const path = treeIndexObjectPath(treeId, snapshotAt);
  const body = JSON.stringify(snapshotTreeIndex(index, treeId, snapshotAt));

  const { error: uploadError } = await client.storage.from(TREE_INDEX_BUCKET).upload(path, body, {
    contentType: 'application/json',
    cacheControl: '31536000',
    upsert: true,
  });
  if (uploadError) throw new Error(`Uploading the tree index snapshot failed: ${uploadError.message}`);

  const { error: stampError } = await client
    .from('trees')
    .update({ index_snapshot_at: snapshotAt })
    .eq('id', treeId);
  if (stampError) throw new Error(`Stamping the tree index snapshot failed: ${stampError.message}`);

  await pruneTreeIndexObjects(client, treeId, path).catch(() => {});
  return { path, snapshotAt, bytes: body.length };
}

/** Removes every object in the tree's folder except `keepPath` (all of them when null). */
export async function pruneTreeIndexObjects(
  client: WitnessSupabaseClient,
  treeId: string,
  keepPath: string | null,
): Promise<number> {
  const { data: objects, error } = await client.storage.from(TREE_INDEX_BUCKET).list(treeId, { limit: 100 });
  if (error) throw new Error(`Listing tree index objects failed: ${error.message}`);
  const stale = (objects ?? []).map((o) => `${treeId}/${o.name}`).filter((p) => p !== keepPath);
  if (stale.length === 0) return 0;
  const { error: removeError } = await client.storage.from(TREE_INDEX_BUCKET).remove(stale);
  if (removeError) throw new Error(`Removing stale tree index objects failed: ${removeError.message}`);
  return stale.length;
}

/**
 * One request for the whole index: a short-lived signed URL, fetched as
 * JSON so the same code runs on the phone (no Blob.text there) and the
 * web. Throws on any miss; the caller falls back to paging the tables.
 */
export async function downloadTreeIndexSnapshot(
  client: WitnessSupabaseClient,
  treeId: string,
  snapshotAt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TreeIndex> {
  const path = treeIndexObjectPath(treeId, snapshotAt);
  const { data, error } = await client.storage.from(TREE_INDEX_BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    throw new Error(`Signing the tree index snapshot failed: ${error?.message ?? 'no url'}`);
  }
  const response = await fetchImpl(data.signedUrl);
  if (!response.ok) throw new Error(`Tree index snapshot answered HTTP ${response.status}`);
  const snapshot = (await response.json()) as TreeIndexSnapshot;
  if (snapshot?.v !== 1 || snapshot.treeId !== treeId) {
    throw new Error('Tree index snapshot is not this tree');
  }
  return indexFromSnapshot(snapshot);
}
