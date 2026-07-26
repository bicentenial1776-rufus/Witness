import { describe, expect, it } from 'vitest';
import {
  runTreeHealth,
  type HealthEvent,
  type HealthFamily,
  type HealthIndividual,
  type TreeHealthData,
} from '../treeHealth.js';

const YEAR = 2026;

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

function birth(individual_id: string, y: number, m: number | null = null, d: number | null = null): HealthEvent {
  return { individual_id, event_type: 'birth', date_year: y, date_month: m, date_day: d, date_qualifier: 'exact', place_id: null };
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

function audit(data: Partial<TreeHealthData>) {
  return runTreeHealth(
    { individuals: [], events: [], families: [], ...data },
    { currentYear: YEAR },
  );
}

const checksIn = (r: ReturnType<typeof audit>) => r.findings.map((f) => f.check);

describe('individual checks', () => {
  it('flags birth after death and implausible lifespans', () => {
    const r = audit({
      individuals: [
        person({ id: 'a', birth_year: 1891, death_year: 1819 }),
        person({ id: 'b', birth_year: 1700, death_year: 1815 }),
        person({ id: 'ok', birth_year: 1700, death_year: 1790 }),
      ],
    });
    expect(checksIn(r)).toContain('birth_after_death');
    expect(checksIn(r)).toContain('implausible_lifespan');
    expect(r.findings.filter((f) => f.individualIds.includes('ok'))).toHaveLength(0);
  });

  it('does not convict on same-year partial dates', () => {
    const r = audit({ individuals: [person({ id: 'a', birth_year: 1850, death_year: 1850 })] });
    expect(checksIn(r)).not.toContain('birth_after_death');
  });

  it('flags burial before death only with definite ordering', () => {
    const events: HealthEvent[] = [
      { individual_id: 'a', event_type: 'death', date_year: 1900, date_month: 5, date_day: null, date_qualifier: 'exact', place_id: null },
      { individual_id: 'a', event_type: 'burial', date_year: 1900, date_month: 2, date_day: null, date_qualifier: 'exact', place_id: null },
      { individual_id: 'b', event_type: 'death', date_year: 1900, date_month: null, date_day: null, date_qualifier: 'exact', place_id: null },
      { individual_id: 'b', event_type: 'burial', date_year: 1900, date_month: null, date_day: null, date_qualifier: 'exact', place_id: null },
    ];
    const r = audit({ individuals: [person({ id: 'a' }), person({ id: 'b' })], events });
    const flagged = r.findings.filter((f) => f.check === 'burial_before_death');
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.individualIds).toEqual(['a']);
  });

  it('flags living people with death facts', () => {
    const r = audit({ individuals: [person({ id: 'a', living: true, death_year: 1990 })] });
    expect(checksIn(r)).toContain('living_but_has_death');
  });

  it('flags residence outside the lifespan', () => {
    const events: HealthEvent[] = [
      birth('a', 1850),
      { individual_id: 'a', event_type: 'residence', date_year: 1840, date_month: null, date_day: null, date_qualifier: null, place_id: null },
    ];
    const r = audit({ individuals: [person({ id: 'a', birth_year: 1850 })], events });
    expect(checksIn(r)).toContain('fact_before_birth');
  });

  it('separates duplicate facts from conflicting facts', () => {
    const events: HealthEvent[] = [
      birth('dup', 1850, 3, 1),
      birth('dup', 1850, 3, 1),
      birth('conflict', 1850),
      birth('conflict', 1857),
    ];
    const r = audit({ individuals: [person({ id: 'dup' }), person({ id: 'conflict' })], events });
    expect(r.findings.find((f) => f.check === 'duplicate_fact')?.individualIds).toEqual(['dup']);
    expect(r.findings.find((f) => f.check === 'conflicting_fact')?.individualIds).toEqual(['conflict']);
  });

  it('flags future dates', () => {
    const r = audit({ individuals: [person({ id: 'a', birth_year: YEAR + 4 })] });
    expect(checksIn(r)).toContain('date_in_future');
  });
});

