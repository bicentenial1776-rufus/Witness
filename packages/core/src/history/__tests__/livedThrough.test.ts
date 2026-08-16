import { describe, expect, it } from 'vitest';
import type { AliveCandidate } from '../../query/aliveDuring.js';
import { HISTORICAL_EVENTS, type HistoricalEvent } from '../events.js';
import { LIVED_THROUGH_TAG_CAP, rankLivedThroughEvents, regionsFromPlaceParts } from '../livedThrough.js';

function person(overrides: Partial<AliveCandidate>): AliveCandidate {
  return {
    id: 'p1',
    full_name: 'Test Person',
    sex: 'U',
    birth_year: null,
    death_year: null,
    living: false,
    ...overrides,
  };
}

function event(overrides: Partial<HistoricalEvent> & { id: string }): HistoricalEvent {
  return {
    name: overrides.id,
    startYear: 1700,
    endYear: 1710,
    region: 'Test',
    summary: 'A test event.',
    tier: 'major',
    ...overrides,
  };
}

const NO_REGIONS = new Set<string>();

describe('rankLivedThroughEvents — lifespan overlap', () => {
  const range = event({ id: 'e', startYear: 1700, endYear: 1710 });

  it('includes a fully documented overlap', () => {
    const tags = rankLivedThroughEvents(person({ birth_year: 1680, death_year: 1750 }), [range], NO_REGIONS);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ confidence: 'documented', ageAtStart: 20 });
  });

  it('includes the edge years: death on the start year, birth on the end year', () => {
    expect(rankLivedThroughEvents(person({ birth_year: 1650, death_year: 1700 }), [range], NO_REGIONS)).toHaveLength(1);
    const bornAtEnd = rankLivedThroughEvents(person({ birth_year: 1710, death_year: 1780 }), [range], NO_REGIONS);
    expect(bornAtEnd).toHaveLength(1);
    expect(bornAtEnd[0]!.bornDuring).toBe(true);
  });

  it('excludes lives that end before or begin after the event', () => {
    expect(rankLivedThroughEvents(person({ birth_year: 1650, death_year: 1699 }), [range], NO_REGIONS)).toHaveLength(0);
    expect(rankLivedThroughEvents(person({ birth_year: 1711, death_year: 1790 }), [range], NO_REGIONS)).toHaveLength(0);
  });

  it('treats a null death year as alive within the assumed lifespan', () => {
    // Born 1650, event starts 1700: within 90 years, probably still alive.
    const near = rankLivedThroughEvents(person({ birth_year: 1650 }), [range], NO_REGIONS);
    expect(near).toHaveLength(1);
    expect(near[0]!.confidence).toBe('probable');
    // Born 1600, event starts 1700: beyond the assumed lifespan — no tag,
    // even though the naive "death IS NULL" reading would include them.
    expect(rankLivedThroughEvents(person({ birth_year: 1600 }), [range], NO_REGIONS)).toHaveLength(0);
  });

  it('treats a living person with no death year as documented', () => {
    const modern = event({ id: 'modern', startYear: 2001, endYear: 2001 });
    const tags = rankLivedThroughEvents(person({ birth_year: 1950, living: true }), [modern], NO_REGIONS);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.confidence).toBe('documented');
  });

  it('returns nothing for a person with no birth or death year', () => {
    expect(rankLivedThroughEvents(person({}), [range], NO_REGIONS)).toHaveLength(0);
  });
});

