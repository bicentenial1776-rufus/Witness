import type { HealthFinding } from '../query/treeHealth.js';
import { findingKey } from '../query/treeHealth.js';
import type { NaraCandidate } from '../query/naraRecords.js';
import type { OceanCrossing } from '../query/placeDiscovery.js';
import type { MigrationPath } from '../query/migrations.js';

/**
 * The unified finding — Approach A's plumbing (docs/cohesion-design-brief.md).
 *
 * Every feature that notices something about the tree emits one of these
 * instead of owning a private shape: Tree Health's audit sentences, the
 * Archives' candidate records, the pattern engines' crossings and moves.
 * The Portrait reads its person's slice; The Issue's desks each file one a
 * week. Today findings are assembled client-side from the session caches
 * and the tables that already persist (marks, rulings, NARA candidates);
 * a server-side findings table is the planned persistence upgrade, and
 * this type is its row shape.
 */
export type FindingSource = 'tree-health' | 'archives' | 'crossing' | 'migration';

export interface Finding {
  /** Stable within a tree: `source:` + the emitting feature's own key. */
  id: string;
  source: FindingSource;
  /** Everyone implicated — first id is the primary subject. */
  subjectIds: string[];
  /** One editorial sentence, ready to print. Names in, jargon out. */
  sentence: string;
}

export function fromHealthFinding(finding: HealthFinding): Finding {
  return {
    id: `tree-health:${findingKey(finding)}`,
    source: 'tree-health',
    subjectIds: finding.individualIds,
    sentence: finding.detail,
  };
}

export function fromNaraCandidate(candidate: NaraCandidate): Finding {
  return {
    id: `archives:${candidate.id}`,
    source: 'archives',
    subjectIds: [candidate.individualId],
    sentence: `A federal record — ${candidate.title} — might be ${candidate.individualName}.`,
  };
}

export function fromOceanCrossing(crossing: OceanCrossing): Finding {
  const voyage =
    crossing.direction === 'toAmericas'
      ? `${crossing.from.country} to ${crossing.to.country}`
      : `back from ${crossing.from.country} to ${crossing.to.country}`;
  return {
    id: `crossing:${crossing.individual.id}:${crossing.from.year}`,
    source: 'crossing',
    subjectIds: [crossing.individual.id],
    sentence: `${crossing.individual.full_name} crossed the ocean — ${voyage}, by ${crossing.to.year}.`,
  };
}

export function fromMigrationPath(path: MigrationPath): Finding {
  const when = path.medianYear !== null ? `, around ${path.medianYear}` : '';
  return {
    id: `migration:${path.from}>${path.to}`,
    source: 'migration',
    subjectIds: path.movers.map((mover) => mover.individualId),
    sentence: `${path.count === 1 ? 'One of your people' : `${path.count} of your people`} moved from ${path.from} to ${path.to}${when}.`,
  };
}

/* ------------------------------------------------------------------ */
/* The Issue — the weekly edition's arithmetic.                        */
/* ------------------------------------------------------------------ */

export interface IssueEdition {
  /** ISO week number, 1–53 — the issue's "No." */
  number: number;
  /** The issue's year (ISO week-year, so a January 1 can belong to the old volume). */
  volume: number;
  /** "the week of August 3" — Monday of the ISO week. */
  weekOfLabel: string;
  /** Stable seed for this edition's deterministic picks. */
  key: string;
}

/** Monday of the date's ISO week, at local midnight. */
export function isoWeekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() === 0 ? 7 : d.getDay(); // Mon=1 … Sun=7
  d.setDate(d.getDate() - (day - 1));
  return d;
}

export function issueOf(date: Date): IssueEdition {
  const monday = isoWeekStart(date);
  // ISO week number: count weeks to the Thursday of this week.
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const volume = thursday.getFullYear();
  const jan1 = new Date(volume, 0, 1);
  const number = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  const weekOfLabel = `the week of ${monday.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  })}`;
  return { number, volume, weekOfLabel, key: `${volume}-W${number}` };
}

/**
 * The ration: one item per desk per edition, the same one all week on
 * every device — a periodical, not a slot machine. FNV-1a over the seed
 * so the pick is stable without Math.random.
 */
export function pickWeekly<T>(items: readonly T[], seed: string): T | null {
  if (items.length === 0) return null;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return items[hash % items.length] ?? null;
}
