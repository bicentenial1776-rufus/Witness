import { describe, expect, it } from 'vitest';
import {
  NEW_ENGLAND_STATES,
  bornAndDiedApart,
  emigrantsBetween,
  familyOrigins,
  migrationClusters,
  oceanCrossings,
  placeLabelAt,
  placesAcrossCenturies,
  regionShare,
  residentsOfRegionsDuring,
  singletonPlaces,
  surnameHeartland,
  surnamesDominatingPlaces,
  topPlaces,
  westwardExpansion,
} from '../placeDiscovery.js';
import { buildIndex } from './buildIndex.js';

const SALEM = ['Salem', 'Essex', 'Massachusetts', 'USA'];
const BOSTON = ['Boston', 'Suffolk', 'Massachusetts', 'USA'];
const PORTLAND = ['Portland', 'Cumberland', 'Maine', 'USA'];
const QUEBEC_CITY = ['Quebec City', 'Quebec', 'Canada'];
const LONDON = ['London', 'England'];
const DENVER = ['Denver', 'Colorado', 'USA'];

describe('familyOrigins', () => {
  it('finds the earliest dated event per region, oldest first', () => {
    const index = buildIndex(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [],
      [
        { person: 'a', year: 1620, placeParts: LONDON },
        { person: 'a', type: 'death', year: 1680, placeParts: SALEM },
        { person: 'b', year: 1650, placeParts: SALEM },
        { person: 'c', year: 1700, placeParts: QUEBEC_CITY },
      ],
    );
    const origins = familyOrigins(index);
    expect(origins.map((o) => o.region)).toEqual(['England', 'Massachusetts', 'Quebec']);
    expect(origins[0]!.earliestYear).toBe(1620);
    expect(origins[0]!.individual.id).toBe('a');
    expect(origins[1]!.earliestYear).toBe(1650);
    expect(origins[1]!.individualCount).toBe(2);
  });

  it('ignores undated and unplaced events', () => {
    const index = buildIndex(
      [{ id: 'a' }],
      [],
      [
        { person: 'a', year: null, placeParts: SALEM },
        { person: 'a', type: 'death', year: 1700 },
      ],
    );
    expect(familyOrigins(index)).toEqual([]);
  });
});

describe('emigrantsBetween', () => {
  it('finds people seen in the from-region before the to-region', () => {
    const index = buildIndex(
      [{ id: 'mover' }, { id: 'stayer' }],
      [],
      [
        { person: 'mover', year: 1830, placeParts: QUEBEC_CITY },
        { person: 'mover', type: 'death', year: 1890, placeParts: PORTLAND },
        { person: 'stayer', year: 1830, placeParts: QUEBEC_CITY },
      ],
    );
    const emigrants = emigrantsBetween(index, ['Quebec'], NEW_ENGLAND_STATES);
    expect(emigrants).toHaveLength(1);
    expect(emigrants[0]!.individual.id).toBe('mover');
    expect(emigrants[0]!.from.year).toBe(1830);
    expect(emigrants[0]!.to.year).toBe(1890);
  });

  it('does not count a round-tripper who started on the to side', () => {
    const index = buildIndex(
      [{ id: 'tourist' }],
      [],
      [
        { person: 'tourist', year: 1800, placeParts: PORTLAND },
        { person: 'tourist', type: 'residence', year: 1820, placeParts: QUEBEC_CITY },
        { person: 'tourist', type: 'death', year: 1850, placeParts: PORTLAND },
      ],
    );
    expect(emigrantsBetween(index, ['Quebec'], NEW_ENGLAND_STATES)).toEqual([]);
  });

  it('uses the last from-side event as the departure point', () => {
    const index = buildIndex(
      [{ id: 'a' }],
      [],
      [
        { person: 'a', year: 1700, placeParts: LONDON },
        { person: 'a', type: 'residence', year: 1720, placeParts: LONDON },
        { person: 'a', type: 'death', year: 1750, placeParts: SALEM },
      ],
    );
    const [emigrant] = emigrantsBetween(index, ['England'], ['Massachusetts']);
    expect(emigrant!.from.year).toBe(1720);
  });
});

