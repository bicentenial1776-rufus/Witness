import { describe, expect, it } from 'vitest';
import { looseName, matchPeople, normalizeName, type PersonKey } from '../personMatch.js';

const p = (id: string, fullName: string, birthYear: number | null, deathYear: number | null, sex?: string): PersonKey => ({
  id,
  fullName,
  birthYear,
  deathYear,
  sex,
});

describe('name folding', () => {
  it('normalizes case, spacing, and punctuation but keeps nicknames', () => {
    expect(normalizeName('Charlotte  "Lottie" Anna Weld.')).toBe('charlotte "lottie" anna weld');
  });
  it('loosens nicknames, asterisks, and initials away', () => {
    expect(looseName('Charlotte "Lottie" Anna Weld')).toBe('charlotte anna weld');
    expect(looseName('Robert Dennis Bent of Penton Grafton*')).toBe('robert dennis bent of penton grafton');
    expect(looseName('Ruth E Field')).toBe('ruth field');
  });
});

describe('matchPeople', () => {
  it('matches on name + both years first', () => {
    const report = matchPeople([p('s1', 'Ruth Field', 1896, 1970, 'F')], [p('t1', 'Ruth Field', 1896, 1970, 'F')]);
    expect(report.matches).toEqual([{ sourceId: 's1', targetId: 't1', tier: 'exact' }]);
  });

  it('refuses ambiguous keys on either side rather than guessing', () => {
    const report = matchPeople(
      [p('s1', 'John Smith', 1820, null), p('s2', 'John Smith', 1820, null)],
      [p('t1', 'John Smith', 1820, null)],
    );
    expect(report.matches).toHaveLength(0);
    expect(report.unmatchedSource).toEqual(['s1', 's2']);
  });

  it('falls through tiers: nickname differences, then birth only, then name only', () => {
    const report = matchPeople(
      [
        p('s1', 'Charlotte "Lottie" Anna Weld', 1880, 1969, 'F'),
        p('s2', 'Ruth E Field', 1896, null, 'F'),
        p('s3', 'Jean Boutin', null, null, 'M'),
      ],
      [
        p('t1', 'Charlotte Anna Weld', 1880, 1969, 'F'),
        p('t2', 'Ruth E. Field', 1896, 1970, 'F'),
        p('t3', 'Jean Boutin', 1662, 1711, 'M'),
      ],
    );
    expect(report.matches).toEqual([
      { sourceId: 's1', targetId: 't1', tier: 'loose' },
      { sourceId: 's2', targetId: 't2', tier: 'birth' },
      { sourceId: 's3', targetId: 't3', tier: 'name-only' },
    ]);
    expect(report.byTier).toMatchObject({ loose: 1, birth: 1, 'name-only': 1 });
  });

  it('never pairs conflicting years or sexes even when the name is unique', () => {
    const report = matchPeople([p('s1', 'Mary Field', 1700, null, 'F')], [p('t1', 'Mary Field', 1750, null, 'F')]);
    expect(report.matches).toHaveLength(0);
    const sexReport = matchPeople([p('s1', 'Lee Howe', null, null, 'M')], [p('t1', 'Lee Howe', null, null, 'F')]);
    expect(sexReport.matches).toHaveLength(0);
  });

  it('does not reuse a target once taken', () => {
    const report = matchPeople(
      [p('s1', 'Ann Lee', 1800, 1860), p('s2', 'Ann Lee', 1800, null)],
      [p('t1', 'Ann Lee', 1800, 1860)],
    );
    expect(report.matches).toEqual([{ sourceId: 's1', targetId: 't1', tier: 'exact' }]);
    expect(report.unmatchedSource).toEqual(['s2']);
  });
});
