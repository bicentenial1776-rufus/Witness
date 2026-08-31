import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { useSession } from '@/auth/session-provider';
import { invalidateRelationshipCache } from '@/lib/relationship-cache';
import { pruneTreeIndexCopies } from '@/lib/offline-tree';
import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';

/**
 * The signed-in user's trees, shared app-wide so tab screens don't need
 * treeId route params. Detail screens still take treeId params — deep links
 * (like the digest notification) must keep working without this context.
 *
 * Which tree is "active" is the user's choice, remembered per account. Before
 * anyone chooses, it falls back to the richest tree. That fallback used to be
 * the whole story, and with more than one tree it meant every unparameterised
 * screen — Explore's search, Register, Archives, Orphan Records — silently
 * covered one tree and gave no hint the others existed.
 */

const SELECTED_KEY = 'witness.selectedTreeId';
const TREE_LIST_KEY = 'witness.treeList';

function storageKey(userId: string): string {
  return `${SELECTED_KEY}.${userId}`;
}

function treeListKey(userId: string): string {
  return `${TREE_LIST_KEY}.${userId}`;
}

export interface TreeRow {
  id: string;
  name: string;
  individual_count: number;
  family_count: number;
  place_count: number;
  imported_at: string;
  gedcom_path: string | null;
  gedcom_bytes: number | null;
  home_person_id: string | null;
  home_person: { full_name: string } | null;
  /** Set when this tree arrived via GEDCOM Refresh — it inherits its history. */
  refreshed_from: string | null;
}

interface ActiveTreeContextValue {
  trees: TreeRow[] | null;
  activeTree: TreeRow | undefined;
  /** The last load failed. Not the same as having no trees — say so differently. */
  loadFailed: boolean;
  /** Remember this tree as the active one for this account. */
  selectTree: (treeId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ActiveTreeContext = createContext<ActiveTreeContextValue>({
  trees: null,
  activeTree: undefined,
  loadFailed: false,
  selectTree: async () => {},
  refresh: async () => {},
});

/**
 * "You have no trees" and "we couldn't fetch your trees" look identical to a
 * reader and mean opposite things — the second one has lost nothing. A dropped
 * connection, or a schema the app is briefly ahead of, must never read as an
 * empty account.
 */
export function noTreeMessage(loadFailed: boolean, purpose: string): string {
  return loadFailed
    ? 'Couldn’t reach your trees just now — nothing has been lost. This will retry when you come back.'
    : `Import a tree ${purpose}.`;
}

export function ActiveTreeProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id;
  const [trees, setTrees] = useState<TreeRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const homePersons = useRef(new Map<string, string | null>());

  const refresh = useCallback(async () => {
    // Owned trees only, by explicit filter: family-sharing membership
    // policies make an unfiltered select also return trees SHARED with
    // this account, and the recount/delete loops downstream of this list
    // must never see a tree the user doesn't own. The switcher learns
    // about shared trees deliberately in sharing phase 2.
    const { data, error } = await supabase
      .from('trees')
      .select(
        'id, name, individual_count, family_count, place_count, imported_at, gedcom_path, gedcom_bytes, home_person_id, refreshed_from, home_person:individuals!trees_home_person_id_fkey(full_name)',
      )
      .eq('user_id', userId ?? '')
      .order('imported_at', { ascending: false });
    if (error) {
      // Leave `trees` exactly as it was. Blanking it on a failed fetch made a
      // network blip indistinguishable from a deleted account: every screen
      // fell back to its "import a tree" empty state while the data sat safely
      // on the server.
      console.warn('Could not load trees', error.message);
      setLoadFailed(true);
      // With nothing in memory at all, the saved list is what lets the app
      // stand up in the field (SPEC_offline-field-mode.md) — every screen
      // needs an activeTree before it can even reach the saved tree copy.
      // loadFailed stays true: this data is real, but it is yesterday's.
      if (userId) {
        try {
          const stored = await AsyncStorage.getItem(treeListKey(userId));
          if (stored) {
            setTrees((current) => current ?? (JSON.parse(stored) as TreeRow[]));
          }
        } catch {
          // An unreadable saved list is just the pre-offline behavior.
        }
      }
      return;
    }
    setLoadFailed(false);
    if (userId) {
      AsyncStorage.setItem(treeListKey(userId), JSON.stringify(data ?? [])).catch(() => {});
    }
    pruneTreeIndexCopies((data ?? []).map((tree) => tree.id));
    // A home person changed on another device leaves this device's cached
    // relationship labels stale for the whole session — drop them here.
    for (const tree of data ?? []) {
      const known = homePersons.current.get(tree.id);
      if (known !== undefined && known !== tree.home_person_id) invalidateRelationshipCache();
      homePersons.current.set(tree.id, tree.home_person_id);
    }
    setTrees(data);
  }, [userId]);

  useEffect(() => {
    if (session) refresh();
    else {
      // Signed out is a clean slate, not a failure carried over from the last
      // account — otherwise the sign-in screen inherits a stale error.
      setTrees(null);
      setLoadFailed(false);
    }
  }, [session, refresh]);

  // The remembered choice belongs to the account, not the device, so a shared
  // phone doesn't hand one person's tree to the next signed-in user.
  useEffect(() => {
    if (!userId) {
      setSelectedId(null);
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(storageKey(userId)).then((stored) => {
      if (!cancelled) setSelectedId(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const selectTree = useCallback(
    async (treeId: string) => {
      setSelectedId(treeId);
      if (userId) await AsyncStorage.setItem(storageKey(userId), treeId);
    },
    [userId],
  );

  // A remembered id can name a tree that has since been deleted — on this
  // device or another — so it only counts if it is still in the list.
  const chosen = selectedId ? trees?.find((tree) => tree.id === selectedId) : undefined;
  const activeTree =
    chosen ??
    (trees?.length ? [...trees].sort((a, b) => b.individual_count - a.individual_count)[0] : undefined);

  // Warm the active tree's index once per session (it's session-cached), so
  // the field copy on disk is as fresh as the last online launch — a
  // graveside look-up must not depend on having visited the Tree tab
  // (SPEC_offline-field-mode.md). Fire-and-forget; failure costs nothing.
  const activeTreeId = activeTree?.id;
  useEffect(() => {
    if (activeTreeId && !loadFailed) void getTreeIndex(activeTreeId).catch(() => {});
  }, [activeTreeId, loadFailed]);

  return (
    <ActiveTreeContext.Provider value={{ trees, activeTree, loadFailed, selectTree, refresh }}>
      {children}
    </ActiveTreeContext.Provider>
  );
}

export function useActiveTree(): ActiveTreeContextValue {
  return useContext(ActiveTreeContext);
}
