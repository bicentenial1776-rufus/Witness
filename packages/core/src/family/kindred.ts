import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { FamilyGraph, GraphPerson } from './graph.js';
import { fetchFamilyGraph } from './precompute.js';

/**
 * Kindred couples: spouses who share a blood ancestor, as deep as the
 * tree records. Endogamy is common in close-knit communities — surfacing
 * it turns a quiet structural fact into a discovery ("you and your wife
 * both descend from William Haskell"). Sorted closest kinship first; on
 * a 5,495-person tree the full sweep yields around a dozen couples, so
 * no depth cap is needed.
 */

export interface KindredCouple {
  spouseA: GraphPerson;
  spouseB: GraphPerson;
  commonAncestor: GraphPerson;
  /** Generations from each spouse up to the common ancestor. */
  generationsA: number;
  generationsB: number;
  /** The couple's kinship: "first cousins", "third cousins, 2× removed". */
  label: string;
  /** "8th great-grandfather" — the ancestor's relation to spouse A / B. */
  ancestorLabelA: string;
  ancestorLabelB: string;
  /** Descent lines, common ancestor first, the spouse last. */
  pathA: GraphPerson[];
  pathB: GraphPerson[];
}

interface AncestorEntry {
  depth: number;
  /** The person one generation below on the shortest path — lets a descent line be replayed. */
  via: string;
}

/** Ancestor id → shallowest generation distance, climbing parent links. */
function ancestorDepths(graph: FamilyGraph, id: string): Map<string, AncestorEntry> {
  const depths = new Map<string, AncestorEntry>();
  const queue: [string, number][] = [[id, 0]];
  while (queue.length) {
    const [current, depth] = queue.shift()!;
    const person = graph.people.get(current);
    if (!person) continue;
    for (const parent of [person.father, person.mother]) {
      if (parent && (depths.get(parent)?.depth ?? Infinity) > depth + 1) {
        depths.set(parent, { depth: depth + 1, via: current });
        queue.push([parent, depth + 1]);
      }
    }
  }
  return depths;
}

/** Replays the via links from the common ancestor down to the spouse. */
function descentPath(
  graph: FamilyGraph,
  depths: Map<string, AncestorEntry>,
  ancestorId: string,
  spouseId: string,
): GraphPerson[] {
  const ids: string[] = [];
  let current = ancestorId;
  while (current !== spouseId) {
    ids.push(current);
    const entry = depths.get(current);
    if (!entry) break;
    current = entry.via;
  }
  ids.push(spouseId);
  return ids
    .map((id) => graph.people.get(id))
    .filter((p): p is GraphPerson => Boolean(p));
}

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

function ordinalWord(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}` + '';
}

function coupleLabel(a: number, b: number): string {
  if (a === 1 && b === 1) return 'siblings — likely a record error';
  const closer = Math.min(a, b);
  const removed = Math.abs(a - b);
  if (closer === 1) {
    return removed === 1
      ? 'uncle/aunt and niece/nephew'
      : `grand-uncle/aunt line, ${removed - 1}× removed`;
  }
  const cousins = `${ordinalWord(closer - 1)} cousins`;
  return removed === 0 ? cousins : `${cousins}, ${removed}× removed`;
}

/** "father", "grandmother", "8th great-grandfather" — by climb distance. */
export function ancestorLabel(generations: number, sex: 'M' | 'F' | 'U'): string {
  const base =
    sex === 'M' ? ['father', 'grandfather'] : sex === 'F' ? ['mother', 'grandmother'] : ['parent', 'grandparent'];
  if (generations === 1) return base[0]!;
  if (generations === 2) return base[1]!;
  if (generations === 3) return `great-${base[1]}`;
  return `${ordinalSuffix(generations - 2)} great-${base[1]}`;
}

/**
 * Pure sweep over the loaded graph. Couples where either spouse is within
 * maxGenerations of a shared ancestor qualify; the closest shared ancestor
 * (fewest total steps) is reported. Parent–child pairs (a 0 distance) are
 * record errors and excluded.
 */
export function sweepKindredCouples(graph: FamilyGraph, maxGenerations = Infinity): KindredCouple[] {
  const seen = new Set<string>();
  const couples: KindredCouple[] = [];

  for (const person of graph.people.values()) {
    for (const spouseId of person.spouses) {
      const key = [person.id, spouseId].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const spouse = graph.people.get(spouseId);
      if (!spouse) continue;

      const aDepths = ancestorDepths(graph, person.id);
      const bDepths = ancestorDepths(graph, spouseId);
      let best: { id: string; a: number; b: number } | null = null;
      for (const [ancestorId, { depth: a }] of aDepths) {
        if (a > maxGenerations) continue;
        const b = bDepths.get(ancestorId)?.depth;
        if (b === undefined || b > maxGenerations) continue;
        if (!best || a + b < best.a + best.b) best = { id: ancestorId, a, b };
      }
      if (!best || best.a === 0 || best.b === 0) continue;

      const commonAncestor = graph.people.get(best.id);
      if (!commonAncestor) continue;
      couples.push({
        spouseA: person,
        spouseB: spouse,
        commonAncestor,
        generationsA: best.a,
        generationsB: best.b,
        label: coupleLabel(best.a, best.b),
        ancestorLabelA: ancestorLabel(best.a, commonAncestor.sex),
        ancestorLabelB: ancestorLabel(best.b, commonAncestor.sex),
        pathA: descentPath(graph, aDepths, best.id, person.id),
        pathB: descentPath(graph, bDepths, best.id, spouseId),
      });
    }
  }

  couples.sort(
    (x, y) =>
      x.generationsA + x.generationsB - (y.generationsA + y.generationsB) ||
      (x.spouseA.birthYear ?? 9999) - (y.spouseA.birthYear ?? 9999),
  );
  return couples;
}

/** Load the tree's family graph and sweep it for kindred couples. */
export async function kindredCouples(
  client: WitnessSupabaseClient,
  treeId: string,
  maxGenerations = Infinity,
): Promise<KindredCouple[]> {
  const graph = await fetchFamilyGraph(client, treeId);
  return sweepKindredCouples(graph, maxGenerations);
}
