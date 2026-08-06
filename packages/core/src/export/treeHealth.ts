import type { HealthFinding } from '../query/treeHealth.js';
import { toCsv, type CsvColumn } from './csv.js';

/**
 * A Tree Health finding flattened for the worksheet, with the two things the
 * screen knows but the finding itself does not: who the accused people are by
 * name, and what the researcher has already decided about it.
 */
export interface TreeHealthCsvRow {
  finding: HealthFinding;
  /** Display title for the check — the screen's wording, not the id. */
  checkTitle: string;
  /** Names of everyone implicated, in the finding's own order. */
  names: string[];
  /** GEDCOM xrefs for the same people, so a row can be found at the source. */
  xrefs: string[];
  status: 'Open' | 'Fixed' | 'Not an error';
}

/**
 * `@I12@` is GEDCOM pointer syntax; `I12` is the identifier, and it is what
 * Ancestry, RootsMagic and Family Tree Maker put on screen. Shedding the
 * delimiters also keeps this column clear of the spreadsheet formula guard,
 * which would otherwise fire on the leading `@` of every row and stud the
 * user's join key with apostrophes.
 */
export function plainXref(xref: string): string {
  return xref.replace(/^@+|@+$/g, '');
}

const COLUMNS: CsvColumn<TreeHealthCsvRow>[] = [
  { header: 'Check', value: (r) => r.checkTitle },
  { header: 'Severity', value: (r) => r.finding.severity },
  { header: 'Status', value: (r) => r.status },
  { header: 'Finding', value: (r) => r.finding.detail },
  { header: 'People', value: (r) => r.names.join('; ') },
  { header: 'GEDCOM ID', value: (r) => r.xrefs.map(plainXref).join('; ') },
];

/**
 * The worksheet a researcher takes to Ancestry: one row per finding, the
 * status they have already assigned, and the GEDCOM xref so the row can be
 * matched back to a person in whatever software actually holds the tree.
 *
 * Sorted the way the screen sorts — biggest categories first, so a printed
 * copy and the app agree on what to work through first.
 */
export function treeHealthCsv(rows: readonly TreeHealthCsvRow[]): string {
  const sizes = new Map<string, number>();
  for (const row of rows) {
    sizes.set(row.checkTitle, (sizes.get(row.checkTitle) ?? 0) + 1);
  }
  const ordered = [...rows].sort((a, b) => {
    const bySize = (sizes.get(b.checkTitle) ?? 0) - (sizes.get(a.checkTitle) ?? 0);
    if (bySize !== 0) return bySize;
    if (a.checkTitle !== b.checkTitle) return a.checkTitle.localeCompare(b.checkTitle);
    return a.finding.detail.localeCompare(b.finding.detail);
  });
  return toCsv(ordered, COLUMNS);
}
