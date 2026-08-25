// Mirrored at supabase/functions/_shared/family/relationship.ts — keep in sync
// (portSync.test.ts enforces byte equality outside this header).

import { isSlotLink, type FamilyGraph, type GraphPerson, type ParentLink } from './graph.js';

/**
 * Relationship calculation between the home person and any target, per
 * witness-relationship-taxonomy-spec.md. Every person resolves to a tier
 * — direct, blood, distant, none — and, unless the tier is none, a label.
 *
 * - Blood beats marriage. The consanguine reading is computed first, so a
 *   cousin you married reads "3rd cousin — also your wife" rather than
 *   losing the cousin entirely (endogamy is common; kindred.ts exists
 *   because of it).
 * - Distant is everyone reachable across exactly one marriage edge, in
 *   three shapes: married into your line ("wife of your 3rd
 *   great-grandfather"), your spouse's kin ("mother-in-law"), and
 *   step-family ("stepbrother"). Two marriage edges is never distant.
 * - Pedigree collapse (endogamy, cousin marriages): the ancestor climb
 *   keeps only the shortest depth per ancestor and never revisits, so
 *   loops terminate and the most direct path wins.
 * - Half-relationships: decided at the junction — the two siblings where
 *   the lines meet — by whether they share both parents or one.
 * - Unknown parents: an unshared parent that is *unknown* (rather than
 *   known-different) makes full-vs-half undecidable; the standalone label
 *   softens the prefix rather than dropping it ("possibly a half-brother")
 *   and confidence drops to 'partial'. Composed distant labels ("wife of
 *   your uncle") stay plain — the softener reads badly mid-phrase.
 * - Adoption and fostering keep the tier of the family they sit in and
 *   qualify the label ("adoptive father", "adopted son"); step links
 *   never enter the blood climb at all.
 * - Self: a graceful "This is you" rather than an empty path.
 */

export type RelationshipTier = 'direct' | 'blood' | 'distant' | 'none';

/** Names a non-birth parent link carried in the label. */
export type LinkQualifier = 'adoptive' | 'foster' | 'birth';

export interface RelationshipResult {
  label: string;
  tier: RelationshipTier;
  /** Generations the target sits above the home person (negative = below). */
  generationDistance: number;
  line: 'maternal' | 'paternal' | 'both' | 'unknown';
  /** Individual ids from home person to target (through the common ancestor for collaterals). */
  path: string[];
  isDirectAncestor: boolean;
  isDirectDescendant: boolean;
  isCollateral: boolean;
  /** Set when the label names a non-birth link. */
  qualifier: LinkQualifier | null;
  confidence: 'known' | 'partial' | 'none';
}

/** How far up or down the line a step junction may sit. */
const STEP_NEAR_MAX = 2;
/** How many blood steps past the marriage edge still read as family. */
const STEP_FAR_MAX = 2;

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

/** "adoptive father" climbing, "adopted son" descending. */
const QUALIFIER_WORD: Record<LinkQualifier, { up: string; down: string }> = {
  adoptive: { up: 'adoptive', down: 'adopted' },
  foster: { up: 'foster', down: 'foster' },
  birth: { up: 'birth', down: 'birth' },
};

function qualify(word: string, qualifier: LinkQualifier | null, direction: 'up' | 'down'): string {
  return qualifier ? `${QUALIFIER_WORD[qualifier][direction]} ${word}` : word;
}

export interface AncestorEntry {
  depth: number;
  /** The person we climbed from to reach this ancestor (for path rebuild). */
  via: string;
  /** Home-side only: which of the start person's parents the shortest climb goes through. */
  firstSteps: Set<'father' | 'mother'>;
  /** The first non-birth link crossed on the way up, if any. */
  qualifier: LinkQualifier | null;
}

/**
 * A birth link only needs naming when the same side also carries a
 * non-birth one — otherwise "father" is the plain and only reading.
 */
function linkQualifier(person: GraphPerson, link: ParentLink): LinkQualifier | null {
  if (link.type === 'adopted') return 'adoptive';
  if (link.type === 'foster') return 'foster';
  const contested = person.parentLinks.some(
    (other) => other.side === link.side && (other.type === 'adopted' || other.type === 'foster'),
  );
  return contested ? 'birth' : null;
}

/** The climbable parent links — every recorded one except step. */
function slotLinks(person: GraphPerson): ParentLink[] {
  return person.parentLinks.filter((link) => isSlotLink(link.type));
}

