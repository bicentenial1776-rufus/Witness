import type { FamilyGraph, GraphPerson } from './graph.js';

/**
 * State of a single slot in the ahnentafel (ancestor numbering system).
 * - empty: no individual at this slot
 * - filled_unverified: individual exists but parent-child link lacks confirmation
 * - verified: parent-child link sourced or user-confirmed
 */
export type SlotState = 'empty' | 'filled_unverified' | 'verified';

/**
 * A single ancestor slot in the ahnentafel (2–511 for 8 generations).
 */
export interface AhnentafelSlot {
  slot: number;
  generation: number; // 1–8
  individual: GraphPerson | null;
  state: SlotState;
  collapseSlots?: number[]; // Other slots occupied by same individual (pedigree collapse)
}

/**
 * Per-generation rollup statistics.
 */
export interface GenerationStats {
  generation: number;
  relationshipName: string; // e.g. "Parents", "Grandparents", "3rd great-grandparents"
  slotCount: number; // 2^generation
  filledCount: number;
  verifiedCount: number;
  eraLabel: string; // computed from actual birth years or estimated
  estimatedYears?: { start: number; end: number }; // fallback estimate if no dates present
}

/**
 * Frontier state for one of the 8 great-grandparent lines (anchored at gen 3, slots 4–7).
 */
export interface LineFrontier {
  lineIndex: number; // 0–3 for the 4 gen-3 slots
  lineName: string; // e.g. "Howe", "Field"
  anchorIndividual: GraphPerson | null;
  frontierGeneration: number | null; // lowest generation with empty/unverified; null if clear through 8
  frontierType: 'wall' | 'verify' | 'clear'; // wall=empty, verify=unverified, clear=all verified through gen 8
  populatedDescendantLines: number; // count of lines with at least one individual
}

/**
 * A single research opportunity: a frontier slot with high impact.
 */
export interface Beacon {
  slotNumber: number;
  generation: number;
  individual: GraphPerson | null;
  convergedLineCount: number; // count of distinct lines that converge here
  generationsOpened: number; // how many generations could this unlock?
  whyStatement: string; // template-generated one-liner
  rank: number; // 1 (highest impact) to 3 (capped at 3)
}

/**
 * A verified line extending through all 8 generations.
 */
export interface GoldenThread {
  lineIndex: number;
  lineName: string;
  terminantIndividual: GraphPerson | null;
  terminantBirthYear: number | null;
  label: string; // e.g. "— Scott thread continues, verified, to 1621 —"
}

/**
 * Complete tree health model for one tree.
 * Cacheable and UI-agnostic.
 */
export interface TreeHealthModel {
  treeId: string;
  homePersonId: string;
  generationStats: GenerationStats[];
  ahnentafel: Map<number, AhnentafelSlot>; // keyed by slot number (2–511)
  lineFrontiers: LineFrontier[]; // one per gen-3 anchor
  beacons: Beacon[]; // top 3, ranked
  goldenThreads: GoldenThread[]; // verified lines through gen 8
  headlineStats: {
    filledPercent: number; // % of 510 slots filled
    verifiedPercent: number; // % of filled slots verified
    beaconCount: number;
  };
  computedAt: Date;
}

/**
 * Relationship labels for each generation.
 */
const GENERATION_LABELS = {
  1: 'Parents',
  2: 'Grandparents',
  3: 'Great-Grandparents',
  4: '2nd Great-Grandparents',
  5: '3rd Great-Grandparents',
  6: '4th Great-Grandparents',
  7: '5th Great-Grandparents',
  8: '6th Great-Grandparents',
};

/**
 * Resolve ahnentafel position n by walking parent links from home person.
 * Handles pedigree collapse: same individual may occupy multiple slots.
 */
function resolveAhnentafelSlot(
  n: number,
  graph: FamilyGraph,
  homePerson: GraphPerson,
): AhnentafelSlot {
  const generation = Math.floor(Math.log2(n));

  if (n === 1) {
    return {
      slot: 1,
      generation: 0, // home person
      individual: homePerson,
      state: 'verified',
    };
  }

  // Walk the bits of n after the leading 1, MSB first: 0 = father (2k), 1 = mother (2k+1)
  let current: GraphPerson | null = homePerson;
  let depth = 1;

  while (depth <= generation && current) {
    const isMaternal = (n >> (generation - depth)) & 1;
    const parentId: string | null = isMaternal ? current.mother : current.father;
    current = parentId ? graph.people.get(parentId) ?? null : null;
    depth++;
  }

  if (!current) {
    return {
      slot: n,
      generation,
      individual: null,
      state: 'empty',
    };
  }

  // Determine state: verify if parent-child link has sources or user confirmation
  // For now, default to 'filled_unverified' if individual exists; V2 adds user confirmations table
  const state: SlotState = 'filled_unverified'; // TODO: check connection_confirmations table

  return {
    slot: n,
    generation,
    individual: current,
    state,
  };
}