describe('westwardExpansion', () => {
  it('finds seaboard-to-frontier moves inside the era', () => {
    const index = buildIndex(
      [{ id: 'pioneer' }, { id: 'early' }],
      [],
      [
        { person: 'pioneer', year: 1820, placeParts: BOSTON },
        { person: 'pioneer', type: 'death', year: 1880, placeParts: DENVER },
        { person: 'early', year: 1700, placeParts: BOSTON },
        { person: 'early', type: 'death', year: 1760, placeParts: DENVER },
      ],
    );
    const pioneers = westwardExpansion(index);
    expect(pioneers.map((p) => p.individual.id)).toEqual(['pioneer']);
  });
});

describe('oceanCrossings', () => {
  it('detects each change of shore, including a return voyage', () => {
    const index = buildIndex(
      [{ id: 'immigrant' }, { id: 'homebody' }],
      [],
      [
        { person: 'immigrant', year: 1630, placeParts: LONDON },
        { person: 'immigrant', type: 'residence', year: 1650, placeParts: SALEM },
        { person: 'immigrant', type: 'death', year: 1680, placeParts: LONDON },
        { person: 'homebody', year: 1650, placeParts: SALEM },
      ],
    );
    const crossings = oceanCrossings(index, 'atlantic');
    expect(crossings).toHaveLength(2);
    expect(crossings[0]!.direction).toBe('toAmericas');
    expect(crossings[0]!.from.country).toBe('England');
    expect(crossings[0]!.to.country).toBe('United States');
    expect(crossings[1]!.direction).toBe('fromAmericas');
  });

  it('keeps the Atlantic and Pacific separate', () => {
    const index = buildIndex(
      [{ id: 'a' }],
      [],
      [
        { person: 'a', year: 1850, placeParts: ['Canton', 'China'] },
        { person: 'a', type: 'death', year: 1900, placeParts: ['Sacramento', 'California', 'USA'] },
      ],
    );
    expect(oceanCrossings(index, 'atlantic')).toEqual([]);
    expect(oceanCrossings(index, 'pacific')).toHaveLength(1);
  });
});

describe('bornAndDiedApart', () => {
  const index = buildIndex(
    [
      { id: 'atlantic', birth: 1700, death: 1770 },
      { id: 'interstate', birth: 1800, death: 1870 },
      { id: 'settled', birth: 1750, death: 1820 },
      { id: 'vague', birth: 1760, death: 1830 },
    ],
    [],
    [
      { person: 'atlantic', year: 1700, placeParts: LONDON },
      { person: 'atlantic', type: 'death', year: 1770, placeParts: SALEM },
      { person: 'interstate', year: 1800, placeParts: SALEM },
      { person: 'interstate', type: 'death', year: 1870, placeParts: PORTLAND },
      { person: 'settled', year: 1750, placeParts: SALEM },
      { person: 'settled', type: 'death', year: 1820, placeParts: BOSTON },
      { person: 'vague', year: 1760, placeParts: PORTLAND },
      { person: 'vague', type: 'death', year: 1830, placeParts: ['USA'] },
    ],
  );

  it('compares countries at country level', () => {
    const apart = bornAndDiedApart(index, 'country');
    expect(apart.map((entry) => entry.individual.id)).toEqual(['atlantic']);
    expect(apart[0]!.bornIn).toBe('England');
    expect(apart[0]!.diedIn).toBe('United States');
  });

  it('requires state precision on both ends at state level', () => {
    const apart = bornAndDiedApart(index, 'state');
    // 'vague' died at a country-precision place; 'settled' never left MA.
    expect(apart.map((entry) => entry.individual.id)).toEqual(['interstate']);
  });
});

