import { toCsv, type CsvColumn } from './csv.js';

/**
 * The punch list: every piece of OPEN work in one worksheet — margin
 * corrections, Tree Check findings, orphan records — each row carrying the
 * road back to the source (the person's Ancestry/FamilySearch URL when one
 * can be built). The per-screen worksheets stay as they are; this is the
 * cross-cutting file for the researcher sitting down to actually fix the
 * tree. Only open rows belong here: judgments already live on the ledger.
 */
export interface PunchListCsvRow {
  kind: 'Correction' | 'Tree Check' | 'Orphan';
  /** Grouping label: the correction's fact, the check title, island/solo. */
  category: string;
  person: string;
  /** Already plainXref'd by the caller. */
  xref: string | null;
  problem: string;
  /** What it should say — corrections only. */
  correction: string | null;
  note: string | null;
  ancestryUrl: string | null;
}

const KIND_ORDER: Record<PunchListCsvRow['kind'], number> = {
  Correction: 0,
  'Tree Check': 1,
  Orphan: 2,
};

const COLUMNS: CsvColumn<PunchListCsvRow>[] = [
  { header: 'Kind', value: (r) => r.kind },
  { header: 'Category', value: (r) => r.category },
  { header: 'Person', value: (r) => r.person },
  { header: 'GEDCOM ID', value: (r) => r.xref ?? '' },
  { header: 'Problem', value: (r) => r.problem },
  { header: 'Correction', value: (r) => r.correction ?? '' },
  { header: 'Note', value: (r) => r.note ?? '' },
  { header: 'Link', value: (r) => r.ancestryUrl ?? '' },
];

/**
 * Corrections first — they are the rows the researcher authored and can act
 * on immediately — then Tree Check findings with the biggest categories
 * first (the same order the workbench shows), then orphans. Within a
 * category, by person then problem, so the printed page reads steadily.
 */
export function punchListCsv(rows: readonly PunchListCsvRow[]): string {
  const sizes = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.kind}:${row.category}`;
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  const ordered = [...rows].sort((a, b) => {
    const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (byKind !== 0) return byKind;
    const bySize = (sizes.get(`${b.kind}:${b.category}`) ?? 0) - (sizes.get(`${a.kind}:${a.category}`) ?? 0);
    if (bySize !== 0) return bySize;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.person !== b.person) return a.person.localeCompare(b.person);
    return a.problem.localeCompare(b.problem);
  });
  return toCsv(ordered, COLUMNS);
}
