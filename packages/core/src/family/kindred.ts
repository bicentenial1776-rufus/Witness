import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { FamilyGraph, GraphPerson } from './graph.js';
import { fetchFamilyGraph } from './homePerson.js';

/**
 * Kindred couples: spouses who share a blood ancestor. Endogamy is common
 * in deep colonial and immigrant communities — surfacing it turns a quiet
 * structural fact into a discovery ("your great-grandparents were first
 * cousins"). The default depth stops at grandparents (first cousins or
 * closer), where the shared ancestry is unambiguous rather than the
 * background hum of any old New England town.
 */

export interface KindredCouple {
  spouseA: GraphPerson;
  spouseB: GraphPerson;
  commonAncestor: GraphPerson;
  /** Generations from each spouse up to the common ancestor. */
  generationsA: number;
  generationsB: number;
  label: string;
}

/** Ancestor id → shallowest generation distance, climbing parent links. */
function ancestorDepths(graph: FamilyGraph, id: string): Map<string, number> {
  const depths = new Map<string, number>();
  const queue: [string, number][] = [[id, 0]];
  while (queue.length) {
    const [current, depth] = queue.shift()!;
    const person = graph.people.get(current);
    if (!person) continue;
    for (const parent of [person.father, person.mother]) {
      if (parent && (depths.get(parent) ?? Infinity) > depth + 1) {
        depths.set(parent, depth + 1);
        queue.push([parent, depth + 1]);
      }
    }
  }
  return depths;
}

function coupleLabel(a: number, b: number): string {
  if (a === 2 && b === 2) return 'first cousins';
  if ((a === 1 && b === 2) || (a === 2 && b === 1)) return 'uncle/aunt and niece/nephew';
  if (a === 1 && b === 1) return 'siblings — likely a record error';
  return `${Math.max(a, b)} generations from a shared ancestor`;
}

/**
 * Pure sweep over the loaded graph. Couples where either spouse is within
 * maxGenerations of a shared ancestor qualify; the closest shared ancestor
 * (fewest total steps) is reported. Parent–child pairs (a 0 distance) are
 * record errors and excluded.
 */
export function sweepKindredCouples(graph: FamilyGraph, maxGenerations = 2): KindredCouple[] {
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
      for (const [ancestorId, a] of aDepths) {
        if (a > maxGenerations) continue;
        const b = bDepths.get(ancestorId);
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
  maxGenerations = 2,
): Promise<KindredCouple[]> {
  const graph = await fetchFamilyGraph(client, treeId);
  return sweepKindredCouples(graph, maxGenerations);
}
