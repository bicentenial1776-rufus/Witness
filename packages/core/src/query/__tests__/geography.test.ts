import { describe, expect, it } from 'vitest';
import { geocodeQueries } from '../../geocode/nominatim.js';
import {
  ancestorsInRegion,
  haversineKm,
  livedNear,
  nearbyAncestors,
  regionRollups,
  type GeographyIndex,
  type GeoIndividual,
  type GeoPlace,
} from '../geography.js';
import { migrationPaths } from '../migrations.js';
import { classifyPlace, regionOf } from '../regions.js';

describe('classifyPlace', () => {
  it('canonicalizes country synonyms', () => {
    expect(classifyPlace(['Sudbury', 'Massachusetts', 'USA'])).toEqual({
      country: 'United States',
      state: 'Massachusetts',
    });
    expect(classifyPlace(['Wrentham', 'Norfolk', 'Massachusetts', 'United States'])).toEqual({
      country: 'United States',
      state: 'Massachusetts',
    });
    expect(classifyPlace(['Boston', 'Mass.', 'United States of America'])).toEqual({
      country: 'United States',
      state: 'Massachusetts',
    });
  });

  it('recognizes bare states and abbreviations as US', () => {
    expect(classifyPlace(['Los Altos', 'CA'])).toEqual({ country: 'United States', state: 'California' });
    expect(classifyPlace(['Portland', 'Me.'])).toEqual({ country: 'United States', state: 'Maine' });
    expect(classifyPlace(['Spruce Pine', 'North Carolina'])).toEqual({
      country: 'United States',
      state: 'North Carolina',
    });
  });

  it('recognizes Canadian provinces and Acadia', () => {
    expect(classifyPlace(['Halifax', 'Nova Scotia', 'Canada'])).toEqual({ country: 'Canada', state: 'Nova Scotia' });
    expect(classifyPlace(['Grand-Pré', 'Acadia'])).toEqual({ country: 'Canada', state: 'Acadia' });
  });

  it('passes through unrecognized trailing parts as countries', () => {
    expect(classifyPlace(['Bocking', 'Essex', 'England'])).toEqual({ country: 'England', state: null });
    expect(classifyPlace(['Boston', 'British America'])).toEqual({ country: 'British America', state: null });
  });

  it('treats single-part places as unplaceable', () => {
    expect(classifyPlace(['Boise'])).toEqual({ country: null, state: null });
    expect(regionOf(['Boise'])).toBeNull();
  });

  it('prefers state over country for the rollup region', () => {
    expect(regionOf(['Sudbury', 'Middlesex', 'Massachusetts', 'USA'])).toBe('Massachusetts');
    expect(regionOf(['Paris', 'France'])).toBe('France');
  });
});

// Shared fixture: two Massachusetts places, one Maine, one England.
function fixtureIndex(): GeographyIndex {
  const places = new Map<string, GeoPlace>(
    (
      [
        { id: 'p1', raw: 'Sudbury, Middlesex, Massachusetts, USA', parts: ['Sudbury', 'Middlesex', 'Massachusetts', 'USA'], latitude: 42.38, longitude: -71.42 },
        { id: 'p2', raw: 'Boston, MA', parts: ['Boston', 'MA'], latitude: 42.36, longitude: -71.06 },
        { id: 'p3', raw: 'Turner, Maine', parts: ['Turner', 'Maine'], latitude: 44.26, longitude: -70.26 },
        { id: 'p4', raw: 'Bocking, Essex, England', parts: ['Bocking', 'Essex', 'England'], latitude: null, longitude: null },
      ] as Omit<GeoPlace, 'region' | 'country'>[]
    ).map((p) => [p.id, { ...p, region: regionOf(p.parts), country: classifyPlace(p.parts).country }]),
  );
  const graveLinks = new Map<string, string>();
  const individuals = new Map<string, GeoIndividual>([
    ['i1', { id: 'i1', full_name: 'John Howe', surname: 'Howe', birth_year: 1620, death_year: 1700, living: false }],
    ['i2', { id: 'i2', full_name: 'Mary Field', surname: 'Field', birth_year: 1750, death_year: 1820, living: false }],
    ['i3', { id: 'i3', full_name: 'Undated Smith', surname: 'Smith', birth_year: null, death_year: null, living: false }],
  ]);
  return {
    places,
    individuals,
    graveLinks,
    events: [
      // John: born England, resides Sudbury, dies Boston (two MA stops = one migration England→Massachusetts only).
      { individualId: 'i1', eventType: 'birth', year: 1620, placeId: 'p4' },
      { individualId: 'i1', eventType: 'residence', year: 1645, placeId: 'p1' },
      { individualId: 'i1', eventType: 'death', year: 1700, placeId: 'p2' },
      // Mary: born Boston, dies Maine.
      { individualId: 'i2', eventType: 'birth', year: 1750, placeId: 'p2' },
      { individualId: 'i2', eventType: 'death', year: 1820, placeId: 'p3' },
      // Undated events never produce migrations.
      { individualId: 'i3', eventType: 'residence', year: null, placeId: 'p1' },
    ],
  };
}

