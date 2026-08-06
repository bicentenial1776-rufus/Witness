import { describe, expect, it } from 'vitest';

import { exportFileName, toCsv } from '../csv.js';
import { treeHealthCsv, type TreeHealthCsvRow } from '../treeHealth.js';
import { orphanRecordsCsv, type OrphanCsvRow } from '../orphanRecords.js';
import type { HealthFinding } from '../../query/treeHealth.js';

describe('toCsv', () => {
  const cols = [
    { header: 'Name', value: (r: { name: string; note?: string }) => r.name },
    { header: 'Note', value: (r: { name: string; note?: string }) => r.note },
  ];

  it('writes a header row and CRLF line endings', () => {
    expect(toCsv([{ name: 'Ada' }], cols)).toBe('Name,Note\r\nAda,');
  });

  it('quotes fields holding a comma, quote or newline', () => {
    const csv = toCsv([{ name: 'Howe, Shirley', note: 'She said "no"' }], cols);
    expect(csv).toBe('Name,Note\r\n"Howe, Shirley","She said ""no"""');
  });

  it('keeps a newline inside one quoted field rather than splitting the row', () => {
    const csv = toCsv([{ name: 'Ada', note: 'line one\nline two' }], cols);
    expect(csv.split('\r\n')).toHaveLength(2);
  });

  it('neutralises fields a spreadsheet would evaluate as a formula', () => {
    // Leading =, +, - and @ all execute on open in Excel and Sheets.
    for (const hostile of ['=1+1', '+1', '-Ville', '@SUM(A1)']) {
      const csv = toCsv([{ name: hostile }], cols);
      expect(csv).toContain(`'${hostile}`);
    }
  });

  it('leaves an ordinary leading character alone', () => {
    expect(toCsv([{ name: 'Ada' }], cols)).not.toContain("'Ada");
  });

  it('renders null and undefined as empty, not as the words', () => {
    const nullish = [{ header: 'V', value: () => null }];
    expect(toCsv([{}], nullish)).toBe('V\r\n');
  });
});

describe('exportFileName', () => {
  it('strips the .ged suffix and punctuation a filesystem would reject', () => {
    expect(exportFileName('Howe Family: v2.ged', 'tree-health', '2026-08-05')).toBe(
      'Howe-Family-v2-tree-health-2026-08-05.csv',
    );
  });

  it('falls back when the tree has no usable name', () => {
    expect(exportFileName('***', 'gaps', '2026-08-05')).toBe('tree-gaps-2026-08-05.csv');
    expect(exportFileName(null, 'gaps', '2026-08-05')).toBe('tree-gaps-2026-08-05.csv');
  });

  it('keeps non-Latin tree names rather than emptying them', () => {
    expect(exportFileName('Лемманн', 'tree-health', '2026-08-05')).toBe(
      'Лемманн-tree-health-2026-08-05.csv',
    );
  });
});

describe('treeHealthCsv', () => {
  const finding = (check: HealthFinding['check'], detail: string): HealthFinding => ({
    check,
    severity: 'fail',
    individualIds: ['a'],
    detail,
  });

  const row = (checkTitle: string, detail: string): TreeHealthCsvRow => ({
    finding: finding('birth_after_death', detail),
    checkTitle,
    names: ['Ada Howe'],
    xrefs: ['@I12@'],
    status: 'Open',
  });

  it('orders the biggest category first, matching the screen', () => {
    const csv = treeHealthCsv([
      row('Rare check', 'only one'),
      row('Common check', 'b'),
      row('Common check', 'a'),
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Check,Severity,Status,Finding,People,GEDCOM ID');
    expect(lines[1]).toContain('Common check');
    expect(lines[2]).toContain('Common check');
    expect(lines[3]).toContain('Rare check');
  });

  it('joins multiple accused people into one cell each', () => {
    const multi: TreeHealthCsvRow = {
      ...row('Couples sharing a surname', 'Shirley married Shirley'),
      names: ['Shirley Scott Howe', 'Shirley Howe'],
      xrefs: ['@I1@', '@I2@'],
    };
    const csv = treeHealthCsv([multi]);
    // Semicolon-joined, so the cell needs no quoting under RFC 4180.
    expect(csv).toContain('Shirley Scott Howe; Shirley Howe');
    expect(csv).toContain('I1; I2');
  });

  it('sheds GEDCOM pointer delimiters so the join key is not apostrophised', () => {
    // A leading @ trips the formula guard; @I12@ would otherwise export as
    // '@I12@ on every single row.
    const csv = treeHealthCsv([row('Born after dying', 'x')]);
    expect(csv).toContain('I12');
    expect(csv).not.toContain('@');
    expect(csv).not.toContain("'I12");
  });
});

describe('orphanRecordsCsv', () => {
  const orphan = (over: Partial<OrphanCsvRow>): OrphanCsvRow => ({
    kind: 'Solo',
    name: 'Unknown',
    xref: '@I1@',
    groupSize: 1,
    suggestedName: null,
    suggestedXref: null,
    suggestedReasons: [],
    deletionCandidate: false,
    status: 'Open',
    ...over,
  });

  /** Third column is Name — see COLUMNS in orphanRecords.ts. */
  function names(csv: string): string[] {
    return csv
      .split('\r\n')
      .slice(1)
      .map((line) => line.split(',')[2] ?? '');
  }

  it('puts records with a suggested connection first — the tractable work', () => {
    const csv = orphanRecordsCsv([
      orphan({ name: 'No lead', groupSize: 40 }),
      orphan({ name: 'Has lead', suggestedName: 'Ada Howe', suggestedXref: '@I9@' }),
    ]);
    expect(names(csv)).toEqual(['Has lead', 'No lead']);
  });

  it('sinks likely merge debris below real unconnected people', () => {
    const csv = orphanRecordsCsv([
      orphan({ name: 'Debris', deletionCandidate: true }),
      orphan({ name: 'Real person' }),
    ]);
    expect(names(csv)).toEqual(['Real person', 'Debris']);
  });

  it('ranks larger islands above smaller ones once leads and debris tie', () => {
    const csv = orphanRecordsCsv([
      orphan({ name: 'Small', kind: 'Island', groupSize: 2 }),
      orphan({ name: 'Large', kind: 'Island', groupSize: 12 }),
    ]);
    expect(names(csv)).toEqual(['Large', 'Small']);
  });

  it('sheds pointer delimiters on both the record and its suggestion', () => {
    const csv = orphanRecordsCsv([
      orphan({ suggestedName: 'Ada', suggestedXref: '@I9@', xref: '@I1@' }),
    ]);
    expect(csv).not.toContain('@');
    expect(csv).toContain('I1');
    expect(csv).toContain('I9');
  });
});
