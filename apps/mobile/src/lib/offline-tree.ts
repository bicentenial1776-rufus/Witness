import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  indexFromSnapshot,
  snapshotTreeIndex,
  type TreeIndex,
  type TreeIndexSnapshot,
} from '@witness/core/query';

/**
 * The field copy (SPEC_offline-field-mode.md): the TreeIndex written to
 * disk whenever a live fetch succeeds, so a graveside look-up has a tree
 * to answer from when the connection doesn't. Documents, not cache — iOS
 * must not reclaim the copy the field trip depends on.
 *
 * Since 2026-09-17 the copy also carries the tree's import stamp
 * (trees.imported_at at the time of the fetch). tree-index-cache.ts reads
 * one small row and, when the stamp still matches, answers from the copy
 * without paging the tree at all — on a 61,773-person tree that fetch was
 * a minute of every browser session. On the web the copy lives in
 * IndexedDB (a big tree's index is tens of megabytes; localStorage cannot
 * hold it); on the phone it is the same JSON file as before, now wrapped
 * with the stamp. Old unwrapped files still load, stamped "unknown".
 */

const COPIES_DIR = 'field-copies';

export interface TreeIndexCopy {
  index: TreeIndex;
  /** trees.imported_at when the copy was taken; null when unknown (old copies, or the stamp read failed). */
  stamp: string | null;
}

interface WrappedSnapshot {
  w: 1;
  stamp: string | null;
  snapshot: TreeIndexSnapshot;
}

function unwrap(treeId: string, raw: unknown): TreeIndexCopy | null {
  const wrapped = raw as Partial<WrappedSnapshot> | null;
  const snapshot = (wrapped && wrapped.w === 1 ? wrapped.snapshot : raw) as TreeIndexSnapshot | null;
  if (!snapshot || snapshot.v !== 1 || snapshot.treeId !== treeId) return null;
  return { index: indexFromSnapshot(snapshot), stamp: wrapped?.w === 1 ? (wrapped.stamp ?? null) : null };
}

function wrap(treeId: string, index: TreeIndex, stamp: string | null): WrappedSnapshot {
  return { w: 1, stamp, snapshot: snapshotTreeIndex(index, treeId, new Date().toISOString()) };
}

// ── Web: IndexedDB ─────────────────────────────────────────────────────

const IDB_NAME = 'witness-field-copies';
const IDB_STORE = 'copies';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

function idbRun<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, mode);
        const request = work(tx.objectStore(IDB_STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('IndexedDB transaction failed'));
        };
        tx.onabort = tx.onerror;
      }),
  );
}

let persistRequested = false;
/** Ask the browser not to evict the copies under storage pressure — best effort, once. */
function requestPersistence(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    // Older browsers, private windows: the copy is still useful for one session.
  }
}

// ── Phone: a JSON document per tree ────────────────────────────────────

function copyFile(treeId: string): File {
  return new File(Paths.document, COPIES_DIR, `${treeId}.json`);
}

// ── Entry points ───────────────────────────────────────────────────────

export function saveTreeIndexCopy(treeId: string, index: TreeIndex, stamp: string | null): void {
  if (Platform.OS === 'web') {
    requestPersistence();
    // Structured clone, not JSON — no 30 MB string on the main thread.
    idbRun('readwrite', (store) => store.put(wrap(treeId, index, stamp), treeId)).catch((error) => {
      console.warn('Could not save the field copy', error);
    });
    return;
  }
  try {
    const dir = new Directory(Paths.document, COPIES_DIR);
    if (!dir.exists) dir.create({ intermediates: true });
    copyFile(treeId).write(JSON.stringify(wrap(treeId, index, stamp)));
  } catch (error) {
    // The copy is a convenience — never let saving it break the live path.
    console.warn('Could not save the field copy', error);
  }
}

export async function loadTreeIndexCopy(treeId: string): Promise<TreeIndexCopy | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = await idbRun<unknown>('readonly', (store) => store.get(treeId));
      return raw ? unwrap(treeId, raw) : null;
    }
    const file = copyFile(treeId);
    if (!file.exists) return null;
    return unwrap(treeId, JSON.parse(await file.text()));
  } catch (error) {
    console.warn('Could not read the field copy', error);
    return null;
  }
}

/**
 * Whether a copy exists at all — cheap (a key lookup, not the 24 MB read),
 * for callers deciding whether falling back to the copy is cheap.
 */
export async function hasTreeIndexCopy(treeId: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const key = await idbRun<IDBValidKey | undefined>('readonly', (store) => store.getKey(treeId));
      return key !== undefined;
    }
    return copyFile(treeId).exists;
  } catch {
    return false;
  }
}

/** Copies of deleted trees are garbage — keep only the trees that still exist. */
export function pruneTreeIndexCopies(keepTreeIds: string[]): void {
  if (Platform.OS === 'web') {
    const keep = new Set(keepTreeIds);
    idbRun<IDBValidKey[]>('readonly', (store) => store.getAllKeys())
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => typeof key !== 'string' || !keep.has(key))
            .map((key) => idbRun('readwrite', (store) => store.delete(key))),
        ),
      )
      .catch((error) => console.warn('Could not prune field copies', error));
    return;
  }
  try {
    const dir = new Directory(Paths.document, COPIES_DIR);
    if (!dir.exists) return;
    const keep = new Set(keepTreeIds.map((id) => `${id}.json`));
    for (const entry of dir.list()) {
      if (entry instanceof File && !keep.has(entry.name)) entry.delete();
    }
  } catch (error) {
    console.warn('Could not prune field copies', error);
  }
}

/** Every copy on this device — for sign-out on a shared computer. */
export function clearTreeIndexCopies(): void {
  pruneTreeIndexCopies([]);
}
