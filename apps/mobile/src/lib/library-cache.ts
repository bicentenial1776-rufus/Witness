import { evaluateLibraryQuery, type LibraryCatalogEntry, type LibraryMatch } from '@witness/core/query';

import { onGeographyInvalidated } from '@/lib/geography-cache';
import { supabase } from '@/lib/supabase';
import { getTreeIndex, invalidateTreeIndexCache } from '@/lib/tree-index-cache';

/**
 * The Query Library's data layer: the server-side catalog (fetched once per
 * session — it changes on our schedule, not the user's), the TreeIndex it
 * evaluates against (one per tree, shared with future structure screens),
 * and memoized per-tree result counts so category and list screens can show
 * live answers without re-running every query on every render.
 */

let catalogPromise: Promise<LibraryCatalogEntry[]> | null = null;

async function fetchCatalog(): Promise<LibraryCatalogEntry[]> {
  const { data, error } = await supabase
    .from('query_catalog')
    .select('id, category, title, detail, keywords, kind, params, sort_order')
    .order('sort_order');
  if (error || !data) {
    catalogPromise = null;
    throw new Error(error?.message ?? 'Catalog fetch failed');
  }
  return data as LibraryCatalogEntry[];
}

export function getCatalog(): Promise<LibraryCatalogEntry[]> {
  if (!catalogPromise) catalogPromise = fetchCatalog();
  return catalogPromise;
}

const countsCache = new Map<string, Promise<Map<string, number>>>();

// The Library used to keep its own copy of the tree index and page the
// tree a second time in a session that already held one; it now shares
// tree-index-cache's (snapshot → field copy → pages).
export { getTreeIndex };

/** Result count per catalog entry id, for this tree. */
export function getLibraryCounts(treeId: string): Promise<Map<string, number>> {
  let pending = countsCache.get(treeId);
  if (!pending) {
    pending = Promise.all([getCatalog(), getTreeIndex(treeId)])
      .then(([catalog, index]) => {
        const counts = new Map<string, number>();
        for (const entry of catalog) {
          counts.set(entry.id, evaluateLibraryQuery(index, entry).length);
        }
        return counts;
      })
      .catch((error: unknown) => {
        countsCache.delete(treeId);
        throw error;
      });
    countsCache.set(treeId, pending);
  }
  return pending;
}

export async function runLibraryQuery(
  treeId: string,
  queryId: string,
): Promise<{ entry: LibraryCatalogEntry; matches: LibraryMatch[] } | null> {
  const [catalog, index] = await Promise.all([getCatalog(), getTreeIndex(treeId)]);
  const entry = catalog.find((e) => e.id === queryId);
  if (!entry) return null;
  return { entry, matches: evaluateLibraryQuery(index, entry) };
}

// A re-import or tree delete invalidates geography — same moment our index
// and counts go stale.
onGeographyInvalidated(() => {
  invalidateTreeIndexCache();
  countsCache.clear();
});

// --- Pins -------------------------------------------------------------------

export async function getPinnedIds(): Promise<Set<string>> {
  const { data } = await supabase.from('library_pins').select('query_id');
  return new Set((data ?? []).map((row) => row.query_id));
}

export async function setPinned(queryId: string, pinned: boolean): Promise<void> {
  if (pinned) {
    await supabase.from('library_pins').insert({ query_id: queryId });
  } else {
    await supabase.from('library_pins').delete().eq('query_id', queryId);
  }
}
