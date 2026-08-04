import { describe, expect, it } from 'vitest';
import {
  composeWeeklyDigest,
  digestWindow,
  scoreCandidate,
  selectDailyBest,
  selectDigestEntries,
  DIGEST_MAX_ENTRIES,
  type AnniversaryCandidate,
} from '../digest.js';

let nextId = 0;
function candidate(overrides: Partial<AnniversaryCandidate>): AnniversaryCandidate {
  nextId += 1;
  return {
    eventId: `event-${nextId}`,
    individualId: `person-${nextId}`,
    fullName: `Person ${nextId}`,
    surname: null,
    sex: 'U',
    birthYear: null,
    deathYear: null,
    eventType: 'birth',
    month: 7,
    day: 6,
    year: 1750,
    placeRaw: null,
    ...overrides,
  };
}

describe('digestWindow', () => {
  it('produces 7 consecutive days', () => {
    const window = digestWindow(new Date(2026, 6, 6)); // Jul 6 2026
    expect(window).toHaveLength(7);
    expect(window[0]).toMatchObject({ month: 7, day: 6 });
    expect(window[6]).toMatchObject({ month: 7, day: 12 });
  });

  it('spans month boundaries', () => {
    const window = digestWindow(new Date(2026, 6, 29)); // Jul 29
    expect(window[2]).toMatchObject({ month: 7, day: 31 });
    expect(window[3]).toMatchObject({ month: 8, day: 1 });
  });

  it('spans year boundaries with correct occurrence dates', () => {
    const window = digestWindow(new Date(2026, 11, 29)); // Dec 29
    expect(window[2]).toMatchObject({ month: 12, day: 31 });
    expect(window[3]).toMatchObject({ month: 1, day: 1 });
    expect(window[3]!.date.getFullYear()).toBe(2027);
  });

  it('only contains Feb 29 in leap years', () => {
    const leap = digestWindow(new Date(2028, 1, 26));
    expect(leap.some((d) => d.month === 2 && d.day === 29)).toBe(true);
    const nonLeap = digestWindow(new Date(2026, 1, 26));
    expect(nonLeap.some((d) => d.month === 2 && d.day === 29)).toBe(false);
  });
});

describe('scoreCandidate', () => {
  it('rewards direct ancestors, places, complete lifespans, and milestones', () => {
    const rich = candidate({
      individualId: 'ancestor-1',
      placeRaw: 'Sudbury, Massachusetts',
      birthYear: 1700,
      deathYear: 1776,
    });
    // 3 (ancestor) + 2 (place) + 1 (lifespan) + 3 (100-multiple milestone)
    expect(scoreCandidate(rich, 300, new Set(['ancestor-1']))).toBe(9);
  });

  it('scores a bare candidate at zero', () => {
    expect(scoreCandidate(candidate({ year: null }), null, new Set())).toBe(0);
  });

  it('grades milestone anniversaries', () => {
    const c = candidate({});
    expect(scoreCandidate(c, 100, new Set())).toBe(3);
    expect(scoreCandidate(c, 250, new Set())).toBe(2);
    expect(scoreCandidate(c, 75, new Set())).toBe(1);
    expect(scoreCandidate(c, 73, new Set())).toBe(0);
  });
});