describe('regionRollups', () => {
  it('counts distinct individuals and places per region', () => {
    const rollups = regionRollups(fixtureIndex());
    expect(rollups[0]!).toEqual({ region: 'Massachusetts', individualCount: 3, placeCount: 2 });
    expect(rollups).toContainEqual({ region: 'Maine', individualCount: 1, placeCount: 1 });
    expect(rollups).toContainEqual({ region: 'England', individualCount: 1, placeCount: 1 });
  });
});

describe('ancestorsInRegion', () => {
  it('returns residents earliest-first with their events', () => {
    const residents = ancestorsInRegion(fixtureIndex(), 'Massachusetts');
    expect(residents.map((r) => r.individual.full_name)).toEqual(['John Howe', 'Mary Field', 'Undated Smith']);
    expect(residents[0]!.events).toHaveLength(2);
  });
});

describe('migrationPaths', () => {
  it('detects transitions between regions within a life', () => {
    const paths = migrationPaths(fixtureIndex());
    expect(paths).toContainEqual(
      expect.objectContaining({ from: 'England', to: 'Massachusetts', count: 1, medianYear: 1645 }),
    );
    expect(paths).toContainEqual(
      expect.objectContaining({ from: 'Massachusetts', to: 'Maine', count: 1, medianYear: 1820 }),
    );
    // Boston → Sudbury is intra-region: no Massachusetts→Massachusetts path.
    expect(paths.find((p) => p.from === p.to)).toBeUndefined();
  });

  it('treats a vague "United States" record as staying put, not a move', () => {
    const index = fixtureIndex();
    index.places.set('p6', {
      id: 'p6',
      raw: 'United States',
      parts: ['Somewhere', 'United States'],
      latitude: null,
      longitude: null,
      region: 'United States',
      country: 'United States',
    });
    // Mary: Massachusetts 1750 → vague US 1790 → Maine 1820. One real move.
    index.events.push({ individualId: 'i2', eventType: 'residence', year: 1790, placeId: 'p6' });
    const paths = migrationPaths(index);
    expect(paths.find((p) => p.to === 'United States' || p.from === 'United States')).toBeUndefined();
    expect(paths).toContainEqual(
      expect.objectContaining({ from: 'Massachusetts', to: 'Maine', count: 1 }),
    );
  });

  it('lists every mover with their id so the app can link to them', () => {
    const paths = migrationPaths(fixtureIndex());
    const move = paths.find((p) => p.from === 'England' && p.to === 'Massachusetts')!;
    expect(move.movers).toEqual([
      { individualId: 'i1', name: 'John Howe', fromYear: 1620, toYear: 1645 },
    ]);
  });

  it('keeps multi-word region names intact', () => {
    const index = fixtureIndex();
    index.places.set('p5', {
      id: 'p5',
      raw: 'Keene, New Hampshire',
      parts: ['Keene', 'New Hampshire'],
      latitude: null,
      longitude: null,
      region: 'New Hampshire',
      country: 'United States',
    });
    index.events.push({ individualId: 'i2', eventType: 'burial', year: 1821, placeId: 'p5' });
    const paths = migrationPaths(index);
    expect(paths).toContainEqual(expect.objectContaining({ from: 'Maine', to: 'New Hampshire' }));
  });
});

describe('haversineKm / nearbyAncestors', () => {
  it('computes plausible distances', () => {
    // Boston to Providence is ~66km as the crow flies.
    const distance = haversineKm(42.36, -71.06, 41.82, -71.41);
    expect(distance).toBeGreaterThan(55);
    expect(distance).toBeLessThan(75);
  });

  it('finds geocoded places within a radius, nearest first, with residents', () => {
    const near = nearbyAncestors(fixtureIndex(), { latitude: 42.36, longitude: -71.06, radiusKm: 50 });
    expect(near.map((n) => n.place.id)).toEqual(['p2', 'p1']);
    expect(near[0]!.residents.map((r) => r.individual.full_name)).toEqual(['John Howe', 'Mary Field']);
  });

  it('ignores ungeocoded places', () => {
    const near = nearbyAncestors(fixtureIndex(), { latitude: 51.9, longitude: 0.55, radiusKm: 100 });
    expect(near).toHaveLength(0);
  });
});

