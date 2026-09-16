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

import { soundex } from '../query/orphanRecords.js';

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
  /**
   * The date the port register recorded them, where the list is a
   * register rather than a reconstruction — a partial ISO date
   * ('1635-12-25', or '1635-12' when the day did not survive the OCR).
   * The sailing itself came days or weeks later.
   */
  registerDate?: string;
  /** Where the register says the ship was bound. */
  boundFor?: string;
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
  /**
   * The people this person married, when the tree knows them. Optional:
   * a caller that cannot supply spouses gets the name pass alone, and
   * the household pass (see matchPassengers) simply has nothing to do.
   */
  spouseIds?: string[];
  /** Recorded sex, when the tree has one; unknown reads as 'U'. */
  sex?: 'M' | 'F' | 'U';
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

export function firstGiven(givenNames: string): string {
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

interface YearWeighing {
  reasons: string[];
  yearsAgree: boolean;
  alive: boolean;
}

/**
 * The year tests every pair must pass, whichever pass proposed it. Null
 * means the years contradict the pairing outright.
 */
function weighYears(
  passenger: Passenger,
  individual: MatchableIndividual,
  voyage: Voyage,
  tolerance: number,
  conflict: number,
): YearWeighing | null {
  const birth = compareYears('birth', passenger.birthYear, individual.birthYear, tolerance, conflict);
  const death = compareYears('death', passenger.deathYear, individual.deathYear, tolerance, conflict);
  if (birth.conflicts || death.conflicts) return null;
  // Nobody sails before they are born.
  if (individual.birthYear !== null && individual.birthYear > voyage.arrivalYear) return null;
  // Nor after they are buried.
  if (individual.deathYear !== null && individual.deathYear < voyage.arrivalYear) return null;
  const reasons: string[] = [];
  if (birth.reason) reasons.push(birth.reason);
  if (death.reason) reasons.push(death.reason);
  const alive =
    individual.birthYear !== null &&
    individual.birthYear <= voyage.arrivalYear &&
    (individual.deathYear === null || individual.deathYear >= voyage.arrivalYear);
  if (alive) reasons.push(`alive in ${voyage.arrivalYear}, when the ${voyage.ship} arrived`);
  return { reasons, yearsAgree: birth.agrees || death.agrees, alive };
}

/**
 * Candidate matches between a passenger dataset and a tree. One
 * individual can appear against several passengers and vice versa — the
 * matcher reports, it does not decide.
 *
 * Two passes. The name pass reads every passenger against the tree's
 * surname bucket. The household pass then reads each candidate's
 * spouses against the same voyage under the passenger's surname — a
 * list writes a wife as Sarah Eaton, a tree writes her under her maiden
 * name or as plain "Sarah", and no surname bucket brings those together.
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
  // Probable-or-better candidates by individual id, kept before the
  // floor is applied: they anchor the household pass whatever the caller
  // asked to see.
  const anchors = new Map<string, MatchCandidate[]>();
  const passengersByVoyage = new Map<string, Passenger[]>();

  for (const passenger of dataset.passengers) {
    const voyage = voyages.get(passenger.voyageId);
    if (!voyage) continue;
    passengersByVoyage.set(voyage.id, [...(passengersByVoyage.get(voyage.id) ?? []), passenger]);
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

      const surnameExact = normalizeNamePart(parts.surname) === passengerSurname;
      const reasons = [
        surnameExact && givenExact
          ? `name matches exactly (${passenger.fullName})`
          : `name matches by sound (${passenger.fullName} / ${individual.fullName})`,
      ];

      const years = weighYears(passenger, individual, voyage, yearTolerance, yearConflict);
      if (!years) continue;
      reasons.push(...years.reasons);

      const confidence: MatchConfidence =
        surnameExact && givenExact && years.yearsAgree
          ? 'strong'
          : years.yearsAgree || (surnameExact && givenExact && years.alive)
            ? 'probable'
            : 'weak';
      const candidate: MatchCandidate = { passenger, voyage, individual, confidence, reasons };
      if (confidence !== 'weak') {
        anchors.set(individual.id, [...(anchors.get(individual.id) ?? []), candidate]);
      }
      if (CONFIDENCE_RANK[confidence] < floor) continue;
      candidates.push(candidate);
    }
  }

  // ── The household pass ───────────────────────────────────────────
  // Each anchor is a person the name pass already places on a voyage at
  // probable or better. Their spouses are read against that voyage under
  // the anchor passenger's surname: a given name that sounds alike, and
  // the same year tests. The anchor is evidence of the household, not
  // of the person, so the result is capped at probable — and it says so.
  const seen = new Set(candidates.map((c) => `${c.individual.id}:${c.passenger.id}`));
  for (const individual of individuals) {
    if (!individual.spouseIds?.length) continue;
    // The lists of this era write a household under the husband's name;
    // nobody is written under a wife's. A man read under his wife's
    // maiden surname would only ever find her father or brother.
    if (individual.sex === 'M') continue;
    const parts = splitName(individual.fullName);
    // A one-word name on a spouse's record is a given name with nothing
    // after it — "Sarah", not the Sarah family.
    const bareGiven = parts.givenNames === '';
    const given = normalizeNamePart(bareGiven ? parts.surname : firstGiven(parts.givenNames));
    if (!given) continue;
    const ownSurname = bareGiven ? '' : normalizeNamePart(parts.surname);

    for (const spouseId of individual.spouseIds) {
      for (const anchor of anchors.get(spouseId) ?? []) {
        // Someone the name pass already places on this voyage under
        // their own name is not read again under somebody else's.
        if ((anchors.get(individual.id) ?? []).some((own) => own.voyage.id === anchor.voyage.id)) continue;
        const surname = normalizeNamePart(anchor.passenger.surname);
        // Same-sounding surnames already met in the name pass; if they
        // parted there, the years said so, and the household cannot
        // overrule that.
        if (ownSurname && soundex(ownSurname) === soundex(surname)) continue;

        for (const passenger of passengersByVoyage.get(anchor.voyage.id) ?? []) {
          if (passenger.id === anchor.passenger.id) continue;
          if (normalizeNamePart(passenger.surname) !== surname) continue;
          if (seen.has(`${individual.id}:${passenger.id}`)) continue;
          const passengerGiven = normalizeNamePart(firstGiven(passenger.givenNames));
          if (!passengerGiven || soundex(given) !== soundex(passengerGiven)) continue;

          const years = weighYears(passenger, individual, anchor.voyage, yearTolerance, yearConflict);
          if (!years) continue;
          const reasons = [
            ownSurname
              ? `recorded as ${individual.fullName} in the tree; read under the spouse's surname as ${passenger.fullName}`
              : `no surname in the tree; read as ${passenger.fullName}`,
            `beside ${anchor.individual.fullName}, a ${anchor.confidence} match for ${anchor.passenger.fullName} on the same voyage`,
            ...years.reasons,
          ];
          const confidence: MatchConfidence =
            anchor.confidence === 'strong' || years.yearsAgree ? 'probable' : 'weak';
          seen.add(`${individual.id}:${passenger.id}`);
          if (CONFIDENCE_RANK[confidence] < floor) continue;
          candidates.push({ passenger, voyage: anchor.voyage, individual, confidence, reasons });
        }
      }
    }
  }

  return candidates.sort(
    (a, b) =>
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
      a.voyage.arrivalYear - b.voyage.arrivalYear ||
      a.passenger.fullName.localeCompare(b.passenger.fullName),
  );
}
