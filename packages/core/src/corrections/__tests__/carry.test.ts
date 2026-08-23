import { describe, expect, it } from 'vitest';

import { countChangedFacts, type CorrectionCarryRow } from '../carry.js';
import { correctionSnapshot, type SnapshotPerson } from '../snapshot.js';

const somebody = (over: Partial<SnapshotPerson> = {}): SnapshotPerson => ({
  full_name: 'Betsey Ready',
  birth_year: 1841,
  death_year: 1919,
  ...over,
});

const row = (over: Partial<CorrectionCarryRow> = {}): CorrectionCarryRow => ({
  id: 'c1',
  individual_id: 'old-1',
  subject: 'birth',
  snapshot_key: '1841',
  status: 'open',
  ...over,
});

describe('correctionSnapshot', () => {
  it('canonicalises the name', () => {
    expect(correctionSnapshot('name', somebody({ full_name: '  Betsey   Ready ' }))).toBe(
      'Betsey Ready',
    );
  });

  it('renders vital years, empty when unrecorded', () => {
    expect(correctionSnapshot('birth', somebody())).toBe('1841');
    expect(correctionSnapshot('death', somebody({ death_year: null }))).toBe('');
  });

  it('never compares free-text subjects', () => {
    expect(correctionSnapshot('event:census:1900', somebody())).toBeNull();
    expect(correctionSnapshot('other', somebody())).toBeNull();
  });
});

describe('countChangedFacts', () => {
  const people = new Map<string, SnapshotPerson>([['new-1', somebody()]]);

  it('counts a birth year the file changed', () => {
    const moving = [{ row: row({ snapshot_key: '1843' }), newIndividualId: 'new-1' }];
    expect(countChangedFacts(moving, people)).toBe(1);
  });

  it('counts a changed name', () => {
    const moving = [
      { row: row({ subject: 'name', snapshot_key: 'Betsy Ready' }), newIndividualId: 'new-1' },
    ];
    expect(countChangedFacts(moving, people)).toBe(1);
  });

  it('ignores an unchanged fact', () => {
    const moving = [{ row: row(), newIndividualId: 'new-1' }];
    expect(countChangedFacts(moving, people)).toBe(0);
  });

  it('ignores resolved corrections', () => {
    const moving = [
      { row: row({ snapshot_key: '1843', status: 'resolved' }), newIndividualId: 'new-1' },
    ];
    expect(countChangedFacts(moving, people)).toBe(0);
  });

  it('never guesses at a free-text subject', () => {
    const moving = [
      { row: row({ subject: 'event:census:1900', snapshot_key: null }), newIndividualId: 'new-1' },
    ];
    expect(countChangedFacts(moving, people)).toBe(0);
  });

  it('skips a person missing from the new file map', () => {
    const moving = [{ row: row({ snapshot_key: '1843' }), newIndividualId: 'gone' }];
    expect(countChangedFacts(moving, people)).toBe(0);
  });
});
