import { describe, expect, it } from 'vitest';

import { carryCostWarning, planCarryForward, remapIndividuals } from '../carryForward.js';
import type { HealthIndividual } from '../../query/treeHealth.js';

function person(id: string, gedcom_xref: string | null): HealthIndividual {
  return {
    id,
    gedcom_xref,
    full_name: `Person ${id}`,
    surname: null,
    sex: 'U',
    birth_year: null,
    death_year: null,
    living: false,
  };
}

describe('remapIndividuals', () => {
  it('maps old ids onto new ones through the xref', () => {
    const remap = remapIndividuals(
      [person('old-1', '@I1@'), person('old-2', '@I2@')],
      [person('new-1', '@I1@'), person('new-2', '@I2@')],
    );
    expect(remap.map.get('old-1')).toBe('new-1');
    expect(remap.map.get('old-2')).toBe('new-2');
    expect(remap.orphaned.size).toBe(0);
  });

  it('matches regardless of pointer delimiters on either side', () => {
    const remap = remapIndividuals([person('old-1', 'I1')], [person('new-1', '@I1@')]);
    expect(remap.map.get('old-1')).toBe('new-1');
  });

  it('strands a person who is gone from the new file', () => {
    const remap = remapIndividuals([person('old-9', '@I9@')], [person('new-1', '@I1@')]);
    expect(remap.map.size).toBe(0);
    expect(remap.orphaned.has('old-9')).toBe(true);
  });

  it('strands rather than guesses when an xref is missing', () => {
    // Name-matching here would silently re-point a brief onto whoever
    // happened to share a name — losing it loudly is the safer failure.
    const remap = remapIndividuals([person('old-1', null)], [person('new-1', null)]);
    expect(remap.map.size).toBe(0);
    expect(remap.orphaned.has('old-1')).toBe(true);
  });

  it('treats an empty xref string as no xref at all', () => {
    const remap = remapIndividuals([person('old-1', '@@')], [person('new-1', '@@')]);
    expect(remap.orphaned.has('old-1')).toBe(true);
  });
});

describe('planCarryForward', () => {
  const remap = remapIndividuals(
    [person('old-1', '@I1@'), person('old-2', '@I2@')],
    [person('new-1', '@I1@')],
  );

  it('separates rows that can move from rows whose person is gone', () => {
    const plan = planCarryForward(
      [
        { id: 'brief-a', individual_id: 'old-1' },
        { id: 'brief-b', individual_id: 'old-2' },
      ],
      remap,
    );
    expect(plan.moving).toEqual([
      { row: { id: 'brief-a', individual_id: 'old-1' }, newIndividualId: 'new-1' },
    ]);
    expect(plan.stranded.map((r) => r.id)).toEqual(['brief-b']);
  });

  it('carries extra columns through untouched', () => {
    const plan = planCarryForward([{ id: 'x', individual_id: 'old-1', title: 'Keep me' }], remap);
    expect(plan.moving[0]?.row.title).toBe('Keep me');
  });
});

describe('carryCostWarning', () => {
  it('is silent when nothing is lost', () => {
    expect(
      carryCostWarning({ strandedBriefs: 0, strandedArchiveVerdicts: 0, homePersonLost: false }),
    ).toBeNull();
  });

  it('names each kind rather than totalling them', () => {
    const warning = carryCostWarning({
      strandedBriefs: 2,
      strandedArchiveVerdicts: 3,
      homePersonLost: false,
    });
    expect(warning).toContain('2 research briefs');
    expect(warning).toContain('3 archive verdicts');
    expect(warning).not.toContain('5');
  });

  it('singularises a lone brief', () => {
    const warning = carryCostWarning({
      strandedBriefs: 1,
      strandedArchiveVerdicts: 0,
      homePersonLost: false,
    });
    expect(warning).toContain('1 research brief is attached');
  });

  it('mentions the home person in the same breath', () => {
    const warning = carryCostWarning({
      strandedBriefs: 1,
      strandedArchiveVerdicts: 0,
      homePersonLost: true,
    });
    expect(warning).toContain('1 research brief and your home person are attached');
  });
});
