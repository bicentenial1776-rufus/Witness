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
 * must not reclaim the copy the field trip depends on. Web is out of
 * scope (the field device is a phone) and expo-file-system's File is a
 * warning stub there, so every entry point no-ops off-platform.
 */

const COPIES_DIR = 'field-copies';

function copyFile(treeId: string): File {
  return new File(Paths.document, COPIES_DIR, `${treeId}.json`);
}

export function saveTreeIndexCopy(treeId: string, index: TreeIndex): void {
  if (Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.document, COPIES_DIR);
    if (!dir.exists) dir.create({ intermediates: true });
    const file = copyFile(treeId);
    file.write(JSON.stringify(snapshotTreeIndex(index, treeId, new Date().toISOString())));
  } catch (error) {
    // The copy is a convenience — never let saving it break the live path.
    console.warn('Could not save the field copy', error);
  }
}

export async function loadTreeIndexCopy(treeId: string): Promise<TreeIndex | null> {
  if (Platform.OS === 'web') return null;
  try {
    const file = copyFile(treeId);
    if (!file.exists) return null;
    const snapshot = JSON.parse(await file.text()) as TreeIndexSnapshot;
    if (snapshot.v !== 1 || snapshot.treeId !== treeId) return null;
    return indexFromSnapshot(snapshot);
  } catch (error) {
    console.warn('Could not read the field copy', error);
    return null;
  }
}

/** Copies of deleted trees are garbage — keep only the trees that still exist. */
export function pruneTreeIndexCopies(keepTreeIds: string[]): void {
  if (Platform.OS === 'web') return;
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
