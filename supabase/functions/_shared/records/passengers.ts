// Mirrored from packages/core/src/history/passengers.ts — keep in sync
// (portSync.test.ts enforces byte equality outside this header).
/**
 * Immigrant-ship passenger lists, and the machinery for asking whether
 * anyone in a tree sailed on one.
 *
 * The dataset is not authored here. Passenger facts — who sailed, when
 * they were born, when they died — come from published transcriptions
 * whose provenance is recorded per row (see data/immigrant-ships/
 * README.md). This file holds the shape those transcriptions load into
 * and the matcher that reads them against a tree.
 *
 * House doctrine holds: curiosities, not verdicts. A match is a
 * candidate to investigate, never a claim that an ancestor sailed. Two
 * men named John Cooke born within a decade of each other is a question,
 * and the answer lives in the record, not in a soundex code.
 */

import { soundex } from './soundex.ts';

export interface Voyage {
  /** Stable slug used in dataset rows and match output. */
  id: string;
  ship: string;
  /** The year the ship reached its destination. */
  arrivalYear: number;
  departurePort?: string;
  arrivalPlace?: string;
  notes?: string;
  /** Where the voyage's facts come from. */
  source: string;
}

export interface Passenger {
  /** `${voyageId}:${slug}` — stable across re-imports of the same source. */
  id: string;
  voyageId: string;
  fullName: string;
  givenNames: string;
  surname: string;
  birthYear: number | null;
  deathYear: number | null;
  /** As recorded on the list, where the list gives ages rather than dates. */
  ageAtVoyage: number | null;
  notes?: string;
  /** Per-row provenance: the transcription this passenger came from. */
  source: string;
}

export interface PassengerDataset {
  voyages: Voyage[];
  passengers: Passenger[];
}

/** The tree side of the comparison — whatever can supply these fields. */
export interface MatchableIndividual {
  id: string;
  fullName: string;
  birthYear: number | null;
  deathYear: number | null;
}

export type MatchConfidence = 'strong' | 'probable' | 'weak';

export interface MatchCandidate {
  passenger: Passenger;
  voyage: Voyage;
  individual: MatchableIndividual;
  confidence: MatchConfidence;
  /** Plain-language grounds, for a report a human reads. */
  reasons: string[];
}

export interface MatchOptions {
  /** Years apart two birth (or death) years may be and still agree. */
  yearTolerance?: number;
  /** Beyond this, the years contradict each other and the pair is dropped. */
  yearConflict?: number;
  /** Drop candidates below this confidence. */
  minimumConfidence?: MatchConfidence;
}

const DEFAULTS = { yearTolerance: 5, yearConflict: 15 };

const CONFIDENCE_RANK: Record<MatchConfidence, number> = { weak: 0, probable: 1, strong: 2 };

/**
 * Spelling in this era is a suggestion, not a fact: the same man signs
 * Standish and Standishe, and a clerk writes Cooke for Cook. Names are
 * compared on a normalized form first and a soundex code second.
 */
export function normalizeNamePart(part: string): string {
  return part
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '');
}

/** Splits a display name into given names and surname. */
export function splitName(fullName: string): { givenNames: string; surname: string } {
  // GEDCOM-style slashes win where present: "John /Alden/".
  const slashed = /\/([^/]*)\//.exec(fullName);
  if (slashed) {
    return {
      givenNames: fullName.replace(slashed[0], '').trim(),
      surname: slashed[1]!.trim(),
    };
  }
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { givenNames: '', surname: parts[0] ?? '' };
  return { givenNames: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1]! };
}

function firstGiven(givenNames: string): string {
  return givenNames.trim().split(/\s+/)[0] ?? '';
}

interface YearVerdict {
  agrees: boolean;
  conflicts: boolean;
  reason: string | null;
}

function compareYears(
  label: string,
  a: number | null,
  b: number | null,
  tolerance: number,
  conflict: number,
): YearVerdict {
  if (a === null || b === null) return { agrees: false, conflicts: false, reason: null };
  const gap = Math.abs(a - b);
  if (gap <= tolerance) {
    return {
      agrees: true,
      conflicts: false,
      reason:
        gap === 0
          ? `${label} year ${a} matches exactly`
          : `${label} ${a} and ${b} agree within ${gap}`,
    };
  }
  if (gap > conflict) {
    return { agrees: false, conflicts: true, reason: `${label} ${a} and ${b} are ${gap} apart` };
  }
  return { agrees: false, conflicts: false, reason: null };
}