describe('placeLabelAt and topPlaces', () => {
  it('labels each level and never merges same-named towns across regions', () => {
    const index = buildIndex(
      [{ id: 'a' }, { id: 'b' }],
      [],
      [
        { person: 'a', year: 1700, placeParts: ['Cambridge', 'Middlesex', 'Massachusetts', 'USA'] },
        { person: 'b', year: 1700, placeParts: ['Cambridge', 'England'] },
      ],
    );
    const towns = topPlaces(index, 'town');
    expect(towns.map((t) => t.name).sort()).toEqual(['Cambridge, England', 'Cambridge, Massachusetts']);
  });

  it('reads counties only from an unambiguous town–county–state chain', () => {
    const place = (parts: string[]) => ({ id: 'p', raw: parts.join(', '), parts, region: null, country: null });
    expect(placeLabelAt(place(['Salem', 'Essex', 'Massachusetts', 'USA']), 'county')).toBe('Essex, Massachusetts');
    expect(placeLabelAt(place(['Essex', 'Massachusetts']), 'county')).toBeNull();
  });

  it('does not count a bare state or nation as a town', () => {
    const index = buildIndex(
      [{ id: 'a' }],
      [],
      [
        { person: 'a', year: 1700, placeParts: ['Massachusetts', 'USA'] },
        { person: 'a', type: 'residence', year: 1720, placeParts: ['England', 'United Kingdom'] },
      ],
    );
    expect(topPlaces(index, 'town')).toEqual([]);
    expect(topPlaces(index, 'state')[0]!.name).toBe('Massachusetts');
    expect(topPlaces(index, 'country').map((c) => c.name).sort()).toEqual(['United Kingdom', 'United States']);
  });

  it('counts distinct individuals, not events', () => {
    const index = buildIndex(
      [{ id: 'a' }, { id: 'b' }],
      [],
      [
        { person: 'a', year: 1700, placeParts: SALEM },
        { person: 'a', type: 'death', year: 1770, placeParts: SALEM },
        { person: 'b', year: 1710, placeParts: BOSTON },
      ],
    );
    const towns = topPlaces(index, 'town');
    expect(towns[0]).toMatchObject({ name: 'Boston, Massachusetts', individualCount: 1, eventCount: 1 });
    expect(towns[1]).toMatchObject({ name: 'Salem, Massachusetts', individualCount: 1, eventCount: 2 });
  });
});

describe('regionShare', () => {
  it('measures against ancestors with located events only', () => {
    const index = buildIndex(
      [{ id: 'ne' }, { id: 'south' }, { id: 'unplaced' }],
      [],
      [
        { person: 'ne', year: 1700, placeParts: SALEM },
        { person: 'south', year: 1700, placeParts: ['Richmond', 'Virginia', 'USA'] },
        { person: 'unplaced', year: 1700 },
      ],
    );
    const share = regionShare(index, NEW_ENGLAND_STATES);
    expect(share).toEqual({ individualCount: 1, locatedCount: 2, share: 0.5 });
  });

  it('matches whole countries too', () => {
    const index = buildIndex(
      [{ id: 'a' }],
      [],
      [{ person: 'a', year: 1800, placeParts: QUEBEC_CITY }],
    );
    expect(regionShare(index, ['Canada']).share).toBe(1);
  });
});

describe('singletonPlaces', () => {
  it('returns places with exactly one event, with who and when', () => {
    const index = buildIndex(
      [{ id: 'a' }, { id: 'b' }],
      [],
      [
        { person: 'a', year: 1700, placeParts: SALEM },
        { person: 'b', year: 1710, placeParts: SALEM },
        { person: 'a', type: 'death', year: 1770, placeParts: ['Machias', 'Maine', 'USA'] },
      ],
    );
    const singletons = singletonPlaces(index);
    expect(singletons).toHaveLength(1);
    expect(singletons[0]!.place.raw).toContain('Machias');
    expect(singletons[0]!.individual.id).toBe('a');
  });
});

