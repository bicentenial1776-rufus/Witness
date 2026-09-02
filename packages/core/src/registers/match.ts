import { normalizeNamePart, splitName } from '../history/passengers.js';
import { soundex } from '../query/orphanRecords.js';
import type {
  MatchConfig,
  RegisterMatchCandidate,
  RegisterMatchConfidence,
  RegisterPersonFacts,
  RegisterRecord,
} from './types.js';

/**
 * The Variant A matcher: which register rows might be which tree people.
 * The rules are the Crossing Library's proven core — surname soundex
 * buckets, sound-alike given names, year plausibility with tolerance and
 * a hard conflict cut — re-expressed over register rows. Confidence stays
 * rule-based (strong/probable/weak with plain-words reasons) rather than
 * numeric config weights: the reasons are the product, and the framework
 * grows weights only when a register proves it needs them.
 *
 * Year facts on a record come from its attributes: `birth_year`,
 * `death_year`, and `event_year` (the year the record places the person
 * somewhere — an embarkation, a claim, a marriage), all optional.
 */
const DEFAULT_TOLERANCE = 5;
const DEFAULT_CONFLICT = 15;
const DEFAULT_CAP = 5;

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * A register's code plugin — the escape hatch for signals config cannot
 * express. Normalizers fold period spelling and cross-language variants
 * into canonical forms before any comparison (both sides pass through);
 * extraSignals judges a pairing on register-specific facts — an origin
 * settlement against a birthplace, a destination colony against later
 * events — and may promote its confidence one step, or veto it, always
 * with plain-words reasons.
 */
export interface RegisterMatchPlugin {
  normalizeGiven?: (name: string) => string;
  normalizeSurname?: (name: string) => string;
  extraSignals?: (
    person: RegisterPersonFacts,
    record: RegisterRecord,
  ) => { reasons: string[]; promote?: boolean; veto?: boolean };
}

const PROMOTE: Record<RegisterMatchConfidence, RegisterMatchConfidence> = {
  weak: 'probable',
  probable: 'strong',
  strong: 'strong',
};

export function matchRegisterRecords(
  records: readonly RegisterRecord[],
  people: readonly RegisterPersonFacts[],
  config: MatchConfig = {},
  plugin: RegisterMatchPlugin = {},
): RegisterMatchCandidate[] {
  const tolerance = config.yearTolerance ?? DEFAULT_TOLERANCE;
  const conflict = config.yearConflict ?? DEFAULT_CONFLICT;
  const cap = config.maxCandidatesPerPerson ?? DEFAULT_CAP;
  const canonGiven = plugin.normalizeGiven ?? ((n: string) => n);
  const canonSurname = plugin.normalizeSurname ?? ((n: string) => n);

  // Surname soundex buckets, the passengers strategy: cost is bucket
  // size, not records × people. Bucketing runs on the CANONICAL surname
  // so a plugin's variants land together.
  const buckets = new Map<string, RegisterRecord[]>();
  for (const record of records) {
    if (record.recordKind !== 'person') continue;
    const surname = record.surnameNormalized ?? splitName(record.nameAsRecorded).surname;
    const key = soundex(normalizeNamePart(canonSurname(surname)));
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(record);
    else buckets.set(key, [record]);
  }

  const candidates: RegisterMatchCandidate[] = [];
  for (const person of people) {
    const { givenNames: given, surname } = splitName(person.fullName);
    const key = soundex(normalizeNamePart(canonSurname(surname)));
    const bucket = key ? buckets.get(key) : undefined;
    if (!bucket) continue;

    const personCandidates: RegisterMatchCandidate[] = [];
    for (const record of bucket) {
      const recordGiven = record.givenNormalized ?? splitName(record.nameAsRecorded).givenNames;
      const recordSurname = record.surnameNormalized ?? splitName(record.nameAsRecorded).surname;
      const givenNorm = normalizeNamePart(canonGiven(given));
      const recordGivenNorm = normalizeNamePart(canonGiven(recordGiven));
      if (!givenNorm || !recordGivenNorm) continue;
      const givenExact = givenNorm === recordGivenNorm;
      const givenSound = soundex(givenNorm) === soundex(recordGivenNorm);
      if (!givenExact && !givenSound) continue;
      const surnameExact =
        normalizeNamePart(canonSurname(surname)) === normalizeNamePart(canonSurname(recordSurname));

      const reasons: string[] = [];
      const nameExact = givenExact && surnameExact;
      reasons.push(
        nameExact
          ? `name matches exactly (${record.nameAsRecorded})`
          : `name matches by sound (${record.nameAsRecorded} / ${person.fullName})`,
      );

      // Year plausibility: agreement upgrades, contradiction kills.
      const recordBirth = numeric(record.attributes['birth_year']);
      const recordDeath = numeric(record.attributes['death_year']);
      const recordEvent = numeric(record.attributes['event_year']);
      let yearAgrees = false;
      let contradicted = false;

      for (const [ours, theirs, label] of [
        [person.birthYear, recordBirth, 'birth'],
        [person.deathYear, recordDeath, 'death'],
      ] as const) {
        if (ours === null || theirs === null) continue;
        const gap = Math.abs(ours - theirs);
        if (gap <= tolerance) {
          yearAgrees = true;
          reasons.push(
            gap === 0
              ? `${label} year ${ours} matches exactly`
              : `${label} ${theirs} and ${ours} agree within ${gap}`,
          );
        } else if (gap > conflict) {
          contradicted = true;
        }
      }
      if (recordEvent !== null) {
        const bornAfter = person.birthYear !== null && person.birthYear > recordEvent;
        const deadBefore = person.deathYear !== null && person.deathYear < recordEvent;
        if (bornAfter || deadBefore) contradicted = true;
        else if (person.birthYear !== null || person.deathYear !== null) {
          reasons.push(`alive in ${recordEvent}, when the record places them`);
        }
      }
      if (contradicted) continue;

      const aliveWindow =
        recordEvent !== null && (person.birthYear !== null || person.deathYear !== null);
      let confidence: RegisterMatchConfidence;
      if (nameExact && yearAgrees) confidence = 'strong';
      else if (yearAgrees || (nameExact && aliveWindow)) confidence = 'probable';
      else confidence = 'weak';

      if (plugin.extraSignals) {
        const extra = plugin.extraSignals(person, record);
        if (extra.veto) continue;
        reasons.push(...extra.reasons);
        if (extra.promote && extra.reasons.length > 0) confidence = PROMOTE[confidence];
      }

      personCandidates.push({ person, record, confidence, reasons });
    }

    const RANK: Record<RegisterMatchConfidence, number> = { strong: 0, probable: 1, weak: 2 };
    personCandidates.sort((a, b) => RANK[a.confidence] - RANK[b.confidence]);
    candidates.push(...personCandidates.slice(0, cap));
  }
  return candidates;
}
