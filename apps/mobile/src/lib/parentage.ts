import type { TreeIndex } from '@witness/core/query';

import { getTreeIndex } from '@/lib/tree-index-cache';

// "Daughter of William Towne and Joanna Blessing" — parentage is
// context-free lineage, so it applies to everyone in the tree, blood
// relative or not. Both parents where the record has them, one otherwise.
function buildParentage(index: TreeIndex): Map<string, string> {
  const map = new Map<string, string>();
  for (const family of index.families) {
    const parents = [family.husband_id, family.wife_id]
      .map((id) => (id ? index.individuals.get(id)?.full_name : undefined))
      .filter((name): name is string => Boolean(name));
    if (parents.length === 0) continue;
    for (const childId of family.children) {
      if (map.has(childId)) continue; // a child of two families keeps the first
      const child = index.individuals.get(childId);
      const word = child?.sex === 'F' ? 'Daughter' : child?.sex === 'M' ? 'Son' : 'Child';
      map.set(childId, `${word} of ${parents.join(' and ')}`);
    }
  }
  return map;
}

// Derived off the shared tree index; keying the WeakMap by the index
// object means invalidateTreeIndexCache() invalidates this for free.
const derived = new WeakMap<TreeIndex, Map<string, string>>();

export async function getParentageMap(treeId: string): Promise<Map<string, string>> {
  const index = await getTreeIndex(treeId);
  let map = derived.get(index);
  if (!map) {
    map = buildParentage(index);
    derived.set(index, map);
  }
  return map;
}