/**
 * Candidate matches between a passenger dataset and a tree. One
 * individual can appear against several passengers and vice versa — the
 * matcher reports, it does not decide.
 */
export function matchPassengers(
  dataset: PassengerDataset,
  individuals: MatchableIndividual[],
  options: MatchOptions = {},
): MatchCandidate[] {
  const yearTolerance = options.yearTolerance ?? DEFAULTS.yearTolerance;
  const yearConflict = options.yearConflict ?? DEFAULTS.yearConflict;
  const floor = CONFIDENCE_RANK[options.minimumConfidence ?? 'weak'];

  const voyages = new Map(dataset.voyages.map((v) => [v.id, v]));

  // Bucket the tree by surname sound so each passenger reads a handful of
  // people rather than all five thousand.
  const bySurname = new Map<string, { individual: MatchableIndividual; parts: ReturnType<typeof splitName> }[]>();
  for (const individual of individuals) {
    const parts = splitName(individual.fullName);
    const key = soundex(normalizeNamePart(parts.surname));
    if (!key) continue;
    const bucket = bySurname.get(key) ?? [];
    bucket.push({ individual, parts });
    bySurname.set(key, bucket);
  }

  const candidates: MatchCandidate[] = [];
  for (const passenger of dataset.passengers) {
    const voyage = voyages.get(passenger.voyageId);
    if (!voyage) continue;
    const passengerSurname = normalizeNamePart(passenger.surname);
    const bucket = bySurname.get(soundex(passengerSurname));
    if (!bucket) continue;
    const passengerGiven = normalizeNamePart(firstGiven(passenger.givenNames));

    for (const { individual, parts } of bucket) {
      const given = normalizeNamePart(firstGiven(parts.givenNames));
      if (!given || !passengerGiven) continue;
      const givenExact = given === passengerGiven;
      const givenSounds = soundex(given) === soundex(passengerGiven);
      if (!givenSounds) continue;

      const reasons: string[] = [];
      const surnameExact = normalizeNamePart(parts.surname) === passengerSurname;
      reasons.push(
        surnameExact && givenExact
          ? `name matches exactly (${passenger.fullName})`
          : `name matches by sound (${passenger.fullName} / ${individual.fullName})`,
      );

      const birth = compareYears('birth', passenger.birthYear, individual.birthYear, yearTolerance, yearConflict);
      const death = compareYears('death', passenger.deathYear, individual.deathYear, yearTolerance, yearConflict);
      if (birth.conflicts || death.conflicts) continue;
      // Nobody sails before they are born.
      if (individual.birthYear !== null && individual.birthYear > voyage.arrivalYear) continue;
      // Nor after they are buried.
      if (individual.deathYear !== null && individual.deathYear < voyage.arrivalYear) continue;
      if (birth.reason) reasons.push(birth.reason);
      if (death.reason) reasons.push(death.reason);

      const alive =
        individual.birthYear !== null &&
        individual.birthYear <= voyage.arrivalYear &&
        (individual.deathYear === null || individual.deathYear >= voyage.arrivalYear);
      if (alive) reasons.push(`alive in ${voyage.arrivalYear}, when the ${voyage.ship} arrived`);

      const yearsAgree = birth.agrees || death.agrees;
      const confidence: MatchConfidence =
        surnameExact && givenExact && yearsAgree
          ? 'strong'
          : yearsAgree || (surnameExact && givenExact && alive)
            ? 'probable'
            : 'weak';
      if (CONFIDENCE_RANK[confidence] < floor) continue;

      candidates.push({ passenger, voyage, individual, confidence, reasons });
    }
  }

  return candidates.sort(
    (a, b) =>
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
      a.voyage.arrivalYear - b.voyage.arrivalYear ||
      a.passenger.fullName.localeCompare(b.passenger.fullName),
  );
}
