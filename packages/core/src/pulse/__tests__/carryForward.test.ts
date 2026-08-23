import { describe, expect, it } from 'vitest';

import {
  carryCostWarning,
  planCarryForward,
  planFindingsCarry,
  remapIndividuals,
  type FindingRow,
} from '../carryForward.js';
import * as carryModule from '../carryForward.js';
import type { HealthIndividual } from '../../query/treeHealth.js';

function person(
  id: string,
  gedcom_xref: string | null,
  extra: Partial<HealthIndividual> = {},
): HealthIndividual {
  return {
    id,
    gedcom_xref,
    ancestry_uid: null,
    full_name: `Person ${id}`,
    surname: null,
    sex: 'U',
    birth_year: null,
    death_year: null,
    living: false,
    ...extra,
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

describe('planFindingsCarry', () => {
  // Real-shaped uuids, because the crossing rewrite finds them by pattern.
  const OLD_A = '0a1b2c3d-0000-4000-8000-00000000000a';
  const OLD_B = '0a1b2c3d-0000-4000-8000-00000000000b';
  const NEW_A = 'f9e8d7c6-0000-4000-8000-00000000000a';
  const NEW_B = 'f9e8d7c6-0000-4000-8000-00000000000b';
  const GONE = '0a1b2c3d-0000-4000-8000-00000000dead';

  const remap = remapIndividuals(
    [person(OLD_A, '@I1@'), person(OLD_B, '@I2@'), person(GONE, '@I9@')],
    [person(NEW_A, '@I1@'), person(NEW_B, '@I2@')],
  );

  const finding = (over: Partial<FindingRow>): FindingRow => ({
    finding_id: 'migration:Massachusetts>Nova Scotia',
    source: 'migration',
    subject_ids: [OLD_A],
    sentence: 'sentence',
    edition_key: '2026-W32',
    section: 'pattern',
    first_seen_at: '2026-08-08T00:00:00Z',
    ...over,
  });

  it('rewrites a tree-health id and re-sorts it canonical', () => {
    const plan = planFindingsCarry(
      [
        finding({
          source: 'tree-health',
          // OLD_B < OLD_A would be false here, but NEW ids may sort differently
          // than the old ones did — the rewrite must re-sort, not substitute.
          finding_id: `tree-health:birth_after_death:${[OLD_A, OLD_B].sort().join(',')}`,
          subject_ids: [OLD_A, OLD_B],
        }),
      ],
      remap,
    );
    expect(plan.stranded).toHaveLength(0);
    expect(plan.moving[0]!.newFindingId).toBe(
      `tree-health:birth_after_death:${[NEW_A, NEW_B].sort().join(',')}`,
    );
    expect(plan.moving[0]!.newSubjectIds).toEqual([NEW_A, NEW_B]);
  });

  it('strands a tree-health finding naming someone gone from the file', () => {
    const plan = planFindingsCarry(
      [
        finding({
          source: 'tree-health',
          finding_id: `tree-health:birth_after_death:${[OLD_A, GONE].sort().join(',')}`,
          subject_ids: [OLD_A, GONE],
        }),
      ],
      remap,
    );
    expect(plan.moving).toHaveLength(0);
    expect(plan.stranded).toHaveLength(1);
  });

  it('rewrites the crosser inside a crossing id', () => {
    const plan = planFindingsCarry(
      [finding({ source: 'crossing', finding_id: `crossing:${OLD_A}:1845`, subject_ids: [OLD_A] })],
      remap,
    );
    expect(plan.moving[0]!.newFindingId).toBe(`crossing:${NEW_A}:1845`);
  });

  it('never remaps an archives id — it names the candidate row, not a person', () => {
    const candidateRowId = '11111111-2222-4333-8444-555555555555';
    const plan = planFindingsCarry(
      [finding({ source: 'archives', finding_id: `archives:${candidateRowId}`, subject_ids: [OLD_A] })],
      remap,
    );
    expect(plan.moving[0]!.newFindingId).toBe(`archives:${candidateRowId}`);
    expect(plan.moving[0]!.newSubjectIds).toEqual([NEW_A]);
  });

  it('carries a migration with the survivors, strands it when nobody is left', () => {
    const survivors = planFindingsCarry([finding({ subject_ids: [OLD_A, GONE] })], remap);
    expect(survivors.moving[0]!.newSubjectIds).toEqual([NEW_A]);

    const empty = planFindingsCarry([finding({ subject_ids: [GONE] })], remap);
    expect(empty.moving).toHaveLength(0);
    expect(empty.stranded).toHaveLength(1);
  });
});

describe('carryCostWarning with margin corrections', () => {
  it('names stranded corrections alongside the rest', () => {
    expect(
      carryCostWarning({
        strandedBriefs: 1,
        strandedArchiveVerdicts: 0,
        strandedCorrections: 2,
        homePersonLost: false,
      }),
    ).toBe(
      '1 research brief and 2 margin corrections are attached to people who are not in the new file, and will not carry over.',
    );
  });

  it('singularises a lone correction', () => {
    expect(
      carryCostWarning({
        strandedBriefs: 0,
        strandedArchiveVerdicts: 0,
        strandedCorrections: 1,
        homePersonLost: false,
      }),
    ).toContain('1 margin correction is attached');
  });
});

describe('carryCostWarning with back issues', () => {
  it('names the back-issue pieces alongside the rest', () => {
    expect(
      carryCostWarning({
        strandedBriefs: 0,
        strandedArchiveVerdicts: 1,
        strandedBackIssues: 2,
        homePersonLost: false,
      }),
    ).toBe(
      '1 archive verdict and 2 back-issue pieces are attached to people who are not in the new file, and will not carry over.',
    );
  });

  it('still costs nothing when nothing strands', () => {
    expect(
      carryCostWarning({
        strandedBriefs: 0,
        strandedArchiveVerdicts: 0,
        strandedBackIssues: 0,
        homePersonLost: false,
      }),
    ).toBeNull();
  });
});

describe('tiered matching (round-trip arc, 2026-08-18)', () => {
  it('matches by _UID when every xref changed', () => {
    const remap = remapIndividuals(
      [person('old-1', '@I1@', { ancestry_uid: 'ABC123' })],
      [person('new-9', '@I999@', { ancestry_uid: '{abc123}' })],
    );
    expect(remap.map.get('old-1')).toBe('new-9');
    expect(remap.tiers.uid).toBe(1);
  });

  it('recovers a unique name+birth-year pair when both ids are gone', () => {
    const remap = remapIndividuals(
      [person('old-1', null, { full_name: 'Renaldo Webber', birth_year: 1762 })],
      [person('new-1', null, { full_name: 'Renaldo  Webber', birth_year: 1762 })],
    );
    expect(remap.map.get('old-1')).toBe('new-1');
    expect(remap.tiers.conservative).toBe(1);
  });

  it('never guesses between two people with the same name and year', () => {
    const remap = remapIndividuals(
      [person('old-1', null, { full_name: 'John Smith', birth_year: 1850 })],
      [
        person('new-1', null, { full_name: 'John Smith', birth_year: 1850 }),
        person('new-2', null, { full_name: 'John Smith', birth_year: 1850 }),
      ],
    );
    expect(remap.map.size).toBe(0);
    expect(remap.orphaned.has('old-1')).toBe(true);
  });

  it('uid outranks a conflicting xref', () => {
    // Renumbered export: old @I1@ is now a different person; the uid says so.
    const remap = remapIndividuals(
      [person('old-1', '@I1@', { ancestry_uid: 'U1' }), person('old-2', '@I2@', { ancestry_uid: 'U2' })],
      [person('new-a', '@I2@', { ancestry_uid: 'U1' }), person('new-b', '@I1@', { ancestry_uid: 'U2' })],
    );
    expect(remap.map.get('old-1')).toBe('new-a');
    expect(remap.map.get('old-2')).toBe('new-b');
    expect(remap.tiers.uid).toBe(2);
  });
});

describe('planMarksCarry', () => {
  const { planMarksCarry } = carryModule;

  it('graduates marks whose finding vanished, carries the rest', () => {
    const remap = remapIndividuals(
      [person('old-1', '@I1@'), person('old-2', '@I2@')],
      [person('new-1', '@I1@'), person('new-2', '@I2@')],
    );
    const plan = planMarksCarry(
      [
        { id: 'm1', finding_key: 'mother_too_old:old-1' },
        { id: 'm2', finding_key: 'impossible_gap:old-1,old-2' },
      ],
      remap,
      new Set(['impossible_gap:new-1,new-2']),
    );
    expect(plan.graduated).toBe(1);
    expect(plan.carrying).toEqual([
      { row: { id: 'm2', finding_key: 'impossible_gap:old-1,old-2' }, newKey: 'impossible_gap:new-1,new-2' },
    ]);
    expect(plan.stranded).toBe(0);
  });

  it('strands marks accusing people who did not carry across', () => {
    const remap = remapIndividuals([person('old-1', '@I1@')], []);
    const plan = planMarksCarry([{ id: 'm1', finding_key: 'check:old-1' }], remap, new Set());
    expect(plan.stranded).toBe(1);
    expect(plan.graduated).toBe(0);
  });
});

describe('planMarksCarry — orphan namespace', () => {
  const { planMarksCarry } = carryModule;
  const remap = remapIndividuals(
    [person('old-1', '@I1@'), person('old-2', '@I2@')],
    [person('new-1', '@I1@'), person('new-2', '@I2@')],
  );

  it('carries an orphan mark whose person is still disconnected', () => {
    // Regression: orphan keys can never appear among tree-health finding
    // keys, so before the fix every one of these was miscounted as
    // graduated and silently dropped.
    const plan = planMarksCarry(
      [{ id: 'm1', finding_key: 'orphan:old-1' }],
      remap,
      new Set<string>(),
      new Set(['orphan:new-1']),
    );
    expect(plan.graduated).toBe(0);
    expect(plan.carrying).toEqual([
      { row: { id: 'm1', finding_key: 'orphan:old-1' }, newKey: 'orphan:new-1' },
    ]);
  });

  it('graduates an orphan mark whose person the file reconnected', () => {
    const plan = planMarksCarry(
      [{ id: 'm1', finding_key: 'orphan:old-1' }],
      remap,
      new Set<string>(),
      new Set<string>(),
    );
    expect(plan.graduated).toBe(1);
    expect(plan.carrying).toHaveLength(0);
  });

  it('always carries orphan marks when the caller cannot say who is orphaned', () => {
    const plan = planMarksCarry([{ id: 'm1', finding_key: 'orphan:old-1' }], remap, new Set<string>());
    expect(plan.graduated).toBe(0);
    expect(plan.carrying[0]?.newKey).toBe('orphan:new-1');
  });

  it('strands an orphan mark whose person is gone from the file', () => {
    const goneRemap = remapIndividuals([person('old-9', '@I9@')], []);
    const plan = planMarksCarry(
      [{ id: 'm1', finding_key: 'orphan:old-9' }],
      goneRemap,
      new Set<string>(),
      new Set<string>(),
    );
    expect(plan.stranded).toBe(1);
    expect(plan.graduated).toBe(0);
  });

  it('keeps the tree-health path untouched in a mixed batch', () => {
    const plan = planMarksCarry(
      [
        { id: 'm1', finding_key: 'orphan:old-1' },
        { id: 'm2', finding_key: 'impossible_gap:old-1,old-2' },
      ],
      remap,
      new Set(['impossible_gap:new-1,new-2']),
      new Set(['orphan:new-1']),
    );
    expect(plan.carrying.map((c) => c.newKey).sort()).toEqual([
      'impossible_gap:new-1,new-2',
      'orphan:new-1',
    ]);
    expect(plan.graduated).toBe(0);
    expect(plan.stranded).toBe(0);
  });
});
