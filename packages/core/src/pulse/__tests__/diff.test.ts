import { describe, expect, it } from 'vitest';

import { diffTrees, pulseSummary } from '../diff.js';
import type { HealthFamily, HealthIndividual, TreeHealthData } from '../../query/treeHealth.js';

let seq = 0;

function individual(over: Partial<HealthIndividual> & { gedcom_xref: string | null }): HealthIndividual {
  return {
    id: `db-${++seq}`,
    ancestry_uid: null,
    full_name: 'Ada Howe',
    surname: 'Howe',
    sex: 'F',
    birth_year: null,
    death_year: null,
    living: false,
    ...over,
  };
}

function family(over: Partial<HealthFamily>): HealthFamily {
  return {
    id: `fam-${++seq}`,
    husband_id: null,
    wife_id: null,
    marriage_date_year: null,
    marriage_date_month: null,
    marriage_date_day: null,
    marriage_date_qualifier: null,
    children: [],
    ...over,
  };
}

function tree(individuals: HealthIndividual[], families: HealthFamily[] = []): TreeHealthData {
  return { individuals, families, events: [] } as unknown as TreeHealthData;
}

describe('diffTrees', () => {
  it('reports nothing moved when the same file is re-uploaded', () => {
    const before = tree([individual({ gedcom_xref: '@I1@', birth_year: 1880 })]);
    const after = tree([individual({ gedcom_xref: '@I1@', birth_year: 1880 })]);
    const pulse = diffTrees(before, after);
    expect(pulse.unchanged).toBe(true);
    expect(pulseSummary(pulse)).toBe('Nothing changed since your last upload.');
  });

  it('matches people across files whether or not the pointers keep their @s', () => {
    const before = tree([individual({ gedcom_xref: '@I1@' })]);
    const after = tree([individual({ gedcom_xref: 'I1', birth_year: 1880 })]);
    const pulse = diffTrees(before, after);
    expect(pulse.added).toHaveLength(0);
    expect(pulse.datesFilled).toHaveLength(1);
  });

  it('separates people added from people gone', () => {
    const before = tree([
      individual({ gedcom_xref: '@I1@', full_name: 'Stays' }),
      individual({ gedcom_xref: '@I2@', full_name: 'Goes' }),
    ]);
    const after = tree([
      individual({ gedcom_xref: '@I1@', full_name: 'Stays' }),
      individual({ gedcom_xref: '@I3@', full_name: 'Arrives' }),
    ]);
    const pulse = diffTrees(before, after);
    expect(pulse.added.map((p) => p.name)).toEqual(['Arrives']);
    expect(pulse.removed.map((p) => p.name)).toEqual(['Goes']);
  });

  it('counts a vital only when it went from unrecorded to recorded', () => {
    const before = tree([individual({ gedcom_xref: '@I1@', birth_year: null, death_year: 1950 })]);
    const after = tree([individual({ gedcom_xref: '@I1@', birth_year: 1880, death_year: 1950 })]);
    const pulse = diffTrees(before, after);
    expect(pulse.datesFilled).toHaveLength(1);
    expect(pulse.datesFilled[0]?.gained).toEqual(['birth']);
  });

  it('does not count a corrected date as a filled one', () => {
    const before = tree([individual({ gedcom_xref: '@I1@', birth_year: 1879 })]);
    const after = tree([individual({ gedcom_xref: '@I1@', birth_year: 1880 })]);
    expect(diffTrees(before, after).datesFilled).toHaveLength(0);
  });

  it('calls it a broken brick wall when a parent appears', () => {
    const child = individual({ gedcom_xref: '@I1@', full_name: 'Child' });
    const father = individual({ gedcom_xref: '@I2@', full_name: 'Father' });
    const before = tree([child]);
    const newChild = individual({ gedcom_xref: '@I1@', full_name: 'Child' });
    const newFather = individual({ gedcom_xref: '@I2@', full_name: 'Father' });
    const after = tree(
      [newChild, newFather],
      [family({ husband_id: newFather.id, children: [newChild.id] })],
    );
    const pulse = diffTrees(before, after);
    expect(pulse.brickWallsBroken.map((p) => p.name)).toEqual(['Child']);
  });

  it('does not treat a bare sibling grouping as parentage', () => {
    // A FAM with children but neither spouse records that they are siblings,
    // not who their parents were — no wall has come down.
    const a = individual({ gedcom_xref: '@I1@' });
    const b = individual({ gedcom_xref: '@I2@' });
    const before = tree([a, b]);
    const a2 = individual({ gedcom_xref: '@I1@' });
    const b2 = individual({ gedcom_xref: '@I2@' });
    const after = tree([a2, b2], [family({ children: [a2.id, b2.id] })]);
    expect(diffTrees(before, after).brickWallsBroken).toHaveLength(0);
  });

  it('does not re-report a wall that was already down', () => {
    const child = individual({ gedcom_xref: '@I1@' });
    const dad = individual({ gedcom_xref: '@I2@' });
    const before = tree([child, dad], [family({ husband_id: dad.id, children: [child.id] })]);
    const child2 = individual({ gedcom_xref: '@I1@' });
    const dad2 = individual({ gedcom_xref: '@I2@' });
    const mum2 = individual({ gedcom_xref: '@I3@' });
    const after = tree(
      [child2, dad2, mum2],
      [family({ husband_id: dad2.id, wife_id: mum2.id, children: [child2.id] })],
    );
    expect(diffTrees(before, after).brickWallsBroken).toHaveLength(0);
  });

  it('notices a name where there was none', () => {
    const before = tree([individual({ gedcom_xref: '@I1@', full_name: 'Unknown' })]);
    const after = tree([individual({ gedcom_xref: '@I1@', full_name: 'Mary O’Hara' })]);
    expect(diffTrees(before, after).namesRecovered.map((p) => p.name)).toEqual(['Mary O’Hara']);
  });

  it('counts people with no xref as untracked rather than guessing at them', () => {
    // Reporting these as added-and-removed would claim a churn that never
    // happened; they are simply unfollowable between files.
    const before = tree([individual({ gedcom_xref: null }), individual({ gedcom_xref: '@I1@' })]);
    const after = tree([individual({ gedcom_xref: null }), individual({ gedcom_xref: '@I1@' })]);
    const pulse = diffTrees(before, after);
    expect(pulse.untracked).toEqual({ before: 1, after: 1 });
    expect(pulse.added).toHaveLength(0);
    expect(pulse.removed).toHaveLength(0);
  });

  it('counts only marriages with both spouses recorded', () => {
    const h = individual({ gedcom_xref: '@I1@' });
    const w = individual({ gedcom_xref: '@I2@' });
    const before = tree([h, w], [family({ husband_id: h.id })]);
    const h2 = individual({ gedcom_xref: '@I1@' });
    const w2 = individual({ gedcom_xref: '@I2@' });
    const after = tree([h2, w2], [family({ husband_id: h2.id, wife_id: w2.id })]);
    const pulse = diffTrees(before, after);
    expect(pulse.marriagesBefore).toBe(0);
    expect(pulse.marriagesAfter).toBe(1);
    expect(pulse.unchanged).toBe(false);
  });
});

describe('pulseSummary', () => {
  const base = tree([individual({ gedcom_xref: '@I1@', full_name: 'Stays' })]);

  it('leads with what the session gained', () => {
    const after = tree([
      individual({ gedcom_xref: '@I1@', full_name: 'Stays', birth_year: 1880 }),
      individual({ gedcom_xref: '@I2@', full_name: 'New One' }),
    ]);
    expect(pulseSummary(diffTrees(base, after))).toBe('1 person added and 1 date filled in.');
  });

  it('still names the losses', () => {
    const after = tree([individual({ gedcom_xref: '@I9@', full_name: 'Different' })]);
    expect(pulseSummary(diffTrees(base, after))).toBe('1 person added and 1 no longer in the tree.');
  });

  it('singularises a lone brick wall', () => {
    const child = individual({ gedcom_xref: '@I1@', full_name: 'Stays' });
    const dad = individual({ gedcom_xref: '@I2@', full_name: 'Dad' });
    const after = tree([child, dad], [family({ husband_id: dad.id, children: [child.id] })]);
    expect(pulseSummary(diffTrees(base, after))).toContain('1 brick wall broken');
  });
});