/** BFS up the parent links. Includes the start person at depth 0. */
export function ancestorDepths(graph: FamilyGraph, startId: string): Map<string, AncestorEntry> {
  const result = new Map<string, AncestorEntry>();
  result.set(startId, { depth: 0, via: startId, firstSteps: new Set(), qualifier: null });
  let frontier = [startId];
  let depth = 0;

  while (frontier.length) {
    depth += 1;
    const next: string[] = [];
    for (const id of frontier) {
      const person = graph.people.get(id);
      const entry = result.get(id)!;
      if (!person) continue;
      for (const link of slotLinks(person)) {
        const firstSteps = depth === 1 ? new Set<'father' | 'mother'>([link.side]) : entry.firstSteps;
        const qualifier = entry.qualifier ?? linkQualifier(person, link);
        const existing = result.get(link.id);
        if (!existing) {
          result.set(link.id, { depth, via: id, firstSteps: new Set(firstSteps), qualifier });
          next.push(link.id);
        } else if (existing.depth === depth) {
          // Pedigree collapse: same ancestor at the same depth through
          // another line — merge which sides can reach them, and let an
          // unqualified path win, since it is the plainer truth.
          for (const step of firstSteps) existing.firstSteps.add(step);
          if (qualifier === null) existing.qualifier = null;
        }
      }
    }
    frontier = next;
  }
  return result;
}

/**
 * Ancestor maps are the dominant cost of labelling many targets against
 * one home person, and affinity needs them for spouses and step junctions
 * too. The cache is capped rather than unbounded — a full-tree walk would
 * otherwise hold one map per person — and the home person is never
 * evicted, since every call reads it.
 */
const MAX_CACHED_ANCESTORS = 64;

export interface RelationshipContext {
  homeId: string;
  ancestors: Map<string, Map<string, AncestorEntry>>;
}

export function relationshipContext(graph: FamilyGraph, homeId: string): RelationshipContext {
  const context: RelationshipContext = { homeId, ancestors: new Map() };
  ancestorsOf(graph, context, homeId);
  return context;
}

