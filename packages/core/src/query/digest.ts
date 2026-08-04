import type { WitnessSupabaseClient } from '../supabase/client.js';

/**
 * "This Week in Your Family" — the weekly digest.
 *
 * Finds birth/death anniversaries falling in a 7-day window, then picks at
 * most three entries chosen for variety (mixed event types and family
 * branches) and biographical richness (documented places, complete lifespans,
 * direct ancestors, milestone anniversaries). The selection is pure so the
 * editorial rules live in one testable place; only the fetch touches the
 * network.
 *
 * Living persons never appear: the digest feeds AI enrichment and
 * notifications, both of which exclude the living by policy.
 */

export type DigestEventType = 'birth' | 'death';

export interface AnniversaryCandidate {
  eventId: string;
  individualId: string;
  fullName: string;
  surname: string | null;
  sex: 'M' | 'F' | 'U';
  birthYear: number | null;
  deathYear: number | null;
  eventType: DigestEventType;
  /** Original event date. Month/day are always known (that's what makes it an anniversary). */
  month: number;
  day: number;
  year: number | null;
  placeRaw: string | null;
}

export interface DigestEntry extends AnniversaryCandidate {
  /** The date the anniversary falls on within the requested window. */
  occursOn: Date;
  /** Occurrence year minus event year; null when the original year is unknown. */
  yearsAgo: number | null;
  /** Richness score used by selection — exposed for tests and debugging. */
  score: number;
}

export interface WeeklyDigest {
  weekStart: Date;
  weekEnd: Date;
  /**
   * The week's program: the best anniversary of each day that has one
   * (up to 7 rows, one person at most once), in date order. The rows that
   * also appear in `entries` are the featured ones.
   */
  days: DigestEntry[];
  /** The featured entries — the editorial 3, always a subset of `days`. */
  entries: DigestEntry[];
  /** Total anniversaries in the window before editorial selection. */
  candidateCount: number;
}

export const DIGEST_MAX_ENTRIES = 3;

export interface WindowDay {
  month: number;
  day: number;
  date: Date;
}

/**
 * The 7 calendar days starting at weekStart (time-of-day ignored). A window
 * spanning a month or year boundary works because each day carries its own
 * concrete date. Feb 29 anniversaries only surface in leap years — the
 * window simply never contains that (month, day) otherwise.
 */
export function digestWindow(weekStart: Date): WindowDay[] {
  const days: WindowDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    days.push({ month: date.getMonth() + 1, day: date.getDate(), date });
  }
  return days;
}

function milestoneBonus(yearsAgo: number | null): number {
  if (yearsAgo === null || yearsAgo <= 0) return 0;
  if (yearsAgo % 100 === 0) return 3;
  if (yearsAgo % 50 === 0) return 2;
  if (yearsAgo % 25 === 0) return 1;
  return 0;
}

/**
 * Base richness: how much of a story can we actually tell about this entry?
 * Direct ancestors outrank collaterals; a documented place and a complete
 * lifespan mean the AI note has real material; round-number anniversaries
 * are the hook that makes an entry feel like an occasion.
 */
export function scoreCandidate(
  candidate: AnniversaryCandidate,
  yearsAgo: number | null,
  directAncestorIds: ReadonlySet<string>,
): number {
  let score = 0;
  if (directAncestorIds.has(candidate.individualId)) score += 3;
  if (candidate.placeRaw) score += 2;
  if (candidate.birthYear !== null && candidate.deathYear !== null) score += 1;
  score += milestoneBonus(yearsAgo);
  return score;
}

/**
 * Greedy pick of up to DIGEST_MAX_ENTRIES. Each pick takes the highest
 * adjusted score, where already-picked surnames (-2 each) and event types
 * (-1 each) drag a candidate down — that's the variety rule. An individual
 * never appears twice. Ties break on name so selection is deterministic.
 */
export function selectDigestEntries(
  candidates: AnniversaryCandidate[],
  window: WindowDay[],
  directAncestorIds: ReadonlySet<string> = new Set(),
): DigestEntry[] {
  const byDay = new Map(window.map((d) => [`${d.month}-${d.day}`, d.date]));

  const scored: DigestEntry[] = [];
  for (const candidate of candidates) {
    const occursOn = byDay.get(`${candidate.month}-${candidate.day}`);
    if (!occursOn) continue;
    const yearsAgo = candidate.year !== null ? occursOn.getFullYear() - candidate.year : null;
    scored.push({
      ...candidate,
      occursOn,
      yearsAgo,
      score: scoreCandidate(candidate, yearsAgo, directAncestorIds),
    });
  }

  const picked: DigestEntry[] = [];
  const pickedIndividuals = new Set<string>();

  while (picked.length < DIGEST_MAX_ENTRIES) {
    let best: DigestEntry | null = null;
    let bestAdjusted = -Infinity;

    for (const entry of scored) {
      if (pickedIndividuals.has(entry.individualId)) continue;
      let adjusted = entry.score;
      for (const prior of picked) {
        if (entry.surname && prior.surname === entry.surname) adjusted -= 2;
        if (prior.eventType === entry.eventType) adjusted -= 1;
      }
      if (
        adjusted > bestAdjusted ||
        (adjusted === bestAdjusted && best !== null && entry.fullName.localeCompare(best.fullName) < 0)
      ) {
        best = entry;
        bestAdjusted = adjusted;
      }
    }

    if (!best) break;
    picked.push(best);
    pickedIndividuals.add(best.individualId);
  }

  picked.sort((a, b) => a.occursOn.getTime() - b.occursOn.getTime());
  return picked;
}

