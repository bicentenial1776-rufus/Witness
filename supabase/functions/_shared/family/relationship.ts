// Mirrored from packages/core/src/family/relationship.ts — keep in sync
// (portSync.test.ts enforces byte equality outside this header).

import type { FamilyGraph, GraphPerson } from './graph.ts';

/**
 * Relationship calculation between the home person and any target, via
 * closest common ancestor. Handles the classic hard cases explicitly:
 *
 * - Pedigree collapse (endogamy, cousin marriages): the ancestor climb
 *   keeps only the shortest depth per ancestor and never revisits, so
 *   loops terminate and the most direct path wins.
 * - Half-relationships: decided at the junction — the two siblings where
 *   the lines meet — by whether they share both parents or one.
 * - Unknown parents: an unshared parent that is *unknown* (rather than
 *   known-different) makes full-vs-half undecidable; the label omits the
 *   "half-" prefix and confidence drops to 'partial'.
 * - Self: a graceful "This is you" rather than an empty path.
 */

export interface RelationshipResult {
  label: string;
  /** Generations the target sits above the home person (negative = below). */
  generationDistance: number;
  line: 'maternal' | 'paternal' | 'both' | 'unknown';
  /** Individual ids from home person to target (through the common ancestor for collaterals). */
  path: string[];
  isDirectAncestor: boolean;
  isDirectDescendant: boolean;
  isCollateral: boolean;
  confidence: 'known' | 'partial' | 'none';
}