describe('livedNear', () => {
  // Own fixture: the shared one has no overlapping lifespans, and its
  // rollup counts must not shift under a new resident.
  function neighborIndex(): GeographyIndex {
    const mk = (p: Omit<GeoPlace, 'region' | 'country'>): [string, GeoPlace] => [
      p.id,
      { ...p, region: regionOf(p.parts), country: classifyPlace(p.parts).country },
    ];
    return {
      places: new Map([
        mk({ id: 'p1', raw: 'Sudbury, Massachusetts, USA', parts: ['Sudbury', 'Massachusetts', 'USA'], latitude: 42.38, longitude: -71.42 }),
        mk({ id: 'p2', raw: 'Boston, MA', parts: ['Boston', 'MA'], latitude: 42.36, longitude: -71.06 }),
        mk({ id: 'p3', raw: 'Bocking, Essex, England', parts: ['Bocking', 'Essex', 'England'], latitude: null, longitude: null }),
      ]),
      individuals: new Map<string, GeoIndividual>([
        ['subject', { id: 'subject', full_name: 'John Howe', surname: 'Howe', birth_year: 1620, death_year: 1700, living: false }],
        ['near-contemporary', { id: 'near-contemporary', full_name: 'Abigail Rice', surname: 'Rice', birth_year: 1640, death_year: 1710, living: false }],
        ['near-later', { id: 'near-later', full_name: 'Mary Field', surname: 'Field', birth_year: 1750, death_year: 1820, living: false }],
        ['near-undated', { id: 'near-undated', full_name: 'Undated Smith', surname: 'Smith', birth_year: null, death_year: null, living: false }],
        ['near-sibling', { id: 'near-sibling', full_name: 'Zeruiah Howe', surname: 'Howe', birth_year: 1622, death_year: 1690, living: false }],
      ]),
      graveLinks: new Map(),
      events: [
        // Subject: born England (ungeocoded), resides Sudbury — the anchor.
        { individualId: 'subject', eventType: 'birth', year: 1620, placeId: 'p3' },
        { individualId: 'subject', eventType: 'residence', year: 1645, placeId: 'p1' },
        { individualId: 'near-contemporary', eventType: 'residence', year: 1650, placeId: 'p2' },
        { individualId: 'near-later', eventType: 'birth', year: 1750, placeId: 'p2' },
        { individualId: 'near-undated', eventType: 'residence', year: null, placeId: 'p1' },
        { individualId: 'near-sibling', eventType: 'residence', year: 1648, placeId: 'p1' },
      ],
    };
  }

  it('finds overlapping-lifespan neighbors near the anchor, nearest first', () => {
    const neighbors = livedNear(neighborIndex(), 'subject');
    expect(neighbors.map((n) => n.individual.id)).toEqual(['near-sibling', 'near-contemporary']);
    // Sudbury→Boston is ~18 miles; same place is 0.
    expect(neighbors[0]!.distanceMiles).toBe(0);
    expect(neighbors[1]!.distanceMiles).toBeGreaterThan(10);
    expect(neighbors[1]!.distanceMiles).toBeLessThan(25);
  });

  it('excludes non-contemporaries, undated lives, and the excludeIds set', () => {
    const neighbors = livedNear(neighborIndex(), 'subject', {
      excludeIds: new Set(['near-sibling']),
    });
    expect(neighbors.map((n) => n.individual.id)).toEqual(['near-contemporary']);
  });

  it('returns nothing when the subject has no geocoded anchor', () => {
    const index = neighborIndex();
    index.events = index.events.filter((e) => e.individualId !== 'subject' || e.placeId === 'p3');
    expect(livedNear(index, 'subject')).toEqual([]);
  });
});

describe('geocodeQueries', () => {
  it('falls back from the raw string to coarser trailing parts', () => {
    expect(geocodeQueries({ raw: 'Sudbury, Middlesex, Massachusetts, USA', parts: ['Sudbury', 'Middlesex', 'Massachusetts', 'USA'] })).toEqual([
      'Sudbury, Middlesex, Massachusetts, USA',
      'Middlesex, Massachusetts, USA',
      'Massachusetts, USA',
    ]);
  });

  it('does not fall back below two parts', () => {
    expect(geocodeQueries({ raw: 'Boise', parts: ['Boise'] })).toEqual(['Boise']);
  });
});
