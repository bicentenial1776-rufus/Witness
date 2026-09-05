import { supabase } from '@/lib/supabase';

const BUCKET = 'tree-media';
const PAGE = 1000;

/**
 * Removes every uploaded photo a tree owned. `delete_tree_batch` cascades
 * the media rows, but the bucket has no cascade from `trees` — without
 * this a deleted tree would leave hundreds of megabytes behind, paid for
 * and unreachable. Call only once the rows are actually gone (the
 * gedcom-vault rule): a half-finished delete is going to be retried, and
 * the photos should still be there when it is.
 */
export async function discardTreeMedia(userId: string, treeId: string): Promise<number> {
  const folder = `${userId}/${treeId}`;
  let removed = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: PAGE });
    if (error) throw new Error(`Could not list tree photos: ${error.message}`);
    const paths = (data ?? []).filter((entry) => entry.id).map((entry) => `${folder}/${entry.name}`);
    if (paths.length === 0) return removed;
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeError) throw new Error(`Could not remove tree photos: ${removeError.message}`);
    removed += paths.length;
    if (paths.length < PAGE) return removed;
  }
}
