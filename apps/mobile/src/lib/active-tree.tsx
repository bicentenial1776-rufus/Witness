import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { useSession } from '@/auth/session-provider';
import { invalidateRelationshipCache } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

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

function storageKey(userId: string): string {
  return `${SELECTED_KEY}.${userId}`;
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
}

interface ActiveTreeContextValue {
  trees: TreeRow[] | null;
  activeTree: TreeRow | undefined;
  /** Remember this tree as the active one for this account. */
  selectTree: (treeId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ActiveTreeContext = createContext<ActiveTreeContextValue>({
  trees: null,
  activeTree: undefined,
  selectTree: async () => {},
  refresh: async () => {},
});

export function ActiveTreeProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id;
  const [trees, setTrees] = useState<TreeRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const homePersons = useRef(new Map<string, string | null>());

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('trees')
      .select(
        'id, name, individual_count, family_count, place_count, imported_at, gedcom_path, gedcom_bytes, home_person_id, home_person:individuals!trees_home_person_id_fkey(full_name)',
      )
      .order('imported_at', { ascending: false });
    if (error) return;
    // A home person changed on another device leaves this device's cached
    // relationship labels stale for the whole session — drop them here.
    for (const tree of data ?? []) {
      const known = homePersons.current.get(tree.id);
      if (known !== undefined && known !== tree.home_person_id) invalidateRelationshipCache();
      homePersons.current.set(tree.id, tree.home_person_id);
    }
    setTrees(data);
  }, []);

  useEffect(() => {
    if (session) refresh();
    else setTrees(null);
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

  return (
    <ActiveTreeContext.Provider value={{ trees, activeTree, selectTree, refresh }}>
      {children}
    </ActiveTreeContext.Provider>
  );
}

export function useActiveTree(): ActiveTreeContextValue {
  return useContext(ActiveTreeContext);
}