/**
 * One row per day: each day's highest-scoring anniversary, in date order.
 * A person appears at most once across the week (a same-week birth and
 * death anniversary of one ancestor yields the earlier day's row; the
 * later day falls to its next-best candidate). Ties break on name so the
 * program is deterministic.
 */
export function selectDailyBest(
  candidates: AnniversaryCandidate[],
  window: WindowDay[],
  directAncestorIds: ReadonlySet<string> = new Set(),
): DigestEntry[] {
  const byDay = new Map(window.map((d) => [`${d.month}-${d.day}`, d.date]));

  const scoredByDay = new Map<number, DigestEntry[]>();
  for (const candidate of candidates) {
    const occursOn = byDay.get(`${candidate.month}-${candidate.day}`);
    if (!occursOn) continue;
    const yearsAgo = candidate.year !== null ? occursOn.getFullYear() - candidate.year : null;
    const entry: DigestEntry = {
      ...candidate,
      occursOn,
      yearsAgo,
      score: scoreCandidate(candidate, yearsAgo, directAncestorIds),
    };
    const key = occursOn.getTime();
    scoredByDay.set(key, [...(scoredByDay.get(key) ?? []), entry]);
  }

  const days: DigestEntry[] = [];
  const usedIndividuals = new Set<string>();
  for (const key of [...scoredByDay.keys()].sort((a, b) => a - b)) {
    const best = scoredByDay
      .get(key)!
      .filter((e) => !usedIndividuals.has(e.individualId))
      .sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName))[0];
    if (best) {
      days.push(best);
      usedIndividuals.add(best.individualId);
    }
  }
  return days;
}

interface AnniversaryRow {
  id: string;
  individual_id: string;
  event_type: DigestEventType;
  date_month: number;
  date_day: number;
  date_year: number | null;
  places: { raw: string } | null;
  individuals: {
    full_name: string;
    surname: string | null;
    sex: 'M' | 'F' | 'U';
    birth_year: number | null;
    death_year: number | null;
  };
}

/**
 * All birth/death anniversaries in the window, living persons excluded
 * server-side. The (month, day) pairs are pushed down as an OR of ANDs, so
 * even a 10,000-event tree returns only the week's handful of rows.
 */
export async function fetchWeekAnniversaries(
  client: WitnessSupabaseClient,
  treeId: string,
  window: WindowDay[],
): Promise<AnniversaryCandidate[]> {
  const dayFilter = window
    .map((d) => `and(date_month.eq.${d.month},date_day.eq.${d.day})`)
    .join(',');

  const { data, error } = await client
    .from('individual_events')
    .select(
      'id, individual_id, event_type, date_month, date_day, date_year, places(raw), individuals!inner(full_name, surname, sex, birth_year, death_year, living)',
    )
    .eq('tree_id', treeId)
    .in('event_type', ['birth', 'death'])
    .eq('individuals.living', false)
    .or(dayFilter)
    .limit(1000)
    .returns<AnniversaryRow[]>();
  if (error) throw new Error(`Digest query failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    eventId: row.id,
    individualId: row.individual_id,
    fullName: row.individuals.full_name,
    surname: row.individuals.surname,
    sex: row.individuals.sex,
    birthYear: row.individuals.birth_year,
    deathYear: row.individuals.death_year,
    eventType: row.event_type,
    month: row.date_month,
    day: row.date_day,
    year: row.date_year,
    placeRaw: row.places?.raw ?? null,
  }));
}

/**
 * Fetch + editorial selection for the week starting at weekStart: the
 * daily program first, then the featured 3 chosen from among the daily
 * rows (so a featured entry is always visible in the program).
 *
 * featuredIds is a hard gate, not a boost: when non-empty, only those
 * people can appear (the caller decides who qualifies — e.g. the home
 * person's direct line). Empty means no home person is set, and the
 * whole tree competes.
 */
export async function weeklyDigest(
  client: WitnessSupabaseClient,
  treeId: string,
  weekStart: Date,
  featuredIds: ReadonlySet<string> = new Set(),
): Promise<WeeklyDigest> {
  const window = digestWindow(weekStart);
  const candidates = await fetchWeekAnniversaries(client, treeId, window);
  return composeWeeklyDigest(candidates, window, featuredIds);
}

/** The pure selection half of weeklyDigest, split out for testing. */
export function composeWeeklyDigest(
  candidates: AnniversaryCandidate[],
  window: WindowDay[],
  featuredIds: ReadonlySet<string> = new Set(),
): WeeklyDigest {
  const pool = featuredIds.size
    ? candidates.filter((candidate) => featuredIds.has(candidate.individualId))
    : candidates;
  const days = selectDailyBest(pool, window, featuredIds);
  return {
    weekStart: window[0]!.date,
    weekEnd: window[6]!.date,
    days,
    entries: selectDigestEntries(days, window, featuredIds),
    candidateCount: pool.length,
  };
}
