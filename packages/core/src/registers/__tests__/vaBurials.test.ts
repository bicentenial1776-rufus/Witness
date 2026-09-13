import { describe, expect, it } from 'vitest';

import {
  matchVaRows,
  scoreVaRow,
  unshout,
  usStatesFromPlaceParts,
  vaSoqlWhere,
  vaYear,
  type VaGraveRow,
  type VaPersonFacts,
} from '../vaBurials.js';

// A real row shape from data.va.gov 3u66-fxug (values lightly altered).
const charles: VaGraveRow = {
  decedent_id: '5227918',
  d_first_name: 'Charles',
  d_mid_name: 'R',
  d_last_name: 'Howe',
  d_birth_date: '02/17/1923',
  d_death_date: '03/11/2021',
  cem_name: 'LAKESIDE CEMETERY',
  city: 'BRYANT POND',
  state: 'ME',
  zip: '04219',
  relationship: 'Veteran (Self)',
  v_first_name: 'Charles',
  v_mid_name: 'R',
  v_last_name: 'Howe',
  branch: 'US ARMY',
  rank: 'TEC 5',
  war: 'WORLD WAR II',
  location_point: { type: 'Point', coordinates: [-70.6, 44.4] },
};

const person: VaPersonFacts = {
  id: 'p1',
  fullName: 'Charles Robert Howe',
  givenName: 'Charles Robert',
  surname: 'Howe',
  birthYear: 1923,
  deathYear: 2021,
  usStates: ['ME', 'MA'],
};

describe('vaYear / unshout', () => {
  it('reads the year off MM/DD/YYYY and bare years', () => {
    expect(vaYear('03/11/2021')).toBe(2021);
    expect(vaYear('1944')).toBe(1944);
    expect(vaYear('')).toBeNull();
    expect(vaYear(null)).toBeNull();
  });
  it('lowers shouting caps and leaves mixed case alone', () => {
    expect(unshout('LAKESIDE CEMETERY')).toBe('Lakeside Cemetery');
    expect(unshout('US ARMY')).toBe('US Army');
    expect(unshout('Bryant Pond')).toBe('Bryant Pond');
  });
});

describe('scoreVaRow', () => {
  it('is strong when death year, birth year, middle initial and state all agree', () => {
    const c = scoreVaRow(person, charles);
    expect(c).not.toBeNull();
    expect(c!.confidence).toBe('strong');
    expect(c!.reasons).toContain('died in 2021, the year your tree records');
    expect(c!.reasons).toContain('born in 1923, the year your tree records');
    expect(c!.reasons.some((r) => r.startsWith('middle initial R'))).toBe(true);
    expect(c!.recordName).toBe('Charles R Howe (1923–2021)');
    expect(c!.recordSummary).toBe('US Army · Tec 5 · World War II — Lakeside Cemetery, Bryant Pond, ME');
    expect(c!.savedPayload['latitude']).toBe(44.4);
    expect(c!.savedPayload['longitude']).toBe(-70.6);
    expect(c!.savedPayload['event_year']).toBe(2021);
    expect(c!.sourceCitation).toContain('decedent 5227918');
  });

  it('refuses a row whose death year disagrees, whatever else matches', () => {
    expect(scoreVaRow({ ...person, deathYear: 2015 }, charles)).toBeNull();
  });

  it('refuses a row whose birth year is far off', () => {
    expect(scoreVaRow({ ...person, birthYear: 1910 }, charles)).toBeNull();
  });

  it('refuses when the tree has no death year — nothing to gate on', () => {
    expect(scoreVaRow({ ...person, deathYear: null }, charles)).toBeNull();
  });

  it('is probable, not strong, when only the death year and state agree', () => {
    const c = scoreVaRow({ ...person, givenName: 'Charles', birthYear: null }, charles);
    expect(c).not.toBeNull();
    expect(c!.confidence).toBe('probable');
    expect(c!.score).toBe(4);
    expect(c!.reasons).toContain('your tree has no birth year to check against the record');
  });

  it('an exact death year with nothing else to go on is not offered', () => {
    expect(scoreVaRow({ ...person, givenName: 'Charles', birthYear: null, usStates: [] }, charles)).toBeNull();
  });

  it('collapses the dataset’s repeated branch and rank lists', () => {
    const c = scoreVaRow(person, {
      ...charles,
      branch: 'US AIR FORCE, US AIR FORCE',
      rank: 'T SGT, T SGT',
      war: 'WORLD WAR II, KOREA',
    });
    expect(c!.recordSummary).toBe('US Air Force · T Sgt · World War II, Korea — Lakeside Cemetery, Bryant Pond, ME');
    expect(c!.savedPayload['branch']).toBe('US Air Force');
  });

  it('a conflicting middle name costs points and says so', () => {
    const c = scoreVaRow({ ...person, givenName: 'Charles William' }, charles);
    expect(c).not.toBeNull();
    expect(c!.reasons.some((r) => r.includes('middle name is R; your tree says William'))).toBe(true);
    expect(c!.score).toBe(3 + 3 - 2 + 1);
  });

  it('a spouse buried beside the veteran names the veteran, and finds him in the tree', () => {
    const mary: VaGraveRow = {
      ...charles,
      decedent_id: '5227919',
      d_first_name: 'Mary',
      d_mid_name: 'E',
      d_birth_date: '05/01/1925',
      d_death_date: '01/02/2010',
      relationship: 'Wife',
    };
    const wife: VaPersonFacts = {
      id: 'p2',
      fullName: 'Mary Ellen Howe',
      givenName: 'Mary Ellen',
      surname: 'Howe',
      birthYear: 1925,
      deathYear: 2010,
      usStates: [],
      spouseNames: ['Charles Robert Howe'],
    };
    const c = scoreVaRow(wife, mary);
    expect(c).not.toBeNull();
    expect(c!.reasons).toContain('buried as the wife of Charles R Howe — Charles Robert Howe in your tree');
    expect(c!.confidence).toBe('strong');
    expect(c!.savedPayload['relationship']).toBe('Wife');
    expect(c!.savedPayload['veteran_name']).toBe('Charles R Howe');
  });
});