function ancestorsOf(
  graph: FamilyGraph,
  context: RelationshipContext,
  id: string,
): Map<string, AncestorEntry> {
  const cached = context.ancestors.get(id);
  if (cached) return cached;
  const computed = ancestorDepths(graph, id);
  if (context.ancestors.size >= MAX_CACHED_ANCESTORS) {
    for (const key of context.ancestors.keys()) {
      if (key === context.homeId) continue;
      context.ancestors.delete(key);
      break;
    }
  }
  context.ancestors.set(id, computed);
  return computed;
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

const NONE: RelationshipResult = {
  label: 'no known relationship',
  tier: 'none',
  generationDistance: 0,
  line: 'unknown',
  path: [],
  isDirectAncestor: false,
  isDirectDescendant: false,
  isCollateral: false,
  qualifier: null,
  confidence: 'none',
};

type BloodShape = 'ancestor' | 'descendant' | 'sibling' | 'auntUncle' | 'nieceNephew' | 'cousin';

interface BloodReading {
  result: RelationshipResult;
  shape: BloodShape;
  /** The label without any confidence softener, for use mid-phrase. */
  composeLabel: string;
}

/** "possibly a half-sister", "possibly an adoptive half-brother". */
function possibly(phrase: string): string {
  return `possibly ${/^[aeiou]/.test(phrase) ? 'an' : 'a'} ${phrase}`;
}

/**
 * The consanguine reading from `fromId` to `toId`, or null when no common
 * ancestor exists. Marriage is not consulted here at all.
 */
function bloodReading(
  graph: FamilyGraph,
  context: RelationshipContext,
  fromId: string,
  toId: string,
): BloodReading | null {
  const from = graph.people.get(fromId);
  const to = graph.people.get(toId);
  if (!from || !to || fromId === toId) return null;

  const fromAncestors = ancestorsOf(graph, context, fromId);
  const toAncestors = ancestorsOf(graph, context, toId);

  const asAncestor = fromAncestors.get(toId);
  if (asAncestor) {
    const label = qualify(ancestorWord(asAncestor.depth, to.sex), asAncestor.qualifier, 'up');
    return {
      shape: 'ancestor',
      composeLabel: label,
      result: {
        ...NONE,
        label,
        tier: 'direct',
        generationDistance: asAncestor.depth,
        line: lineOf(asAncestor),
        path: pathUp(fromAncestors, toId),
        isDirectAncestor: true,
        qualifier: asAncestor.qualifier,
        confidence: 'known',
      },
    };
  }

  const asDescendant = toAncestors.get(fromId);
  if (asDescendant) {
    const label = qualify(descendantWord(asDescendant.depth, to.sex), asDescendant.qualifier, 'down');
    return {
      shape: 'descendant',
      composeLabel: label,
      result: {
        ...NONE,
        label,
        tier: 'direct',
        generationDistance: -asDescendant.depth,
        path: pathUp(toAncestors, fromId).reverse(),
        isDirectDescendant: true,
        qualifier: asDescendant.qualifier,
        confidence: 'known',
      },
    };
  }

  // Collateral via closest common ancestor. Minimize total steps, then
  // the generation gap, so pedigree collapse resolves to the most direct
  // reading of the relationship.
  let best: { ancestorId: string; a: number; b: number } | null = null;
  for (const [ancestorId, fromEntry] of fromAncestors) {
    const toEntry = toAncestors.get(ancestorId);
    if (!toEntry || fromEntry.depth === 0 || toEntry.depth === 0) continue;
    const a = fromEntry.depth;
    const b = toEntry.depth;
    if (
      !best ||
      a + b < best.a + best.b ||
      (a + b === best.a + best.b && Math.abs(a - b) < Math.abs(best.a - best.b))
    ) {
      best = { ancestorId, a, b };
    }
  }
  if (!best) return null;

  const { ancestorId, a, b } = best;
  const fromEntry = fromAncestors.get(ancestorId)!;
  const fromPath = pathUp(fromAncestors, ancestorId);
  const toPath = pathUp(toAncestors, ancestorId).reverse().slice(1);
  const path = [...fromPath, ...toPath];
  const qualifier = fromEntry.qualifier ?? toAncestors.get(ancestorId)!.qualifier;

  // Junction: the two children of the common ancestor on each side.
  // For siblings (a=1, b=1) the junction is from and to themselves.
  const junctionFrom = fromPath[fromPath.length - 2]!;
  const junctionTo = toPath.length ? (toPath[0] ?? toId) : toId;
  const kind = siblingKind(graph, junctionFrom, junctionTo);

  let base: string;
  let shape: BloodShape;
  if (a === 1 && b === 1) {
    base = sexWord(to.sex, 'brother', 'sister', 'sibling');
    shape = 'sibling';
  } else if (b === 1) {
    base = auntWord(a - 1, to.sex);
    shape = 'auntUncle';
  } else if (a === 1) {
    base = nieceWord(b - 1, to.sex);
    shape = 'nieceNephew';
  } else {
    base = cousinWord(Math.min(a, b) - 1, Math.abs(a - b));
    shape = 'cousin';
  }

  // When full-vs-half is undecidable the standalone label softens the
  // prefix rather than dropping it (§7); the plain form is kept for
  // composition, where the softener reads badly mid-phrase.
  const composeLabel = qualify(`${kind.prefix}${base}`, qualifier, 'down');
  const label =
    kind.confidence === 'partial' ? possibly(qualify(`half-${base}`, qualifier, 'down')) : composeLabel;

  return {
    shape,
    composeLabel,
    result: {
      ...NONE,
      label,
      tier: 'blood',
      generationDistance: a - b,
      line: lineOf(fromEntry),
      path,
      isCollateral: true,
      qualifier,
      confidence: kind.confidence,
    },
  };
}

/** Blood steps out from a person, over parent and child links alike. */
export function bloodWithin(graph: FamilyGraph, startId: string, maxSteps: number): Set<string> {
  const seen = new Set<string>([startId]);
  let frontier = [startId];
  for (let step = 0; step < maxSteps; step += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      const person = graph.people.get(id);
      if (!person) continue;
      for (const link of slotLinks(person)) {
        if (seen.has(link.id)) continue;
        seen.add(link.id);
        next.push(link.id);
      }
      for (const childId of person.children) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        next.push(childId);
      }
    }
    frontier = next;
  }
  return seen;
}

function spouseWord(person: GraphPerson): string {
  return sexWord(person.sex, 'husband', 'wife', 'spouse');
}

