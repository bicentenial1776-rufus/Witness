import { buildFamilyStages, treeGenerationSpan, type FamilyStageIndex } from '@witness/core/query';

import { getTreeIndex } from '@/lib/tree-index-cache';

// One stage index per tree per session, shared by the Family Stage screen
// and the Portrait's "length of time" link (which must know whether a
// household is stage-able before offering the door). Keyed to the tree
// index PROMISE, not just the tree id, so invalidating the tree index
// cache invalidates this one for free.
//
// The Tree tab, Home and the register used to call buildFamilyStages
// themselves on every focus — a couple of seconds of main-thread work on a
// 61,773-person tree each time the reader came back (Rufus's "2–5 second
// lag on Back", 2026-09-17). Everything now reads this one build.
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

// Same idea for the generation span shown under the tree name.
const spans = new Map<string, { source: Promise<unknown>; span: Promise<number> }>();

export function getTreeGenerationSpan(treeId: string): Promise<number> {
  const source = getTreeIndex(treeId);
  const hit = spans.get(treeId);
  if (hit && hit.source === source) return hit.span;
  const span = source.then((index) => treeGenerationSpan(index));
  spans.set(treeId, { source, span });
  return span;
}
