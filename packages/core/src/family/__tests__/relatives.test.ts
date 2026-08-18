import { describe, expect, it } from 'vitest';
import { bucketMiles, haversineMiles, pickProximity, relativesBrief } from '../relatives.js';
import type { RelativeFact, ResidencePoint } from '../relatives.js';

const at = (year: number | null, lat: number, lng: number, placeId = `${lat},${lng}`): ResidencePoint => ({
  year,
  latitude: lat,
  longitude: lng,
  placeId,
});

describe('proximity buckets', () => {
  it('bands distances per the spec enum', () => {
    expect(bucketMiles(0)).toBe('same_town');
    expect(bucketMiles(4.9)).toBe('same_town');
    expect(bucketMiles(12)).toBe('same_county');
    expect(bucketMiles(80)).toBe('within_100mi');
    expect(bucketMiles(101)).toBe('elsewhere');
  });

  it('haversine: Boston to Worcester is ~40 miles', () => {
    const miles = haversineMiles(42.36, -71.06, 42.26, -71.8);
    expect(miles).toBeGreaterThan(35);
    expect(miles).toBeLessThan(45);
  });
});

describe('pickProximity', () => {
  it('same interned place is same_town regardless of coordinates', () => {
    expect(
      pickProximity([at(1850, 0, 0, 'p1')], [at(1852, 50, 50, 'p1')]),
    ).toBe('same_town');
  });

  it('prefers the pair closest in time', () => {
    // 1850 pairs with 1852 (nearby); the 1880 far-away residence is later.
    const subject = [at(1850, 42.36, -71.06)];
    const relative = [at(1852, 42.37, -71.07), at(1880, 34.05, -118.24)];
    expect(pickProximity(subject, relative)).toBe('same_town');
  });

  it('never bridges more than 15 years', () => {
    expect(
      pickProximity([at(1850, 42.36, -71.06)], [at(1880, 42.37, -71.07)]),
    ).toBe('unknown');
  });

  it('an undated residence qualifies only as a sole address', () => {
    // Sole undated residence: usable.
    expect(
      pickProximity([at(1850, 42.36, -71.06)], [at(null, 42.37, -71.07)]),
    ).toBe('same_town');
    // Undated among dated ones: ignored, dated pair decides.
    expect(
      pickProximity(
        [at(1850, 42.36, -71.06)],
        [at(null, 42.37, -71.07), at(1851, 34.05, -118.24)],
      ),
    ).toBe('elsewhere');
  });

  it('no usable pair means unknown, never a guess', () => {
    expect(pickProximity([], [at(1850, 0, 0)])).toBe('unknown');
  });
});

describe('relativesBrief', () => {
  const fact = (over: Partial<RelativeFact>): RelativeFact => ({
    person_id: 'x',
    name: 'Test Person',
    relationship: 'sibling',
    living: false,
    has_story: false,
    proximity_bucket: 'unknown',
    ...over,
  });

  it('excludes the living and strips internal fields', () => {
    const brief = relativesBrief([
      fact({ name: 'Dead Sibling', birth_year: 1850 }),
      fact({ name: 'Living Sibling', living: true }),
    ]);
    expect(brief).toHaveLength(1);
    expect(brief[0]).toEqual({
      name: 'Dead Sibling',
      relationship: 'sibling',
      birth_year: 1850,
      death_year: null,
      proximity_bucket: 'unknown',
    });
  });

  it('caps the brief at 24 relatives', () => {
    const many = Array.from({ length: 40 }, (_, i) => fact({ name: `R${i}` }));
    expect(relativesBrief(many)).toHaveLength(24);
  });
});