describe('family checks', () => {
  it('flags implausible parental ages in both directions', () => {
    const r = audit({
      individuals: [
        person({ id: 'mother', sex: 'F', birth_year: 1800 }),
        person({ id: 'father', sex: 'M', birth_year: 1700 }),
        person({ id: 'child', birth_year: 1862 }),
        person({ id: 'youngMother', sex: 'F', birth_year: 1855 }),
        person({ id: 'child2', birth_year: 1865 }),
      ],
      families: [
        family({ id: 'f1', husband_id: 'father', wife_id: 'mother', children: ['child'] }),
        family({ id: 'f2', wife_id: 'youngMother', children: ['child2'] }),
      ],
    });
    expect(checksIn(r)).toContain('mother_too_old'); // 62
    expect(checksIn(r)).toContain('father_too_old'); // 162
    expect(checksIn(r)).toContain('mother_too_young'); // 10
  });

  it('accepts ordinary parental ages', () => {
    const r = audit({
      individuals: [
        person({ id: 'mother', sex: 'F', birth_year: 1820 }),
        person({ id: 'child', birth_year: 1845 }),
      ],
      families: [family({ id: 'f1', wife_id: 'mother', children: ['child'] })],
    });
    expect(r.findings).toHaveLength(0);
  });

  it('flags posthumous impossibilities', () => {
    const r = audit({
      individuals: [
        person({ id: 'mother', sex: 'F', birth_year: 1800, death_year: 1840 }),
        person({ id: 'father', sex: 'M', birth_year: 1795, death_year: 1841 }),
        person({ id: 'child', birth_year: 1844 }),
      ],
      families: [family({ id: 'f1', husband_id: 'father', wife_id: 'mother', children: ['child'] })],
    });
    expect(checksIn(r)).toContain('born_after_mothers_death'); // 1844 > 1840
    expect(checksIn(r)).toContain('born_long_after_fathers_death'); // 1844 ≥ 1841 + 2
  });

  it('allows a child born the year after the father dies', () => {
    const r = audit({
      individuals: [
        person({ id: 'father', sex: 'M', birth_year: 1795, death_year: 1843 }),
        person({ id: 'child', birth_year: 1844 }),
      ],
      families: [family({ id: 'f1', husband_id: 'father', children: ['child'] })],
    });
    expect(checksIn(r)).not.toContain('born_long_after_fathers_death');
  });

  it('flags marriage after death and child marriages', () => {
    const r = audit({
      individuals: [
        person({ id: 'h', sex: 'M', birth_year: 1800, death_year: 1850 }),
        person({ id: 'w', sex: 'F', birth_year: 1843 }),
      ],
      families: [family({ id: 'f1', husband_id: 'h', wife_id: 'w', marriage_date_year: 1855 })],
    });
    expect(checksIn(r)).toContain('marriage_after_death'); // h died 1850
    expect(checksIn(r)).toContain('marriage_before_13'); // w aged 12
  });

  it('flags sex/role mismatches and same-surname couples', () => {
    const r = audit({
      individuals: [
        person({ id: 'h', sex: 'F', surname: 'Doiron', full_name: 'A Doiron' }),
        person({ id: 'w', sex: 'M', surname: 'Doiron', full_name: 'B Doiron' }),
      ],
      families: [family({ id: 'f1', husband_id: 'h', wife_id: 'w' })],
    });
    expect(checksIn(r)).toContain('husband_recorded_female');
    expect(checksIn(r)).toContain('wife_recorded_male');
    expect(checksIn(r)).toContain('same_surname_couple');
  });

  it('grades sibling spacing: twins pass, tight gaps caution, impossible gaps fail', () => {
    const events: HealthEvent[] = [
      birth('twin1', 1850, 3, 1),
      birth('twin2', 1850, 3, 2),
      birth('soon', 1851, 1, 10), // ~315 days after twin2 — fine
      birth('tooSoon', 1851, 9, 20), // ~253 days later — caution
      birth('impossible', 1851, 12, 1), // 72 days later — fail
    ];
    const ids = ['twin1', 'twin2', 'soon', 'tooSoon', 'impossible'];
    const r = audit({
      individuals: ids.map((id) => person({ id, birth_year: 1850 })),
      events,
      families: [family({ id: 'f1', children: ids })],
    });
    expect(checksIn(r)).toContain('sibling_born_too_soon');
    expect(checksIn(r)).toContain('sibling_born_impossibly_soon');
    const impossible = r.findings.find((f) => f.check === 'sibling_born_impossibly_soon')!;
    expect(impossible.individualIds).toEqual(['tooSoon', 'impossible']);
  });

  it('never convicts siblings on estimated dates', () => {
    const events: HealthEvent[] = [
      { individual_id: 'a', event_type: 'birth', date_year: 1850, date_month: 1, date_day: 1, date_qualifier: 'estimated', place_id: null },
      { individual_id: 'b', event_type: 'birth', date_year: 1850, date_month: 3, date_day: 1, date_qualifier: 'exact', place_id: null },
    ];
    const r = audit({
      individuals: [person({ id: 'a' }), person({ id: 'b' })],
      events,
      families: [family({ id: 'f1', children: ['a', 'b'] })],
    });
    expect(checksIn(r)).not.toContain('sibling_born_impossibly_soon');
  });
});