describe('placesAcrossCenturies', () => {
  it('finds places with dated events in multiple centuries', () => {
    const index = buildIndex(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [],
      [
        { person: 'a', year: 1690, placeParts: SALEM },
        { person: 'b', year: 1750, placeParts: SALEM },
        { person: 'c', year: 1810, placeParts: SALEM },
        { person: 'a', type: 'death', year: 1699, placeParts: BOSTON },
      ],
    );
    const persistent = placesAcrossCenturies(index);
    expect(persistent).toHaveLength(1);
    expect(persistent[0]!.centuryCount).toBe(3);
    expect(persistent[0]!.centuries.map((c) => c.century)).toEqual([1600, 1700, 1800]);
  });
});

describe('residentsOfRegionsDuring', () => {
  const index = buildIndex(
    [{ id: 'early' }, { id: 'late' }, { id: 'undated' }],
    [],
    [
      { person: 'early', year: 1650, placeParts: SALEM },
      { person: 'late', year: 1750, placeParts: BOSTON },
      { person: 'undated', year: null, placeParts: SALEM },
    ],
  );

  it('applies the era window', () => {
    const before1700 = residentsOfRegionsDuring(index, ['Massachusetts'], { endYear: 1699 });
    expect(before1700.map((r) => r.individual.id)).toEqual(['early']);
  });

  it('returns everyone dated when no era is given, earliest first', () => {
    const all = residentsOfRegionsDuring(index, ['Massachusetts']);
    expect(all.map((r) => r.individual.id)).toEqual(['early', 'late']);
  });
});

describe('migrationClusters', () => {
  it('groups movers by path and arrival decade', () => {
    const index = buildIndex(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [],
      [
        { person: 'a', year: 1838, placeParts: QUEBEC_CITY },
        { person: 'a', type: 'death', year: 1845, placeParts: PORTLAND },
        { person: 'b', year: 1836, placeParts: QUEBEC_CITY },
        { person: 'b', type: 'death', year: 1848, placeParts: PORTLAND },
        { person: 'c', year: 1800, placeParts: QUEBEC_CITY },
        { person: 'c', type: 'death', year: 1812, placeParts: PORTLAND },
      ],
    );
    const clusters = migrationClusters(index);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ from: 'Quebec', to: 'Maine', decade: 1840 });
    expect(clusters[0]!.movers).toHaveLength(2);
  });
});

describe('surname geography', () => {
  const index = buildIndex(
    [
      { id: 'h1', name: 'Abel Howe', surname: 'Howe' },
      { id: 'h2', name: 'Ben Howe', surname: 'Howe' },
      { id: 'h3', name: 'Cyrus Howe', surname: 'Howe' },
      { id: 'h4', name: 'Dan Howe', surname: 'Howe' },
      { id: 'f1', name: 'Eli Field', surname: 'Field' },
      { id: 'n1', name: 'Mononymous', surname: null },
    ],
    [],
    [
      { person: 'h1', year: 1700, placeParts: SALEM },
      { person: 'h2', year: 1710, placeParts: SALEM },
      { person: 'h3', year: 1720, placeParts: SALEM },
      { person: 'h4', year: 1730, placeParts: SALEM },
      { person: 'f1', year: 1700, placeParts: SALEM },
      { person: 'n1', year: 1700, placeParts: SALEM },
      { person: 'h1', type: 'death', year: 1770, placeParts: BOSTON },
    ],
  );

  it('finds the dominant surname per town above the size floor', () => {
    const dominance = surnamesDominatingPlaces(index, 5);
    expect(dominance).toHaveLength(1);
    expect(dominance[0]).toMatchObject({
      name: 'Salem, Massachusetts',
      surname: 'Howe',
      surnameCount: 4,
      totalCount: 6,
    });
  });

  it('maps a surname line to its towns, case-insensitively', () => {
    const heartland = surnameHeartland(index, 'howe');
    expect(heartland[0]).toEqual({ name: 'Salem, Massachusetts', individualCount: 4 });
    expect(heartland[1]).toEqual({ name: 'Boston, Massachusetts', individualCount: 1 });
  });
});