describe('rankLivedThroughEvents — ranking and cap', () => {
  const subject = person({ birth_year: 1700, death_year: 1710 });
  const overlapping = (overrides: Partial<HistoricalEvent> & { id: string }) =>
    event({ startYear: 1700, endYear: 1710, ...overrides });

  it('ranks by tier among eligible events: major above matched regional above matched local', () => {
    const regions = new Set(['Test Region']);
    const tags = rankLivedThroughEvents(
      subject,
      [
        overlapping({ id: 'local', tier: 'local', geoScope: { regions: ['Test Region'] } }),
        overlapping({ id: 'regional', tier: 'regional', geoScope: { regions: ['Test Region'] } }),
        overlapping({ id: 'major', tier: 'major', geoScope: { regions: ['Test Region'] } }),
      ],
      regions,
    );
    expect(tags.map((t) => t.event.id)).toEqual(['major', 'regional', 'local']);
  });

  it('geography GATES regional and local events — the shelf rule (2026-08-15)', () => {
    // A regional event somewhere the person never was is absent, not
    // merely outranked. Zero tags beats a wrong tag.
    const tags = rankLivedThroughEvents(
      subject,
      [
        overlapping({ id: 'regional-elsewhere', tier: 'regional', geoScope: { regions: ['California'] } }),
        overlapping({ id: 'local-elsewhere', tier: 'local', geoScope: { regions: ['Massachusetts'] } }),
      ],
      NO_REGIONS,
    );
    expect(tags).toHaveLength(0);
  });

  it('boosts a geo-matched regional event above an unmatched major', () => {
    const regions = new Set(['Massachusetts']);
    const tags = rankLivedThroughEvents(
      subject,
      [
        overlapping({ id: 'major-elsewhere', tier: 'major' }),
        overlapping({ id: 'regional-here', tier: 'regional', geoScope: { regions: ['Massachusetts'] } }),
        overlapping({ id: 'regional-elsewhere', tier: 'regional', geoScope: { regions: ['California'] } }),
      ],
      regions,
    );
    expect(tags.map((t) => t.event.id)).toEqual(['regional-here', 'major-elsewhere']);
    expect(tags[0]!.geoMatched).toBe(true);
    expect(tags[1]!.geoMatched).toBe(false);
  });

  it('prefers major on ties: a geo-matched major beats a geo-matched regional', () => {
    const regions = new Set(['Maine']);
    const tags = rankLivedThroughEvents(
      subject,
      [
        overlapping({ id: 'regional-here', tier: 'regional', geoScope: { regions: ['Maine'] } }),
        overlapping({ id: 'major-here', tier: 'major', geoScope: { regions: ['Maine'] } }),
      ],
      regions,
    );
    expect(tags.map((t) => t.event.id)).toEqual(['major-here', 'regional-here']);
  });

  it('caps at 5 tags and prefers major tier when over the cap', () => {
    const majors = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => overlapping({ id, tier: 'major' }));
    const minors = [
      overlapping({ id: 'r1', tier: 'regional' }),
      overlapping({ id: 'l1', tier: 'local' }),
    ];
    const tags = rankLivedThroughEvents(subject, [...minors, ...majors], NO_REGIONS);
    expect(tags).toHaveLength(LIVED_THROUGH_TAG_CAP);
    expect(tags.every((t) => t.event.tier === 'major')).toBe(true);
  });

  it('caps against the real library: a placeless 18th–19th century life gets majors only', () => {
    const tags = rankLivedThroughEvents(person({ birth_year: 1750, death_year: 1840 }), HISTORICAL_EVENTS, NO_REGIONS);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.length).toBeLessThanOrEqual(LIVED_THROUGH_TAG_CAP);
    expect(tags.every((t) => t.event.tier === 'major')).toBe(true);
  });

  it("never puts Salem on a German ancestor's card (Katie Grafer, 2026-08-15)", () => {
    // Her life overlaps the trials; her record's places map to no
    // region the corpus knows. Salem is local to Massachusetts and
    // must be absent — not outranked, absent.
    const tags = rankLivedThroughEvents(person({ birth_year: 1660, death_year: 1710 }), HISTORICAL_EVENTS, NO_REGIONS);
    expect(tags.map((t) => t.event.id)).not.toContain('salem-witch-trials');
    expect(tags.every((t) => t.event.tier === 'major' || t.geoMatched)).toBe(true);
  });

  it('surfaces the geographically right story from the real library', () => {
    // A colonial Massachusetts life: Salem (local, geo-matched) must beat
    // an unmatched regional, and King Philip's War (regional, geo-matched)
    // must lead.
    const tags = rankLivedThroughEvents(
      person({ birth_year: 1660, death_year: 1700 }),
      HISTORICAL_EVENTS,
      new Set(['Massachusetts']),
    );
    expect(tags[0]!.event.id).toBe('king-philips-war');
    expect(tags.map((t) => t.event.id)).toContain('salem-witch-trials');
  });
});

describe('regionsFromPlaceParts', () => {
  it('canonicalizes place parts into display regions', () => {
    const regions = regionsFromPlaceParts([
      { places: { parts: ['Boston', 'Suffolk', 'Massachusetts', 'USA'] } },
      { places: { parts: ['Grand-Pré', 'Acadia'] } },
      { places: null },
      { places: { parts: ['Somewhere'] } },
    ]);
    expect(regions).toEqual(new Set(['Massachusetts', 'Acadia']));
  });
});
