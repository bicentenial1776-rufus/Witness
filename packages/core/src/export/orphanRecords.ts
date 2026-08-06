import { toCsv, type CsvColumn } from './csv.js';
import { plainXref } from './treeHealth.js';

/**
 * A disconnected record flattened for the worksheet. Islands and solos share
 * one table on purpose: to the researcher working the list they are the same
 * job — decide where this person belongs, or delete them — and a single sheet
 * sorts and filters where two would have to be reconciled by hand.
 */
export interface OrphanCsvRow {
  /** 'Island' for a connected group adrift, 'Solo' for a lone record. */
  kind: 'Island' | 'Solo';
  name: string;
  xref: string;
  /** Members of the island this person belongs to; 1 for a solo. */
  groupSize: number;
  /** Where Witness thinks they might attach, if anywhere. */
  suggestedName: string | null;
  suggestedXref: string | null;
  suggestedReasons: string[];
  /** A name and nothing else — likely merge debris rather than a real person. */
  deletionCandidate: boolean;
  status: 'Open' | 'Fixed' | 'Not an error';
}

const COLUMNS: CsvColumn<OrphanCsvRow>[] = [
  { header: 'Type', value: (r) => r.kind },
  { header: 'Status', value: (r) => r.status },
  { header: 'Name', value: (r) => r.name },
  { header: 'GEDCOM ID', value: (r) => plainXref(r.xref) },
  { header: 'Group size', value: (r) => r.groupSize },
  { header: 'Likely merge debris', value: (r) => (r.deletionCandidate ? 'yes' : '') },
  { header: 'Suggested connection', value: (r) => r.suggestedName ?? '' },
  { header: 'Suggested GEDCOM ID', value: (r) => (r.suggestedXref ? plainXref(r.suggestedXref) : '') },
  { header: 'Why', value: (r) => r.suggestedReasons.join('; ') },
];

/**
 * The worksheet for reattaching the people sitting outside the tree.
 *
 * Ordered by how tractable the work is rather than by size: records Witness
 * can suggest a home for come first, because those are the ones a researcher
 * can actually finish, then the larger islands, then the debris.
 */
export function orphanRecordsCsv(rows: readonly OrphanCsvRow[]): string {
  const ordered = [...rows].sort((a, b) => {
    const bySuggestion = Number(Boolean(b.suggestedName)) - Number(Boolean(a.suggestedName));
    if (bySuggestion !== 0) return bySuggestion;
    const byDebris = Number(a.deletionCandidate) - Number(b.deletionCandidate);
    if (byDebris !== 0) return byDebris;
    if (a.groupSize !== b.groupSize) return b.groupSize - a.groupSize;
    return a.name.localeCompare(b.name);
  });
  return toCsv(ordered, COLUMNS);
}
