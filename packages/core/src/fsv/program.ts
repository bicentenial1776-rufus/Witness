/**
 * THE FSV BRIDGE — a tree becomes a program for a world.
 *
 * This is the seam named in `docs/FSV_WITNESS_BRIDGE.md` §3: pure functions,
 * no rendering, nothing that imports three.js. Witness already parses the
 * file, indexes the tree, models households and knows which people are
 * living. FSV needs one thing from all of that — an ordered, dated,
 * placed list of households with an honest confidence on each — and this
 * produces it.
 *
 * Three rules the design repo holds, restated here because they must
 * survive the crossing:
 *
 *  1. THE LIVING BAND IS WITHHELD. A household with any living member
 *     carries a year and a surname and nothing else: no names, no dates,
 *     no place. `individuals.living` is authoritative; an unrecorded death
 *     is not the same as living, and neither is inferred here.
 *  2. SAME FILE, SAME SEED, SAME WORLD. Every seed is derived from the
 *     household key by FNV-1a — the same hash Witness already uses for its
 *     weekly picks — so the world is reproducible on any device and in any
 *     order. No Date.now(), no Math.random().
 *  3. CONFIDENCE IS READ, NOT RE-SCORED. The bands come from what the
 *     record actually holds — a dated marriage, a named place, a birth year
 *     — in the same documented / period-typical / inferred vocabulary the
 *     app already shows the reader.
 */

import type { TreeIndex } from '../query/treeIndex.js';
import { buildFamilyStages, type FamilyStage } from '../query/familyStage.js';

/** How much the record actually says about a household. */
export type FsvConfidence = 'documented' | 'period_typical' | 'inferred';

export interface FsvHousehold {
  /** The stage key — the household head's individual id. The two worlds
      address the same units by this, so a parcel and a Family Stage screen
      are the same thing seen twice. */
  key: string;
  /** Surname only. Safe for a living household; everything else is not. */
  surname: string;
  /** Marriage year where the record gives one, else the head's birth + 25
      as a placed guess — flagged `inferred` when that happens. */
  year: number;
  /** Free text as the record wrote it, or null. Null for living households
      whatever the record says. */
  place: string | null;
  /** Country as Witness classified it, or null. */
  country: string | null;
  confidence: FsvConfidence;
  /** Any living member: the world must withhold this household's detail. */
  hasLiving: boolean;
  /** Children recorded at this household, for scale. Zero for living. */
  children: number;
  /** Deterministic per-household seed. */
  seed: number;
}

export interface FsvProgram {
  households: FsvHousehold[];
  /** The span the world is built across, from the record's own dates. */
  yearStart: number;
  yearEnd: number;
  counts: {
    households: number;
    placed: number;
    living: number;
    documented: number;
    periodTypical: number;
    inferred: number;
  };
}

/** FNV-1a over a string — the house hash, matching `pickWeekly`. */
export function fsvSeed(key: string): number {
  let x = 2166136261;
  for (let i = 0; i < key.length; i++) {
    x ^= key.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}

function placeOf(index: TreeIndex, stage: FamilyStage): { raw: string | null; country: string | null } {
  const fam = index.families.find((f) => f.husband_id === stage.key || f.wife_id === stage.key);
  const pid = fam?.marriage_place_id ?? null;
  if (pid) {
    const p = index.places.get(pid);
    if (p) return { raw: p.raw, country: p.country };
  }
  // fall back to the head's earliest placed event
  const ev = index.events
    .filter((e) => e.individualId === stage.key && e.placeId)
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))[0];
  if (ev?.placeId) {
    const p = index.places.get(ev.placeId);
    if (p) return { raw: p.raw, country: p.country };
  }
  return { raw: null, country: null };
}

/**
 * Turn an indexed tree into the world's program.
 *
 * `currentYear` is passed rather than read from the clock so the result is
 * reproducible: the same file resolves to the same world on any day.
 */
export function resolveFsvProgram(index: TreeIndex, currentYear: number): FsvProgram {
  const stages = buildFamilyStages(index, { currentYear });
  const households: FsvHousehold[] = [];

  for (const stage of stages.byKey.values()) {
    const head = index.individuals.get(stage.key);
    const surname = head?.surname ?? stage.label ?? 'unknown';
    const hasLiving = stage.hasLiving;

    const marriageYear = Number.isFinite(stage.marriage) ? stage.marriage : NaN;
    const birth = head?.birth_year ?? null;
    let year: number;
    let dated: boolean;
    if (Number.isFinite(marriageYear) && marriageYear > 0) {
      year = marriageYear;
      dated = true;
    } else if (birth !== null) {
      year = birth + 25;
      dated = false;
    } else {
      continue; // undateable: the world cannot place it, so it is not in the program
    }

    // living households give up their place as well as their names
    const p = hasLiving ? { raw: null, country: null } : placeOf(index, stage);

    let confidence: FsvConfidence;
    if (dated && p.raw) confidence = 'documented';
    else if (dated) confidence = 'period_typical';
    else confidence = 'inferred';

    const children = hasLiving
      ? 0
      : stage.marriages.reduce((n, m) => n + m.children.length, 0);

    households.push({
      key: stage.key,
      surname,
      year: Math.round(year),
      place: p.raw,
      country: p.country,
      confidence,
      hasLiving,
      children,
      seed: fsvSeed(stage.key)
    });
  }

  // a stable order: by year, then key, so two runs agree exactly
  households.sort((a, b) => (a.year - b.year) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const years = households.map((h) => h.year);
  return {
    households,
    yearStart: years.length ? Math.min(...years) : currentYear,
    yearEnd: years.length ? Math.max(...years) : currentYear,
    counts: {
      households: households.length,
      placed: households.filter((h) => h.place !== null).length,
      living: households.filter((h) => h.hasLiving).length,
      documented: households.filter((h) => h.confidence === 'documented').length,
      periodTypical: households.filter((h) => h.confidence === 'period_typical').length,
      inferred: households.filter((h) => h.confidence === 'inferred').length
    }
  };
}
