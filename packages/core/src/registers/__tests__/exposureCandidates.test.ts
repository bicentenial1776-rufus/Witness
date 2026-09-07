import { describe, expect, it } from 'vitest';
import { exposureCandidates } from '../exposureCandidates.js';
import type { RegisterConfig, RegisterPersonFacts } from '../types.js';

const config: RegisterConfig = {
  exposure: {
    sex: 'M',
    birthYearRange: { from: 1815, to: 1848, weight: 2, reason: 'born 1815–1848' },
    dateWindows: [{ from: 1850, to: 1870, weight: 1, reason: 'recorded around the war years' }],
    placeSignals: [{ pattern: 'united states', weight: 1, reason: 'a United States place' }],
    coincidenceBonus: 1,
    threshold: 4,
  },
  deepLinkTemplate: 'https://example.org/search?given={given}&surname={surname}',
};
const person = (id: string, fullName: string, sex: 'M' | 'F', birthYear: number, year: number | null): RegisterPersonFacts => ({
  id,
  fullName,
  sex,
  birthYear,
  deathYear: null,
  events: year ? [{ type: 'residence', year, placeParts: ['Worcester', 'Massachusetts', 'United States'] }] : [],
});

describe('exposureCandidates', () => {
  it('turns exposure into a candidate with reasons and a prefilled search', () => {
    const out = exposureCandidates(config, [
      person('a', 'Ezekiel Howe', 'M', 1840, 1860),
      person('b', 'Abigail Howe', 'F', 1840, 1860),
      person('c', 'Old Howe', 'M', 1790, 1860),
      person('d', 'Young Howe', 'M', 1840, null),
    ]);
    expect(out.map((c) => c.person.id)).toEqual(['a']);
    expect(out[0]).toMatchObject({ score: 5, deepLink: 'https://example.org/search?given=Ezekiel&surname=Howe' });
    expect(out[0]!.reasons).toContain('born 1815–1848');
  });

  it('is empty for a register without exposure config', () => {
    expect(exposureCandidates({}, [person('a', 'Ezekiel Howe', 'M', 1840, 1860)])).toEqual([]);
  });
});
