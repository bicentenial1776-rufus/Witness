import { describe, expect, it } from 'vitest';
import { findOrphanRecords, soundex } from '../orphanRecords.js';
import type { HealthEvent, HealthFamily, HealthIndividual, TreeHealthData } from '../treeHealth.js';

function person(overrides: Partial<HealthIndividual> & { id: string }): HealthIndividual {
  return {
    full_name: overrides.id,
    gedcom_xref: null,
    surname: null,
    sex: 'U',
    birth_year: null,
    death_year: null,
    living: false,
    ...overrides,
  };
}

function family(overrides: Partial<HealthFamily> & { id: string }): HealthFamily {
  return {
    husband_id: null,
    wife_id: null,
    marriage_date_year: null,
    marriage_date_month: null,
    marriage_date_day: null,
    marriage_date_qualifier: null,
    children: [],
    ...overrides,
  };
}

function data(overrides: Partial<TreeHealthData>): TreeHealthData {
  return { individuals: [], events: [], families: [], ...overrides };
}

describe('soundex', () => {
  it('clusters surname variants', () => {
    expect(soundex('Howe')).toBe(soundex('How'));
    expect(soundex('Smith')).toBe(soundex('Smyth'));
    expect(soundex('Howe')).not.toBe(soundex('Banks'));
  });
});

describe('findOrphanRecords', () => {
  const mainTree = {
    individuals: [
      person({ id: 'root', surname: 'Howe', full_name: 'Main Howe', birth_year: 1700, death_year: 1770 }),
      person({ id: 'spouse', surname: 'Field', birth_year: 1705 }),
      person({ id: 'kid', surname: 'Howe', birth_year: 1730 }),
      person({ id: 'kid2', surname: 'Howe', birth_year: 1733 }),
    ],
    families: [
      family({ id: 'f-main', husband_id: 'root', wife_id: 'spouse', children: ['kid', 'kid2'] }),
    ],
  };

  it('separates the main tree, islands, and solos', () => {
    const report = findOrphanRecords(
      data({
        individuals: [
          ...mainTree.individuals,
          person({ id: 'isl-a', surname: 'Banks', birth_year: 1720 }),
          person({ id: 'isl-b', surname: 'Banks', birth_year: 1745 }),
          person({ id: 'solo', surname: 'Stray', birth_year: 1800 }),
        ],
        families: [...mainTree.families, family({ id: 'f-isl', husband_id: 'isl-a', children: ['isl-b'] })],
      }),
    );
    expect(report.mainTreeSize).toBe(4);
    expect(report.totalDisconnected).toBe(3);
    expect(report.islands).toHaveLength(1);
    expect(report.islands[0]?.memberIds).toHaveLength(2);
    expect(report.solos.map((s) => s.individualId)).toEqual(['solo']);
  });

  it('anchors an island on its best-connected member', () => {
    const report = findOrphanRecords(
      data({
        individuals: [
          ...mainTree.individuals,
          person({ id: 'hub', surname: 'Banks', birth_year: 1700 }),
          person({ id: 'w1', surname: 'Marsh' }),
          person({ id: 'c1' }),
          person({ id: 'c2' }),
        ],
        families: [
          ...mainTree.families,
          family({ id: 'f1', husband_id: 'hub', wife_id: 'w1', children: ['c1', 'c2'] }),
        ],
      }),
    );
    expect(report.islands[0]?.anchorId).toBe('hub');
  });

  it('flags bare solo records as deletion candidates and sorts them last', () => {
    const report = findOrphanRecords(
      data({
        individuals: [
          ...mainTree.individuals,
          person({ id: 'bare', full_name: 'John Smith' }),
          person({ id: 'dated', surname: 'Stray', birth_year: 1800 }),
        ],
      }),
    );
    const bare = report.solos.find((s) => s.individualId === 'bare');
    const dated = report.solos.find((s) => s.individualId === 'dated');
    expect(bare?.deletionCandidate).toBe(true);
    expect(bare?.suggestion).toBeNull();
    expect(dated?.deletionCandidate).toBe(false);
    expect(report.solos[report.solos.length - 1]?.individualId).toBe('bare');
  });

  it('suggests a main-tree connection on surname + era, with reasons', () => {
    const report = findOrphanRecords(
      data({
        individuals: [
          ...mainTree.individuals,
          person({ id: 'lost', surname: 'Howe', full_name: 'Lost Howe', birth_year: 1735 }),
        ],
        families: mainTree.families,
      }),
    );
    const suggestion = report.solos[0]?.suggestion;
    expect(suggestion).not.toBeNull();
    expect(['root', 'kid']).toContain(suggestion!.candidateId);
    expect(suggestion!.reasons.join(' ')).toMatch(/surname Howe/);
    expect(suggestion!.reasons.join(' ')).toMatch(/same era/);
  });

  it('rejects same-surname candidates from the wrong century', () => {
    const report = findOrphanRecords(
      data({
        individuals: [
          ...mainTree.individuals,
          person({ id: 'lost', surname: 'Howe', birth_year: 1950 }),
        ],
        families: mainTree.families,
      }),
    );
    expect(report.solos[0]?.suggestion).toBeNull();
  });

  it('boosts shared places and names them', () => {
    const events: HealthEvent[] = [
      { individual_id: 'root', event_type: 'residence', date_year: 1720, date_month: null, date_day: null, date_qualifier: null, place_id: 'p1' },
      { individual_id: 'lost', event_type: 'birth', date_year: 1735, date_month: null, date_day: null, date_qualifier: null, place_id: 'p1' },
    ];
    const report = findOrphanRecords(
      data({
        individuals: [
          ...mainTree.individuals,
          person({ id: 'lost', surname: 'Howe', birth_year: 1735 }),
        ],
        events,
        families: mainTree.families,
      }),
      { placeNames: new Map([['p1', 'Sudbury, Massachusetts']]) },
    );
    const suggestion = report.solos[0]?.suggestion;
    expect(suggestion?.candidateId).toBe('root');
    expect(suggestion?.reasons.join(' ')).toMatch(/Sudbury/);
  });
});