describe('matchVaRows', () => {
  it('drops duplicates, sorts best first, and caps the list', () => {
    const rows: VaGraveRow[] = [
      { ...charles, decedent_id: '1', d_mid_name: 'W' },
      charles,
      charles,
      { ...charles, decedent_id: '3', d_birth_date: '02/17/1924' },
    ];
    // Exact birth (9) > birth a year off (6) > conflicting middle name (5).
    const out = matchVaRows(person, rows, 2);
    expect(out.map((c) => String(c.row.decedent_id))).toEqual(['5227918', '3']);
  });
});

describe('vaSoqlWhere', () => {
  it('upper-cases and doubles quotes', () => {
    expect(vaSoqlWhere({ ...person, surname: "O'Brien", givenName: 'Seán' })).toBe(
      "upper(d_last_name)='O''BRIEN' AND upper(d_first_name)='SEÁN' AND d_death_date IS NOT NULL",
    );
  });
  it('declines a one-letter given name', () => {
    expect(vaSoqlWhere({ ...person, givenName: 'J' })).toBeNull();
  });
  it('reads the names off full_name when the columns are empty (the Howe/Field import)', () => {
    const bare: VaPersonFacts = { ...person, givenName: null, surname: null, fullName: 'Charles Robert Howe' };
    expect(vaSoqlWhere(bare)).toBe(
      "upper(d_last_name)='HOWE' AND upper(d_first_name)='CHARLES' AND d_death_date IS NOT NULL",
    );
    // …and the middle name still counts.
    expect(scoreVaRow(bare, charles)!.reasons.some((r) => r.startsWith('middle initial R'))).toBe(true);
    expect(vaSoqlWhere({ ...person, givenName: null, surname: null, fullName: 'Howe' })).toBeNull();
  });
});

describe('usStatesFromPlaceParts', () => {
  it('reads state names and postal codes out of place parts', () => {
    expect(
      usStatesFromPlaceParts([
        ['Sudbury', 'Middlesex', 'Massachusetts', 'USA'],
        ['Bryant Pond', 'ME', 'United States'],
        null,
      ]).sort(),
    ).toEqual(['MA', 'ME']);
  });
});