function inLawWord(person: GraphPerson, root: 'parent' | 'sibling' | 'child'): string {
  if (root === 'parent') return sexWord(person.sex, 'father-in-law', 'mother-in-law', 'parent-in-law');
  if (root === 'sibling') return sexWord(person.sex, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
  return sexWord(person.sex, 'son-in-law', 'daughter-in-law', 'child-in-law');
}

function stepWord(person: GraphPerson, root: 'parent' | 'sibling' | 'child', generations: number): string {
  const base =
    root === 'parent'
      ? sexWord(person.sex, 'father', 'mother', 'parent')
      : root === 'child'
        ? sexWord(person.sex, 'son', 'daughter', 'child')
        : sexWord(person.sex, 'brother', 'sister', 'sibling');
  if (generations <= 1) return `step${base}`;
  return `step-grand${base}`;
}

function distant(
  label: string,
  path: string[],
  generationDistance: number,
  confidence: 'known' | 'partial',
): RelationshipResult {
  return { ...NONE, label, tier: 'distant', generationDistance, path, confidence };
}

/**
 * The married-in reading: exactly one marriage edge in the path, in one
 * of three shapes. Called only after the blood reading comes back empty,
 * so no consanguine relationship is ever displaced by one of these.
 */
function affinityReading(
  graph: FamilyGraph,
  context: RelationshipContext,
  home: GraphPerson,
  target: GraphPerson,
): RelationshipResult | null {
  // Your own spouse.
  if (home.spouses.includes(target.id)) {
    return distant(spouseWord(target), [home.id, target.id], 0, 'known');
  }

  // Shape B — your spouse's kin. Their children who aren't yours are your
  // stepchildren, not your children-in-law.
  for (const spouseId of home.spouses) {
    const spouse = graph.people.get(spouseId);
    if (!spouse) continue;
    const reading = bloodReading(graph, context, spouseId, target.id);
    if (!reading) continue;
    const { result, shape, composeLabel } = reading;
    const path = [home.id, ...result.path];
    const generations = result.generationDistance;
    let label: string;
    if (shape === 'ancestor' && generations === 1) {
      label = inLawWord(target, 'parent');
    } else if (shape === 'sibling') {
      label = inLawWord(target, 'sibling');
    } else if (shape === 'descendant' && -generations <= STEP_NEAR_MAX) {
      label = stepWord(target, 'child', -generations);
    } else {
      label = `your ${spouseWord(spouse)}'s ${composeLabel}`;
    }
    return distant(label, path, generations, result.confidence === 'partial' ? 'partial' : 'known');
  }

  // Shape A — married into your line.
  for (const spouseId of target.spouses) {
    const reading = bloodReading(graph, context, home.id, spouseId);
    if (!reading) continue;
    const { result, shape, composeLabel } = reading;
    const path = [...result.path, target.id];
    const generations = result.generationDistance;
    let label: string;
    if (shape === 'ancestor' && generations <= STEP_NEAR_MAX) {
      label = stepWord(target, 'parent', generations);
    } else if (shape === 'sibling') {
      label = inLawWord(target, 'sibling');
    } else if (shape === 'descendant' && generations === -1) {
      label = inLawWord(target, 'child');
    } else {
      label = `${spouseWord(target)} of your ${composeLabel}`;
    }
    return distant(label, path, generations, result.confidence === 'partial' ? 'partial' : 'known');
  }

  // Shape C — step-family: someone married into your line, and their own
  // close blood. Bounded on both sides; past that a connection stops
  // being a family fact and becomes graph trivia.
  for (const middleId of bloodWithin(graph, target.id, STEP_FAR_MAX)) {
    if (middleId === target.id) continue;
    const middle = graph.people.get(middleId);
    if (!middle) continue;
    for (const nearId of middle.spouses) {
      const near = bloodReading(graph, context, home.id, nearId);
      if (!near) continue;
      const generations = near.result.generationDistance;
      const isLine = near.shape === 'ancestor' || near.shape === 'descendant';
      if (!isLine || Math.abs(generations) > STEP_NEAR_MAX) continue;
      const middleLabel =
        near.shape === 'ancestor'
          ? stepWord(middle, 'parent', generations)
          : inLawWord(middle, 'child');
      const far = bloodReading(graph, context, middleId, target.id);
      if (!far) continue;
      // A stepparent's own child is your stepsibling, not "your
      // stepmother's son".
      const label =
        near.shape === 'ancestor' && far.shape === 'descendant' && far.result.generationDistance === -1
          ? stepWord(target, 'sibling', generations)
          : `your ${middleLabel}'s ${far.composeLabel}`;
      const path = [...near.result.path, ...far.result.path.slice(1)];
      return distant(
        label,
        path,
        generations + far.result.generationDistance,
        far.result.confidence === 'partial' ? 'partial' : 'known',
      );
    }
  }

  return null;
}

export function calculateRelationship(
  graph: FamilyGraph,
  homeId: string,
  targetId: string,
  /** Shared ancestor maps, when the caller labels many targets against one
      home person — recomputing them per target is the dominant cost of a
      full-tree precompute. */
  context?: RelationshipContext,
): RelationshipResult {
  const home = graph.people.get(homeId);
  const target = graph.people.get(targetId);
  if (!home || !target) return NONE;

  if (homeId === targetId) {
    return { ...NONE, label: 'this is you', tier: 'direct', path: [homeId], confidence: 'known' };
  }

  const ctx = context ?? relationshipContext(graph, homeId);

  const blood = bloodReading(graph, ctx, homeId, targetId);
  if (blood) {
    // Blood wins the tier and the label; a marriage on top of it is
    // recorded rather than allowed to erase the kinship.
    if (home.spouses.includes(targetId)) {
      return { ...blood.result, label: `${blood.result.label} — also your ${spouseWord(target)}` };
    }
    return blood.result;
  }

  return affinityReading(graph, ctx, home, target) ?? NONE;
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
