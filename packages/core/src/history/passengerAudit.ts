/**
 * Sanity checks on the records the matcher trusts.
 *
 * The Crossing Library is not authored here — every row is a claim made
 * by a published transcription — but a claim can still be impossible on
 * its face. A one-year-old born in 1596, a passenger dead before the
 * ship sailed, a vice-president on the Winthrop Fleet: the matcher
 * quietly refuses these, and the person who should have been found is
 * simply never found. Better to see the contradiction at import.
 *
 * The rules come in two tiers. A CONTRADICTION is impossible for any
 * person on any dated event, and blocks an import. A LOOK is a pattern
 * that has proven to mean trouble (the same Wikidata item cited twice,
 * a wife wearing her husband's exact dates) but is sometimes innocent —
 * it prints, and a person decides.
 *
 * The contradiction rules know nothing about ships. They read a subject
 * with a birth year, a death year, an age, and the year of some dated
 * event, so any list that loads into that shape — a passenger list, a
 * census, a deportation roll — gets them for free.
 */

import type { Passenger, PassengerDataset } from './passengers.js';

/** The minimum a record must say for the rules to have anything to test. */
export interface DatedSubject {
  id: string;
  /** Display name, for the reason text. */
  label: string;
  birthYear: number | null;
  deathYear: number | null;
  /** Age as recorded at the event, where the record gives one. */
  age: number | null;
  /** The year the record places the person somewhere: arrival, enumeration, embarkation. */
  eventYear: number;
  /** What the event is called in a reason: "the Mayflower arrived", "the census". */
  eventLabel: string;
}

export type AuditTier = 'contradiction' | 'look';

export interface AuditFlag {
  tier: AuditTier;
  rule: string;
  id: string;
  /** Plain words, the way the matcher's reasons read. */
  reason: string;
}

export interface AuditOptions {
  /** Years an age may disagree with a birth year before it is a contradiction. */
  ageTolerance?: number;
  /** A lifespan beyond this is a contradiction, not a long life. */
  maxLifespan?: number;
}

const DEFAULTS = { ageTolerance: 5, maxLifespan: 105 };

/** The generic tier: rules that hold for any person on any dated event. */
export function auditDated(subjects: DatedSubject[], options: AuditOptions = {}): AuditFlag[] {
  const ageTolerance = options.ageTolerance ?? DEFAULTS.ageTolerance;
  const maxLifespan = options.maxLifespan ?? DEFAULTS.maxLifespan;
  const flags: AuditFlag[] = [];
  const contradiction = (s: DatedSubject, rule: string, reason: string) =>
    flags.push({ tier: 'contradiction', rule, id: s.id, reason: `${s.label}: ${reason}` });

  for (const s of subjects) {
    if (!s.label.trim()) contradiction(s, 'no-name', 'no name at all');
    if (s.birthYear !== null && s.birthYear > s.eventYear) {
      contradiction(s, 'born-after-event', `born ${s.birthYear}, ${s.birthYear - s.eventYear} years after ${s.eventLabel}`);
    }
    if (s.deathYear !== null && s.deathYear < s.eventYear) {
      contradiction(s, 'died-before-event', `died ${s.deathYear}, ${s.eventYear - s.deathYear} years before ${s.eventLabel}`);
    }
    if (s.birthYear !== null && s.deathYear !== null) {
      if (s.deathYear < s.birthYear) {
        contradiction(s, 'died-before-born', `died ${s.deathYear}, before being born in ${s.birthYear}`);
      } else if (s.deathYear - s.birthYear > maxLifespan) {
        contradiction(s, 'lifespan', `${s.birthYear}–${s.deathYear} is a life of ${s.deathYear - s.birthYear} years`);
      }
    }
    if (s.age !== null) {
      if (s.age < 0 || s.age > maxLifespan) {
        contradiction(s, 'age-out-of-range', `an age of ${s.age}`);
      } else if (s.birthYear !== null) {
        const implied = s.eventYear - s.age;
        const gap = Math.abs(implied - s.birthYear);
        if (gap > ageTolerance) {
          contradiction(
            s,
            'age-disagrees-with-birth',
            `aged ${s.age} when ${s.eventLabel} puts the birth about ${implied}, but the row says ${s.birthYear} (${gap} years apart)`,
          );
        }
      }
    }
  }
  return flags;
}