const ORDINALS = ['zeroth', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
function ordinal(n: number): string {
  if (n < ORDINALS.length) return ORDINALS[n]!;
  const tail = n % 10;
  const suffix = tail === 1 && n % 100 !== 11 ? 'st' : tail === 2 && n % 100 !== 12 ? 'nd' : tail === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

function sexWord(sex: GraphPerson['sex'], male: string, female: string, neutral: string): string {
  return sex === 'M' ? male : sex === 'F' ? female : neutral;
}

function ancestorWord(depth: number, sex: GraphPerson['sex']): string {
  const base = (n: number, root: string) =>
    n === 1 ? root : n === 2 ? `grand${root}` : n === 3 ? `great-grand${root}` : `${ordinal(n - 2)} great-grand${root}`;
  return base(depth, sexWord(sex, 'father', 'mother', 'parent'));
}

function descendantWord(depth: number, sex: GraphPerson['sex']): string {
  const root = sexWord(sex, 'son', 'daughter', 'child');
  return depth === 1 ? root : depth === 2 ? `grand${root}` : depth === 3 ? `great-grand${root}` : `${ordinal(depth - 2)} great-grand${root}`;
}

function auntWord(generationsUp: number, sex: GraphPerson['sex']): string {
  const root = sexWord(sex, 'uncle', 'aunt', 'aunt/uncle');
  return generationsUp === 1 ? root : generationsUp === 2 ? `great-${root}` : `${ordinal(generationsUp - 1)} great-${root}`;
}

function nieceWord(generationsDown: number, sex: GraphPerson['sex']): string {
  const root = sexWord(sex, 'nephew', 'niece', 'niece/nephew');
  return generationsDown === 1 ? root : generationsDown === 2 ? `great-${root}` : `${ordinal(generationsDown - 1)} great-${root}`;
}

function cousinWord(degree: number, removed: number): string {
  const base = `${ordinal(degree)} cousin`;
  if (removed === 0) return base;
  if (removed === 1) return `${base} once removed`;
  if (removed === 2) return `${base} twice removed`;
  return `${base} ${removed} times removed`;
}

export interface AncestorEntry {
  depth: number;
  /** The person we climbed from to reach this ancestor (for path rebuild). */
  via: string;
  /** Home-side only: which of the start person's parents the shortest climb goes through. */
  firstSteps: Set<'father' | 'mother'>;
}

/** BFS up the parent links. Includes the start person at depth 0. */
export function ancestorDepths(graph: FamilyGraph, startId: string): Map<string, AncestorEntry> {
  const result = new Map<string, AncestorEntry>();
  result.set(startId, { depth: 0, via: startId, firstSteps: new Set() });
  let frontier = [startId];
  let depth = 0;

  while (frontier.length) {
    depth += 1;
    const next: string[] = [];
    for (const id of frontier) {
      const person = graph.people.get(id);
      const entry = result.get(id)!;
      if (!person) continue;
      for (const side of ['father', 'mother'] as const) {
        const parentId = person[side];
        if (!parentId) continue;
        const firstSteps = depth === 1 ? new Set<'father' | 'mother'>([side]) : entry.firstSteps;
        const existing = result.get(parentId);
        if (!existing) {
          result.set(parentId, { depth, via: id, firstSteps: new Set(firstSteps) });
          next.push(parentId);
        } else if (existing.depth === depth) {
          // Pedigree collapse: same ancestor at the same depth through
          // another line — merge which sides can reach them.
          for (const step of firstSteps) existing.firstSteps.add(step);
        }
      }
    }
    frontier = next;
  }
  return result;
}

/** Rebuilds the climb start → ancestor using the `via` pointers. */
function pathUp(entries: Map<string, AncestorEntry>, ancestorId: string): string[] {
  const path: string[] = [];
  let current = ancestorId;
  while (true) {
    path.push(current);
    const entry = entries.get(current)!;
    if (entry.depth === 0) break;
    current = entry.via;
  }
  return path.reverse();
}

function lineOf(entry: AncestorEntry): RelationshipResult['line'] {
  if (entry.firstSteps.size === 2) return 'both';
  if (entry.firstSteps.has('mother')) return 'maternal';
  if (entry.firstSteps.has('father')) return 'paternal';
  return 'unknown';
}

/**
 * Full vs half at the junction: the home-side and target-side children of
 * the common ancestor. Returns the label prefix and the confidence.
 */
function siblingKind(
  graph: FamilyGraph,
  aId: string,
  bId: string,
): { prefix: '' | 'half-'; confidence: 'known' | 'partial' } {
  const a = graph.people.get(aId);
  const b = graph.people.get(bId);
  if (!a || !b) return { prefix: '', confidence: 'partial' };
  const sharedFather = a.father !== null && a.father === b.father;
  const sharedMother = a.mother !== null && a.mother === b.mother;
  if (sharedFather && sharedMother) return { prefix: '', confidence: 'known' };
  const otherSideUnknown =
    (sharedFather && (a.mother === null || b.mother === null)) ||
    (sharedMother && (a.father === null || b.father === null));
  if (otherSideUnknown) return { prefix: '', confidence: 'partial' };
  return { prefix: 'half-', confidence: 'known' };
}

export function calculateRelationship(
  graph: FamilyGraph,
  homeId: string,
  targetId: string,
  /** The home person's ancestorDepths map, when the caller labels many
      targets against one home person — recomputing it per target is the
      dominant cost of a full-tree precompute. */
  precomputedHomeAncestors?: Map<string, AncestorEntry>,
): RelationshipResult {
  const none: RelationshipResult = {
    label: 'no known relationship',
    generationDistance: 0,
    line: 'unknown',
    path: [],
    isDirectAncestor: false,
    isDirectDescendant: false,
    isCollateral: false,
    confidence: 'none',
  };

  const home = graph.people.get(homeId);
  const target = graph.people.get(targetId);
  if (!home || !target) return none;

  if (homeId === targetId) {
    return { ...none, label: 'this is you', path: [homeId], confidence: 'known' };
  }

  if (home.spouses.includes(targetId)) {
    return {
      ...none,
      label: sexWord(target.sex, 'husband', 'wife', 'spouse'),
      path: [homeId, targetId],
      confidence: 'known',
    };
  }

  const homeAncestors = precomputedHomeAncestors ?? ancestorDepths(graph, homeId);
  const targetAncestors = ancestorDepths(graph, targetId);

  // Direct ancestor
  const asAncestor = homeAncestors.get(targetId);
  if (asAncestor) {
    return {
      label: ancestorWord(asAncestor.depth, target.sex),
      generationDistance: asAncestor.depth,
      line: lineOf(asAncestor),
      path: pathUp(homeAncestors, targetId),
      isDirectAncestor: true,
      isDirectDescendant: false,
      isCollateral: false,
      confidence: 'known',
    };
  }

  // Direct descendant
  const asDescendant = targetAncestors.get(homeId);
  if (asDescendant) {
    return {
      label: descendantWord(asDescendant.depth, target.sex),
      generationDistance: -asDescendant.depth,
      line: 'unknown',
      path: pathUp(targetAncestors, homeId).reverse(),
      isDirectAncestor: false,
      isDirectDescendant: true,
      isCollateral: false,
      confidence: 'known',
    };
  }

  // Collateral via closest common ancestor. Minimize total steps, then
  // the generation gap, so pedigree collapse resolves to the most direct
  // reading of the relationship.
  let best: { ancestorId: string; a: number; b: number } | null = null;
  for (const [ancestorId, homeEntry] of homeAncestors) {
    const targetEntry = targetAncestors.get(ancestorId);
    if (!targetEntry || homeEntry.depth === 0 || targetEntry.depth === 0) continue;
    const a = homeEntry.depth;
    const b = targetEntry.depth;
    if (
      !best ||
      a + b < best.a + best.b ||
      (a + b === best.a + best.b && Math.abs(a - b) < Math.abs(best.a - best.b))
    ) {
      best = { ancestorId, a, b };
    }
  }

  if (best) {
    const { ancestorId, a, b } = best;
    const homeEntry = homeAncestors.get(ancestorId)!;
    const homePath = pathUp(homeAncestors, ancestorId);
    const targetPath = pathUp(targetAncestors, ancestorId).reverse().slice(1);
    const path = [...homePath, ...targetPath];

    // Junction: the two children of the common ancestor on each side.
    // For siblings (a=1, b=1) the junction is home and target themselves.
    const junctionHome = homePath[homePath.length - 2]!;
    const junctionTarget = targetPath.length ? (targetPath[0] ?? targetId) : targetId;
    const kind = siblingKind(graph, junctionHome, junctionTarget);

    let label: string;
    if (a === 1 && b === 1) {
      label = `${kind.prefix}${sexWord(target.sex, 'brother', 'sister', 'sibling')}`;
    } else if (b === 1) {
      label = `${kind.prefix}${auntWord(a - 1, target.sex)}`;
    } else if (a === 1) {
      label = `${kind.prefix}${nieceWord(b - 1, target.sex)}`;
    } else {
      label = `${kind.prefix}${cousinWord(Math.min(a, b) - 1, Math.abs(a - b))}`;
    }

    return {
      label,
      generationDistance: a - b,
      line: lineOf(homeEntry),
      path,
      isDirectAncestor: false,
      isDirectDescendant: false,
      isCollateral: true,
      confidence: kind.confidence,
    };
  }

  // In-laws, where determinable without a blood path.
  for (const spouseId of home.spouses) {
    const spouse = graph.people.get(spouseId);
    if (!spouse) continue;
    if (spouse.father === targetId || spouse.mother === targetId) {
      return {
        ...none,
        label: sexWord(target.sex, 'father-in-law', 'mother-in-law', 'parent-in-law'),
        generationDistance: 1,
        path: [homeId, spouseId, targetId],
        confidence: 'known',
      };
    }
    const spouseSibling =
      (target.father !== null && target.father === spouse.father) ||
      (target.mother !== null && target.mother === spouse.mother);
    if (spouseSibling) {
      return {
        ...none,
        label: sexWord(target.sex, 'brother-in-law', 'sister-in-law', 'sibling-in-law'),
        path: [homeId, spouseId, targetId],
        confidence: 'known',
      };
    }
  }
  for (const childId of home.children) {
    const child = graph.people.get(childId);
    if (child?.spouses.includes(targetId)) {
      return {
        ...none,
        label: sexWord(target.sex, 'son-in-law', 'daughter-in-law', 'child-in-law'),
        generationDistance: -1,
        path: [homeId, childId, targetId],
        confidence: 'known',
      };
    }
  }
  const siblingSpouse = [...graph.people.values()].find(
    (p) =>
      p.spouses.includes(targetId) &&
      ((p.father !== null && p.father === home.father) || (p.mother !== null && p.mother === home.mother)) &&
      p.id !== homeId,
  );
  if (siblingSpouse) {
    return {
      ...none,
      label: sexWord(target.sex, 'brother-in-law', 'sister-in-law', 'sibling-in-law'),
      path: [homeId, siblingSpouse.id, targetId],
      confidence: 'known',
    };
  }

  return none;
}

/** Chain of mothers (or fathers) from the home person back through time. */
export function parentLine(
  graph: FamilyGraph,
  homeId: string,
  side: 'mother' | 'father',
): GraphPerson[] {
  const line: GraphPerson[] = [];
  const seen = new Set<string>([homeId]);
  let current = graph.people.get(homeId);
  while (current) {
    const parentId = current[side];
    if (!parentId || seen.has(parentId)) break;
    const parent = graph.people.get(parentId);
    if (!parent) break;
    line.push(parent);
    seen.add(parentId);
    current = parent;
  }
  return line;
}
