import { buildFamilyStages, type FamilyStageIndex } from '@witness/core/query';

import { getTreeIndex } from '@/lib/tree-index-cache';

// One stage index per tree per session, shared by the Family Stage screen
// and the Portrait's "length of time" link (which must know whether a
// household is stage-able before offering the door). Keyed to the tree
// index PROMISE, not just the tree id, so invalidating the tree index
// cache invalidates this one for free.
const cache = new Map<string, { source: Promise<unknown>; stages: Promise<FamilyStageIndex> }>();

export function getFamilyStages(treeId: string): Promise<FamilyStageIndex> {
  const source = getTreeIndex(treeId);
  const hit = cache.get(treeId);
  if (hit && hit.source === source) return hit.stages;
  const stages = source.then((index) =>
    buildFamilyStages(index, { currentYear: new Date().getFullYear() }),
  );
  cache.set(treeId, { source, stages });
  return stages;
}