function wikidataItem(source: string): string | null {
  const match = /\((Q\d+)\)/.exec(source);
  return match ? match[1]! : null;
}

/**
 * The Crossing Library's audit: the generic rules over every passenger,
 * plus the looks that this library's own history taught.
 */
export function auditPassengers(dataset: PassengerDataset, options: AuditOptions = {}): AuditFlag[] {
  const voyages = new Map(dataset.voyages.map((v) => [v.id, v]));
  const subjects: DatedSubject[] = [];
  const flags: AuditFlag[] = [];
  const look = (p: Passenger, rule: string, reason: string) =>
    flags.push({ tier: 'look', rule, id: p.id, reason: `${p.fullName}: ${reason}` });

  for (const p of dataset.passengers) {
    const voyage = voyages.get(p.voyageId);
    if (!voyage) {
      flags.push({
        tier: 'contradiction',
        rule: 'unknown-voyage',
        id: p.id,
        reason: `${p.fullName}: voyage "${p.voyageId}" is not in the dataset`,
      });
      continue;
    }
    subjects.push({
      id: p.id,
      label: p.fullName,
      birthYear: p.birthYear,
      deathYear: p.deathYear,
      age: p.ageAtVoyage,
      eventYear: voyage.arrivalYear,
      eventLabel: `the ${voyage.ship} arrived in ${voyage.arrivalYear}`,
    });
  }
  flags.push(...auditDated(subjects, options));

  // A Wikidata item is one person. Two rows citing it means one of them
  // wears somebody else's dates — a wife her husband's, a son his
  // father's, an ancestor his famous descendant's.
  const byItem = new Map<string, Passenger[]>();
  for (const p of dataset.passengers) {
    const item = wikidataItem(p.source);
    if (item) byItem.set(item, [...(byItem.get(item) ?? []), p]);
  }
  for (const [item, rows] of byItem) {
    if (rows.length < 2) continue;
    for (const p of rows) {
      const others = rows.filter((o) => o !== p).map((o) => o.fullName);
      look(p, 'wikidata-item-shared', `cites ${item}, which also dates ${others.join(', ')}`);
    }
  }

  // Dates without a source that names where dates came from are a
  // question; a source that names one but carries no dates is another.
  for (const p of dataset.passengers) {
    if (/dates via/i.test(p.source) && p.birthYear === null && p.deathYear === null) {
      look(p, 'dates-cited-not-carried', 'the source says where its dates came from, but the row has none');
    }
  }

  // Two same-surname rows on one voyage with different given names and
  // identical dates. Sometimes a married couple sworn at the same age;
  // sometimes one name the OCR split in two; sometimes borrowed dates.
  const byHousehold = new Map<string, Passenger[]>();
  for (const p of dataset.passengers) {
    if (p.birthYear === null && p.deathYear === null) continue;
    const key = `${p.voyageId}|${p.surname.toLowerCase()}|${p.birthYear}|${p.deathYear}`;
    byHousehold.set(key, [...(byHousehold.get(key) ?? []), p]);
  }
  for (const rows of byHousehold.values()) {
    if (rows.length < 2) continue;
    const givens = new Set(rows.map((p) => p.givenNames.toLowerCase()));
    if (givens.size < 2) continue;
    for (const p of rows) {
      const others = rows.filter((o) => o !== p).map((o) => o.fullName);
      look(p, 'household-shares-dates', `carries exactly the dates of ${others.join(', ')} on the same voyage`);
    }
  }

  return flags;
}

/** A report a person reads, grouped by tier, contradictions first. */
export function formatAudit(flags: AuditFlag[]): string {
  const lines: string[] = [];
  for (const tier of ['contradiction', 'look'] as const) {
    const rows = flags.filter((f) => f.tier === tier);
    if (rows.length === 0) continue;
    lines.push(
      tier === 'contradiction'
        ? `${rows.length} contradiction${rows.length === 1 ? '' : 's'} — impossible on their face:`
        : `${rows.length} worth a look:`,
    );
    for (const f of rows) lines.push(`   [${f.rule}] ${f.reason}`);
  }
  return lines.join('\n');
}