// The conviction philosophy, enforced (2026-07-26 audit): a check fires
// only if the violation holds at the recorded date precision. Estimated /
// about / calculated / between dates never convict; BEF/AFT convict only
// when the violation is provable under the bound.
describe('qualified dates never falsely convict', () => {
  const ev = (
    individual_id: string,
    event_type: HealthEvent['event_type'],
    y: number,
    q: HealthEvent['date_qualifier'],
    m: number | null = null,
    d: number | null = null,
  ): HealthEvent => ({ individual_id, event_type, date_year: y, date_month: m, date_day: d, date_qualifier: q, place_id: null });

  it('death BEF 1850 with an 1849 burial is consistent, not a conviction', () => {
    const r = audit({
      individuals: [person({ id: 'a' })],
      events: [ev('a', 'death', 1850, 'before'), ev('a', 'burial', 1849, 'exact')],
    });
    expect(checksIn(r)).not.toContain('burial_before_death');
  });

  it('death AFT 1850 with an 1853 residence may be fine — no conviction', () => {
    const r = audit({
      individuals: [person({ id: 'a', birth_year: 1800 })],
      events: [ev('a', 'death', 1850, 'after'), ev('a', 'residence', 1853, 'exact')],
    });
    expect(checksIn(r)).not.toContain('fact_after_death');
  });

  it('death BEF 1850 with an 1853 residence is still provably wrong', () => {
    const r = audit({
      individuals: [person({ id: 'a', birth_year: 1800 })],
      events: [ev('a', 'death', 1850, 'before'), ev('a', 'residence', 1853, 'exact')],
    });
    expect(checksIn(r)).toContain('fact_after_death');
  });

  it('ABT lifespans never convict; AFT death that still proves >110 does', () => {
    const r = audit({
      individuals: [person({ id: 'abt' }), person({ id: 'aft' })],
      events: [
        ev('abt', 'birth', 1700, 'about'),
        ev('abt', 'death', 1815, 'about'),
        ev('aft', 'birth', 1700, 'exact'),
        ev('aft', 'death', 1815, 'after'),
      ],
    });
    const accused = r.findings.filter((f) => f.check === 'implausible_lifespan');
    expect(accused.map((f) => f.individualIds[0])).toEqual(['aft']);
  });

  it('a mother born BET (stored midpoint) never convicts as too old', () => {
    const r = audit({
      individuals: [person({ id: 'mother' }), person({ id: 'child', birth_year: 1906 })],
      events: [ev('mother', 'birth', 1845, 'between'), birth('child', 1906)],
      families: [family({ id: 'f', wife_id: 'mother', children: ['child'] })],
    });
    expect(checksIn(r)).not.toContain('mother_too_old');
  });

  it('marriage ABT never convicts marriage_after_death', () => {
    const r = audit({
      individuals: [person({ id: 'h', death_year: 1800 })],
      families: [
        family({ id: 'f', husband_id: 'h', marriage_date_year: 1805, marriage_date_qualifier: 'about' }),
      ],
    });
    expect(checksIn(r)).not.toContain('marriage_after_death');
  });

  it('a BEF future year is not a future date', () => {
    const r = audit({
      individuals: [person({ id: 'a' })],
      events: [ev('a', 'death', YEAR + 4, 'before')],
    });
    expect(checksIn(r)).not.toContain('date_in_future');
    const abt = audit({
      individuals: [person({ id: 'b' })],
      events: [ev('b', 'birth', 2917, 'about')],
    });
    expect(checksIn(abt)).toContain('date_in_future');
  });

  it('same year at different precisions is a duplicate, not a conflict', () => {
    const r = audit({
      individuals: [person({ id: 'a' })],
      events: [ev('a', 'birth', 1850, 'exact'), ev('a', 'birth', 1850, 'exact', 6, 15)],
    });
    expect(checksIn(r)).toContain('duplicate_fact');
    expect(checksIn(r)).not.toContain('conflicting_fact');
  });

  it('pre-1752 January–March sibling gaps never convict (dual dating)', () => {
    const r = audit({
      individuals: [person({ id: 'a' }), person({ id: 'b' })],
      events: [birth('a', 1700, 4, 1), birth('b', 1700, 1, 1)],
      families: [family({ id: 'f', children: ['a', 'b'] })],
    });
    expect(checksIn(r)).not.toContain('sibling_born_impossibly_soon');
    // The same gap after 1752 still convicts.
    const modern = audit({
      individuals: [person({ id: 'a' }), person({ id: 'b' })],
      events: [birth('a', 1900, 4, 1), birth('b', 1900, 1, 1)],
      families: [family({ id: 'f', children: ['a', 'b'] })],
    });
    expect(checksIn(modern)).toContain('sibling_born_impossibly_soon');
  });
});
