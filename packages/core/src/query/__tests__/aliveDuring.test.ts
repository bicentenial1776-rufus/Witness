import { describe, expect, it } from 'vitest';
import { HISTORICAL_EVENTS, getHistoricalEvent } from '../../history/events.js';
import { classifyAliveDuring, MAX_LIFESPAN_YEARS, type AliveCandidate } from '../aliveDuring.js';

const RANGE = { startYear: 1675, endYear: 1678 }; // King Philip's War

function person(overrides: Partial<AliveCandidate>): AliveCandidate {
  return {
    id: 'x',
    full_name: 'Test Person',
    sex: 'U',
    birth_year: null,
    death_year: null,
    living: false,
    ...overrides,
  };
}

describe('classifyAliveDuring', () => {
  it('matches a fully documented life spanning the range', () => {
    const match = classifyAliveDuring(person({ birth_year: 1640, death_year: 1700 }), RANGE);
    expect(match).toMatchObject({ confidence: 'documented', ageAtStart: 35, bornDuring: false, diedDuring: false });
  });

  it('rejects a person who died before the range began', () => {
    expect(classifyAliveDuring(person({ birth_year: 1600, death_year: 1674 }), RANGE)).toBeNull();
  });

  it('rejects a person born after the range ended', () => {
    expect(classifyAliveDuring(person({ birth_year: 1679, death_year: 1750 }), RANGE)).toBeNull();
  });

  it('includes boundary years inclusively on both ends', () => {
    expect(classifyAliveDuring(person({ birth_year: 1678, death_year: 1740 }), RANGE)).toMatchObject({
      confidence: 'documented',
      bornDuring: true,
      ageAtStart: null,
    });
    expect(classifyAliveDuring(person({ birth_year: 1620, death_year: 1675 }), RANGE)).toMatchObject({
      confidence: 'documented',
      diedDuring: true,
    });
  });

  it('marks death-unknown non-living matches as probable within the assumed lifespan', () => {
    const match = classifyAliveDuring(person({ birth_year: 1660 }), RANGE);
    expect(match).toMatchObject({ confidence: 'probable', ageAtStart: 15 });
  });

  it('rejects death-unknown matches beyond the assumed lifespan', () => {
    expect(classifyAliveDuring(person({ birth_year: RANGE.startYear - MAX_LIFESPAN_YEARS - 1 }), RANGE)).toBeNull();
  });

  it('treats living persons with no death year as documented', () => {
    const range = { startYear: 2001, endYear: 2001 };
    const match = classifyAliveDuring(person({ birth_year: 1954, living: true }), range);
    expect(match).toMatchObject({ confidence: 'documented', ageAtStart: 47 });
  });

  it('places birth-unknown persons by death year as probable', () => {
    const match = classifyAliveDuring(person({ death_year: 1690 }), RANGE);
    expect(match).toMatchObject({ confidence: 'probable', ageAtStart: null, diedDuring: false });
  });

  it('rejects birth-unknown persons whose death is too far past the range', () => {
    expect(classifyAliveDuring(person({ death_year: RANGE.endYear + MAX_LIFESPAN_YEARS + 1 }), RANGE)).toBeNull();
  });

  it('rejects persons with no dates at all', () => {
    expect(classifyAliveDuring(person({}), RANGE)).toBeNull();
  });
});

describe('HISTORICAL_EVENTS', () => {
  it('has unique ids', () => {
    const ids = HISTORICAL_EVENTS.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has valid year ranges in chronological order', () => {
    for (const event of HISTORICAL_EVENTS) {
      expect(event.startYear).toBeLessThanOrEqual(event.endYear);
    }
    const starts = HISTORICAL_EVENTS.map((event) => event.startYear);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('ships at least the 20 events promised in the brief', () => {
    expect(HISTORICAL_EVENTS.length).toBeGreaterThanOrEqual(20);
  });

  it('looks events up by id', () => {
    expect(getHistoricalEvent('king-philips-war')?.startYear).toBe(1675);
    expect(getHistoricalEvent('nope')).toBeUndefined();
  });
});
