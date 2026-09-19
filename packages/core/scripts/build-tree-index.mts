import './node-polyfills.js';
import { createWitnessClient } from '../src/supabase/client.js';
import {
  fetchTreeIndex,
  pruneTreeIndexObjects,
  TREE_INDEX_BUCKET,
  uploadTreeIndexSnapshot,
} from '../src/query/index.js';
import { loadEnv, requireEnv } from './env.js';
loadEnv();

// Tree index snapshots (migration 20260919210000): one Storage object per
// import, so no session pages the whole tree. The importer writes its own
// snapshot at the end of an upload; this worker covers trees imported by
// other means (operator scripts, older app builds) and prunes the folders
// of trees that no longer exist. Service-role, from the ops-watch tick.
//
//   npx tsx scripts/build-tree-index.mts --pending      every complete tree whose snapshot is missing or older than its import
//   npx tsx scripts/build-tree-index.mts <treeId> [...]   specific trees, unconditionally
const args = process.argv.slice(2);
const pendingOnly = args.includes('--pending');
const explicit = args.filter((a) => !a.startsWith('--'));
if (!pendingOnly && explicit.length === 0) {
  throw new Error('usage: build-tree-index.mts --pending | <treeId> [...]');
}

const supabase = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
);

type TreeRow = { id: string; name: string; individual_count: number };

async function listTrees(): Promise<{ all: TreeRow[]; pending: TreeRow[] }> {
  const { data, error } = await supabase
    .from('trees')
    .select('id, name, individual_count, import_status, imported_at, index_snapshot_at')
    .order('imported_at', { ascending: true });
  if (error) throw new Error(`Listing trees failed: ${error.message}`);
  const all = (data ?? []).map(({ id, name, individual_count }) => ({ id, name, individual_count }));
  const pending = (data ?? [])
    .filter(
      (t) =>
        t.import_status === 'complete' &&
        (!t.index_snapshot_at || new Date(t.index_snapshot_at) < new Date(t.imported_at)),
    )
    .map(({ id, name, individual_count }) => ({ id, name, individual_count }));
  return { all, pending };
}

async function buildTree(tree: TreeRow): Promise<void> {
  const started = Date.now();
  console.log(`${tree.name} (${tree.individual_count.toLocaleString()} people, ${tree.id})`);
  const index = await fetchTreeIndex(supabase, tree.id);
  const fetched = Date.now();
  const result = await uploadTreeIndexSnapshot(supabase, tree.id, index);
  console.log(
    `  ${(result.bytes / 1_000_000).toFixed(1)} MB → ${result.path} (fetch ${((fetched - started) / 1000).toFixed(1)}s, upload ${((Date.now() - fetched) / 1000).toFixed(1)}s)`,
  );
}

/** Folders in the bucket for trees that no longer exist — deletions never reach Storage. */
async function pruneOrphanFolders(all: TreeRow[]): Promise<void> {
  const { data: folders, error } = await supabase.storage.from(TREE_INDEX_BUCKET).list('', { limit: 1000 });
  if (error) {
    console.warn(`  could not list the bucket: ${error.message}`);
    return;
  }
  const live = new Set(all.map((t) => t.id));
  for (const folder of folders ?? []) {
    if (live.has(folder.name)) continue;
    try {
      const removed = await pruneTreeIndexObjects(supabase, folder.name, null);
      if (removed) console.log(`  pruned ${removed} object(s) of deleted tree ${folder.name}`);
    } catch (error) {
      console.warn(`  prune of ${folder.name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const { all, pending } = await listTrees();
const trees = pendingOnly ? pending : all.filter((t) => explicit.includes(t.id));
console.log(`${trees.length} tree(s) to snapshot`);
let failed = 0;
for (const tree of trees) {
  try {
    await buildTree(tree);
  } catch (error) {
    failed += 1;
    console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (pendingOnly) await pruneOrphanFolders(all);
console.log(`\nDONE — ${trees.length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
