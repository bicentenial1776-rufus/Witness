import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { useSession } from '@/auth/session-provider';
import { invalidateRelationshipCache } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

/**
 * The signed-in user's trees, shared app-wide so tab screens don't need
 * treeId route params. "Active" is the richest tree until there's a real
 * selector. Detail screens still take treeId params — deep links (like the
 * digest notification) must keep working without this context.
 */

export interface TreeRow {
  id: string;
  name: string;
  individual_count: number;
  family_count: number;
  place_count: number;
  imported_at: string;
  home_person_id: string | null;
  home_person: { full_name: string } | null;
}

interface ActiveTreeContextValue {
  trees: TreeRow[] | null;
  activeTree: TreeRow | undefined;
  refresh: () => Promise<void>;
}

const ActiveTreeContext = createContext<ActiveTreeContextValue>({
  trees: null,
  activeTree: undefined,
  refresh: async () => {},
});

export function ActiveTreeProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [trees, setTrees] = useState<TreeRow[] | null>(null);
  const homePersons = useRef(new Map<string, string | null>());

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('trees')
      .select(
        'id, name, individual_count, family_count, place_count, imported_at, home_person_id, home_person:individuals!trees_home_person_id_fkey(full_name)',
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

  const activeTree = trees?.length
    ? [...trees].sort((a, b) => b.individual_count - a.individual_count)[0]
    : undefined;

  return (
    <ActiveTreeContext.Provider value={{ trees, activeTree, refresh }}>
      {children}
    </ActiveTreeContext.Provider>
  );
}

export function useActiveTree(): ActiveTreeContextValue {
  return useContext(ActiveTreeContext);
}