describe('selectDigestEntries', () => {
  const window = digestWindow(new Date(2026, 6, 6)); // Jul 6–12 2026

  it('caps the digest at three entries sorted by occurrence date', () => {
    const candidates = [
      candidate({ month: 7, day: 10 }),
      candidate({ month: 7, day: 6 }),
      candidate({ month: 7, day: 8 }),
      candidate({ month: 7, day: 7 }),
      candidate({ month: 7, day: 9 }),
    ];
    const entries = selectDigestEntries(candidates, window);
    expect(entries).toHaveLength(DIGEST_MAX_ENTRIES);
    const times = entries.map((e) => e.occursOn.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('computes yearsAgo from the occurrence year, including across new year', () => {
    const dec = digestWindow(new Date(2026, 11, 29));
    const entries = selectDigestEntries(
      [
        candidate({ month: 12, day: 30, year: 1726 }),
        candidate({ month: 1, day: 2, year: 1727 }),
      ],
      dec,
    );
    expect(entries[0]!.yearsAgo).toBe(300); // 2026 − 1726
    expect(entries[1]!.yearsAgo).toBe(300); // 2027 − 1727
  });

  it('ignores candidates whose month/day fall outside the window', () => {
    const entries = selectDigestEntries([candidate({ month: 8, day: 1 })], window);
    expect(entries).toHaveLength(0);
  });

  it('never selects the same individual twice', () => {
    const entries = selectDigestEntries(
      [
        candidate({ individualId: 'same', eventType: 'birth', month: 7, day: 6 }),
        candidate({ individualId: 'same', eventType: 'death', month: 7, day: 9 }),
        candidate({ individualId: 'other', month: 7, day: 10 }),
      ],
      window,
    );
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((e) => e.individualId)).size).toBe(2);
  });

  it('prefers variety over raw score: a bare different-surname candidate beats a richer third entry from the same branch', () => {
    const entries = selectDigestEntries(
      [
        candidate({ fullName: 'Anna Scott', surname: 'Scott', placeRaw: 'Providence', birthYear: 1700, deathYear: 1770, year: null }), // 3
        candidate({ fullName: 'Ben Scott', surname: 'Scott', placeRaw: 'Providence', month: 7, day: 7, year: null }), // 2
        candidate({ fullName: 'Dan Scott', surname: 'Scott', placeRaw: 'Providence', month: 7, day: 9, year: null }), // 2
        candidate({ fullName: 'Cora Marbury', surname: 'Marbury', eventType: 'death', month: 7, day: 8, year: null }), // 0
      ],
      window,
    );
    // Anna (3) first. Cora, though bare, adjusts to 0 while each remaining
    // Scott adjusts to 2−2(surname)−1(type) = −1, so Cora is in and one
    // Scott stays out.
    const names = entries.map((e) => e.fullName);
    expect(names).toContain('Cora Marbury');
    expect(names).toContain('Anna Scott');
    expect(names.filter((n) => n.endsWith('Scott'))).toHaveLength(2);
  });

  it('mixes event types when scores are equal', () => {
    const entries = selectDigestEntries(
      [
        candidate({ fullName: 'A Birth', eventType: 'birth', month: 7, day: 6 }),
        candidate({ fullName: 'B Birth', eventType: 'birth', month: 7, day: 7 }),
        candidate({ fullName: 'C Death', eventType: 'death', month: 7, day: 8 }),
      ],
      window,
    );
    expect(entries.map((e) => e.eventType).sort()).toEqual(['birth', 'birth', 'death']);
    // The death entry must have been picked second (types alternate under the penalty).
  });

  it('boosts direct ancestors into the digest', () => {
    const entries = selectDigestEntries(
      [
        candidate({ fullName: 'Rich Collateral', placeRaw: 'Boston', birthYear: 1700, deathYear: 1750, month: 7, day: 6 }),
        candidate({ individualId: 'da-1', fullName: 'Plain Ancestor', month: 7, day: 7 }),
        candidate({ fullName: 'Another Collateral', month: 7, day: 8 }),
        candidate({ fullName: 'Third Collateral', placeRaw: 'Salem', month: 7, day: 9 }),
      ],
      window,
      new Set(['da-1']),
    );
    expect(entries.map((e) => e.fullName)).toContain('Plain Ancestor');
  });

  it('returns fewer entries when the week is thin', () => {
    expect(selectDigestEntries([candidate({})], window)).toHaveLength(1);
    expect(selectDigestEntries([], window)).toHaveLength(0);
  });
});

describe('selectDailyBest', () => {
  const window = digestWindow(new Date(2026, 6, 6)); // Jul 6–12 2026

  it('picks the highest-scoring candidate per day, in date order', () => {
    const days = selectDailyBest(
      [
        candidate({ fullName: 'Plain Monday', month: 7, day: 6 }),
        candidate({ fullName: 'Rich Monday', month: 7, day: 6, placeRaw: 'Salem' }),
        candidate({ fullName: 'Only Wednesday', month: 7, day: 8 }),
      ],
      window,
    );
    expect(days.map((d) => d.fullName)).toEqual(['Rich Monday', 'Only Wednesday']);
  });

  it('skips days with no anniversaries instead of padding to 7', () => {
    expect(selectDailyBest([candidate({ month: 7, day: 9 })], window)).toHaveLength(1);
  });

  it('never repeats a person across the week', () => {
    const days = selectDailyBest(
      [
        candidate({ individualId: 'same', fullName: 'Both Days', eventType: 'birth', month: 7, day: 6, placeRaw: 'Salem' }),
        candidate({ individualId: 'same', fullName: 'Both Days', eventType: 'death', month: 7, day: 10, placeRaw: 'Salem' }),
        candidate({ individualId: 'other', fullName: 'Backup Friday', month: 7, day: 10 }),
      ],
      window,
    );
    expect(days.map((d) => d.fullName)).toEqual(['Both Days', 'Backup Friday']);
  });

  it('caps at one row per day even on crowded days', () => {
    const crowded = Array.from({ length: 5 }, (_, i) =>
      candidate({ fullName: `Person ${i}`, month: 7, day: 7 }),
    );
    expect(selectDailyBest(crowded, window)).toHaveLength(1);
  });
});

describe('composeWeeklyDigest', () => {
  const window = digestWindow(new Date(2026, 6, 6)); // Jul 6–12 2026

  it('hard-filters to featuredIds — a collateral outside the set never appears', () => {
    const ancestor = candidate({ individualId: 'ancestor', fullName: 'Direct Ancestor', month: 7, day: 6 });
    const cousin = candidate({
      individualId: 'cousin',
      fullName: 'Distant Cousin',
      month: 7,
      day: 7,
      placeRaw: 'Cumberland', // outscores the ancestor — the gate must still win
      birthYear: 1804,
      deathYear: 1874,
    });
    const digest = composeWeeklyDigest([ancestor, cousin], window, new Set(['ancestor']));
    expect(digest.days.map((d) => d.individualId)).toEqual(['ancestor']);
    expect(digest.entries.map((e) => e.individualId)).toEqual(['ancestor']);
    expect(digest.candidateCount).toBe(1);
  });

  it('with an empty set (no home person) the whole tree competes', () => {
    const digest = composeWeeklyDigest(
      [candidate({ month: 7, day: 6 }), candidate({ month: 7, day: 7 })],
      window,
    );
    expect(digest.days).toHaveLength(2);
    expect(digest.candidateCount).toBe(2);
  });

  it('a featured set with no anniversaries this week yields an empty digest, not strangers', () => {
    const digest = composeWeeklyDigest(
      [candidate({ individualId: 'stranger', month: 7, day: 6 })],
      window,
      new Set(['ancestor-with-no-anniversary']),
    );
    expect(digest.days).toHaveLength(0);
    expect(digest.entries).toHaveLength(0);
  });
});
