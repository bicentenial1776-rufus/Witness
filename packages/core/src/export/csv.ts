/**
 * CSV for the worksheets Witness hands back to the researcher.
 *
 * Witness is read-only and deliberately does not correct anyone's tree, which
 * means every finding it produces has to travel somewhere else to be acted on
 * — Ancestry, RootsMagic, a printed page on a desk. A worksheet is the format
 * that journey actually takes.
 *
 * RFC 4180 to the letter: CRLF line endings, quotes doubled, and any field
 * holding a delimiter, quote or newline wrapped. Excel, Numbers and Sheets all
 * read that without being told a dialect.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Excel, Numbers and Sheets all evaluate a cell that opens with one of these
 * as a formula, so a place name like "-Ville" or a note pasted from elsewhere
 * can execute on open. Neutralising with a leading apostrophe is the standard
 * mitigation: spreadsheets strip it on display, so the reader still sees the
 * original text.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escapeField(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let value = String(raw);
  if (FORMULA_LEAD.test(value)) value = `'${value}`;
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Serialise rows to an RFC 4180 CSV document, header row included. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeField(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(c.value(row))).join(','));
  }
  return lines.join('\r\n');
}

/**
 * A filename that survives every filesystem and both share sheets: no
 * separators, no colons (Files.app rejects them), and the tree's own name
 * carried through so two exports on one desktop stay tellable apart.
 */
export function exportFileName(treeName: string | null | undefined, kind: string, isoDate: string): string {
  const tree = (treeName ?? 'tree')
    .replace(/\.ged$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${tree || 'tree'}-${kind}-${isoDate}.csv`;
}