/**
 * Detect pedigree collapse: individuals occupying multiple slots.
 * Return a map of individualId -> all slots they occupy.
 */
function detectCollapses(ahnentafel: Map<number, AhnentafelSlot>): Map<string, number[]> {
  const collapses = new Map<string, number[]>();

  for (const slot of ahnentafel.values()) {
    if (slot.individual) {
      if (!collapses.has(slot.individual.id)) {
        collapses.set(slot.individual.id, []);
      }
      collapses.get(slot.individual.id)!.push(slot.slot);
    }
  }

  // Keep only those with multiple slots
  for (const [id, slots] of collapses.entries()) {
    if (slots.length === 1) {
      collapses.delete(id);
    }
  }

  return collapses;
}

/**
 * Compute era label for a generation from actual birth years, or fallback estimate.
 */
function computeEraLabel(
  generation: number,
  slots: AhnentafelSlot[],
  homePersonBirthYear: number | null,
): string {
  const birthYears = slots
    .map(s => s.individual?.birthYear)
    .filter((y): y is number => typeof y === 'number' && y > 1000 && y < 2100);

  if (birthYears.length > 0) {
    const min = Math.min(...birthYears);
    const max = Math.max(...birthYears);
    const approx = min === max ? `c. ${min}` : `c. ${min}–${max}`;
    return `births ${approx}`;
  }

  // Fallback: estimate from home person's birth year
  if (!homePersonBirthYear) return 'era unknown';
  const gensBack = generation;
  const avgGenerationGap = 30;
  const estimatedCenter = homePersonBirthYear - gensBack * avgGenerationGap;
  const startYear = estimatedCenter - avgGenerationGap / 2;
  const endYear = estimatedCenter + avgGenerationGap / 2;
  return `births c. ${Math.floor(startYear)}–${Math.floor(endYear)}`;
}

/**
 * Rank beacons by impact: (convergence × generations-opened).
 */
