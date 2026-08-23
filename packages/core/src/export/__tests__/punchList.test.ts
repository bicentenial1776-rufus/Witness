import { describe, expect, it } from 'vitest';

import { punchListCsv, type PunchListCsvRow } from '../punchList.js';

const row = (over: Partial<PunchListCsvRow>): PunchListCsvRow => ({
  kind: 'Tree Check',
  category: 'Lifespans past 110',
  person: 'Renaldo Webber',
  xref: 'I12',
  problem: 'Lived to 140.',
  correction: null,
  note: null,
  ancestryUrl: null,
  ...over,
});

describe('punchListCsv', () => {
  it('emits the full column set', () => {
    const [header] = punchListCsv([row({})]).split('\r\n');
    expect(header).toBe('Kind,Category,Person,GEDCOM ID,Problem,Correction,Note,Link');
  });

  it('orders corrections first, then findings by category size, then orphans', () => {
    const csv = punchListCsv([
      row({ kind: 'Orphan', category: 'Solo', person: 'Stray Record' }),
      row({ category: 'Lifespans past 110', person: 'A' }),
      row({ category: 'Born after dying', person: 'B' }),
      row({ category: 'Born after dying', person: 'C' }),
      row({
        kind: 'Correction',
        category: 'Birth',
        person: 'Betsey Ready',
        problem: 'Record says: 1843',
        correction: '1841',
      }),
    ]);
    const people = csv
      .split('\r\n')
      .slice(1)
      .map((line) => line.split(',')[2]);
    expect(people).toEqual(['Betsey Ready', 'B', 'C', 'A', 'Stray Record']);
  });

  it('carries the link and blanks the empty optionals', () => {
    const csv = punchListCsv([
      row({ ancestryUrl: 'https://www.ancestry.com/family-tree/person/tree/1/person/12/facts' }),
    ]);
    const line = csv.split('\r\n')[1];
    expect(line).toContain('https://www.ancestry.com/family-tree/person/tree/1/person/12/facts');
    expect(line).toContain(',,'); // empty correction/note stay empty, not "null"
  });
});
