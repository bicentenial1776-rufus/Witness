import { useEffect, useState } from 'react';

import { getKinMap, type Kin } from '@/lib/relationship-cache';

const EMPTY = new Map<string, Kin>();

/**
 * The tree's relationship map (individual id → category + exact words)
 * as state, for any screen that shows names. One shared fetch behind it
 * (relationship-cache); this only saves every list re-writing the same
 * effect. Empty until it lands, and empty without a tree — a name with no
 * entry simply shows no symbol.
 */
export function useKinMap(treeId: string | null | undefined): Map<string, Kin> {
  const [map, setMap] = useState<Map<string, Kin>>(EMPTY);
  useEffect(() => {
    if (!treeId) {
      setMap(EMPTY);
      return;
    }
    let cancelled = false;
    getKinMap(treeId)
      .then((next) => {
        if (!cancelled) setMap(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [treeId]);
  return map;
}