function rankBeacons(candidates: Beacon[]): Beacon[] {
  const ranked = candidates
    .map((b, idx) => ({
      ...b,
      score: b.convergedLineCount * b.generationsOpened,
      originalIndex: idx,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3) // cap at 3
    .map((b, idx) => ({
      ...b,
      rank: idx + 1,
    }));

  return ranked;
}

/**
 * Main computation: build the TreeHealthModel from a family graph.
 * The graph can come from a parsed GEDCOM (buildGraphFromParsed, tests/import)
 * or from database rows (fetchFamilyGraph / buildGraphFromRows, runtime).
 * @param treeId - tree UUID
 * @param graph - the family graph
 * @param homePersonId - id of the home person (gen 1, slot 1)
 * @returns TreeHealthModel
 */
export function computeTreeHealth(
  treeId: string,
  graph: FamilyGraph,
  homePersonId: string,
): TreeHealthModel {
  const homePerson = graph.people.get(homePersonId);
  if (!homePerson) {
    throw new Error(`Home person ${homePersonId} not found in family graph`);
  }

  // Build ahnentafel (slots 2–511 for 8 generations)
  const ahnentafel = new Map<number, AhnentafelSlot>();

  for (let slot = 2; slot <= 511; slot++) {
    const resolved = resolveAhnentafelSlot(slot, graph, homePerson);
    ahnentafel.set(slot, resolved);
  }

  // Mark collapses
  const collapses = detectCollapses(ahnentafel);
  for (const [id, slots] of collapses.entries()) {
    for (const slot of slots) {
      const slotData = ahnentafel.get(slot)!;
      if (!slotData.collapseSlots) slotData.collapseSlots = [];
      slotData.collapseSlots = slots.filter(s => s !== slot);
    }
  }

  // Per-generation stats
  const generationStats: GenerationStats[] = [];
  for (let gen = 1; gen <= 8; gen++) {
    const startSlot = Math.pow(2, gen);
    const endSlot = startSlot * 2 - 1;
    const slotsInGen = Array.from(
      { length: endSlot - startSlot + 1 },
      (_, i) => ahnentafel.get(startSlot + i)!,
    );

    const filledCount = slotsInGen.filter(s => s.individual).length;
    const verifiedCount = slotsInGen.filter(s => s.state === 'verified').length;
    const eraLabel = computeEraLabel(gen, slotsInGen, homePerson.birthYear);

    generationStats.push({
      generation: gen,
      relationshipName: GENERATION_LABELS[gen as keyof typeof GENERATION_LABELS],
      slotCount: Math.pow(2, gen),
      filledCount,
      verifiedCount,
      eraLabel,
    });
  }

  // Line frontiers (gen-3 anchors at slots 4–7)
  const lineFrontiers: LineFrontier[] = [];
  for (let lineIdx = 0; lineIdx < 4; lineIdx++) {
    const anchorSlot = 4 + lineIdx;
    const anchorData = ahnentafel.get(anchorSlot)!;
    const anchorName = anchorData.individual?.name ?? `Line ${lineIdx + 1}`;

    // Walk descendants from this anchor to find frontier
    let frontierGen: number | null = null;
    let frontierType: 'wall' | 'verify' | 'clear' = 'clear';

    for (let gen = 3; gen <= 8; gen++) {
      const startSlot = Math.pow(2, gen);
      const endSlot = startSlot * 2 - 1;

      // Slots descending from anchor (roughly; oversimplified for this version)
      // TODO: proper line tracking through pedigree
      for (let slot = startSlot; slot <= endSlot; slot++) {
        const slotData = ahnentafel.get(slot)!;
        if (slotData.state === 'empty') {
          frontierGen = gen;
          frontierType = 'wall';
          break;
        } else if (slotData.state === 'filled_unverified') {
          if (!frontierGen) {
            frontierGen = gen;
            frontierType = 'verify';
          }
        }
      }
      if (frontierGen) break;
    }

    const filledDescendants = Array.from(ahnentafel.values()).filter(
      s => s.individual && s.generation >= 3,
    ).length;

    lineFrontiers.push({
      lineIndex: lineIdx,
      lineName: anchorName,
      anchorIndividual: anchorData.individual,
      frontierGeneration: frontierGen,
      frontierType,
      populatedDescendantLines: filledDescendants > 0 ? 1 : 0,
    });
  }

  // Beacons: frontier slots ranked by impact
  const beaconCandidates: Beacon[] = lineFrontiers
    .map(frontier => {
      const slot = frontier.anchorIndividual ? ahnentafel.get(frontier.lineIndex + 4) : null;
      if (!slot || frontier.frontierGeneration === null) return null;

      const generationsOpened = 8 - frontier.frontierGeneration;

      return {
        slotNumber: slot.slot,
        generation: slot.generation,
        individual: slot.individual,
        convergedLineCount: frontier.populatedDescendantLines,
        generationsOpened,
        whyStatement: `Converges ${frontier.populatedDescendantLines} line(s); ${frontier.frontierType} at gen ${frontier.frontierGeneration} → ${generationsOpened} generations of potential discovery`,
        rank: 0, // filled in by rankBeacons
      };
    })
    .filter(b => b !== null) as Beacon[];

  const rankedBeacons = rankBeacons(beaconCandidates);

  // Golden threads: fully verified lines through gen 8
  const goldenThreads: GoldenThread[] = lineFrontiers
    .filter(frontier => frontier.frontierGeneration === null && frontier.frontierType === 'clear')
    .map(frontier => {
      const lastGen8Slot = 256 + frontier.lineIndex * 32; // rough mapping; TODO: proper computation
      const terminalSlot = ahnentafel.get(lastGen8Slot);

      return {
        lineIndex: frontier.lineIndex,
        lineName: frontier.lineName,
        terminantIndividual: terminalSlot?.individual ?? null,
        terminantBirthYear: terminalSlot?.individual?.birthYear ?? null,
        label: `— ${frontier.lineName} thread continues, verified, to ${terminalSlot?.individual?.birthYear ?? '?'} —`,
      };
    });

  // Headline stats
  const totalSlots = 510; // slots 2–511
  const filledSlots = Array.from(ahnentafel.values()).filter(s => s.individual).length;
  const verifiedSlots = Array.from(ahnentafel.values()).filter(s => s.state === 'verified').length;

  const headlineStats = {
    filledPercent: Math.round((filledSlots / totalSlots) * 100),
    verifiedPercent: filledSlots > 0 ? Math.round((verifiedSlots / filledSlots) * 100) : 0,
    beaconCount: rankedBeacons.length,
  };

  return {
    treeId,
    homePersonId: homePerson.id,
    generationStats,
    ahnentafel,
    lineFrontiers,
    beacons: rankedBeacons,
    goldenThreads,
    headlineStats,
    computedAt: new Date(),
  };
}
