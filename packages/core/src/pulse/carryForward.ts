import type { HealthIndividual } from '../query/treeHealth.js';

/**
 * Moving the researcher's own work onto a refreshed tree.
 *
 * Import writes a whole new tree, so every database id is reassigned and
 * everything hanging off the old ids cascades away with it. Some of that is
 * correct — a Tree Health "fixed" mark *should* die, because if the record
 * really was corrected at the source the finding will not reappear, and if it
 * does reappear the mark was premature either way.
 *
 * What must not die is the work the researcher authored: their Research
 * Briefs, and their confirmed-or-dismissed verdicts on National Archives
 * candidates. Those are re-pointed here, matched by GEDCOM xref — the same
 * identity tree_health_rulings already relies on.
 */

export interface IdRemap {
  /** Old individual id → new individual id, for everyone matched by xref. */
  map: Map<string, string>;
  /**
   * Old individual ids with no counterpart in the refreshed file. Rows
   * attached to these cannot move and will be lost — the caller is expected
   * to say so out loud before applying, not to discover it afterwards.
   */
  orphaned: Set<string>;
}

function normalise(xref: string | null): string | null {
  const trimmed = xref?.replace(/^@+|@+$/g, '');
  return trimmed ? trimmed : null;
}

/**
 * Build the old-id → new-id mapping between two imports of the same tree.
 *
 * People with no xref on either side are unmappable by construction and land
 * in `orphaned`; guessing at them by name would silently re-point a brief
 * onto the wrong person, which is worse than losing it loudly.
 */
export function remapIndividuals(
  before: readonly HealthIndividual[],
  after: readonly HealthIndividual[],
): IdRemap {
  const newByXref = new Map<string, string>();
  for (const person of after) {
    const xref = normalise(person.gedcom_xref);
    if (xref) newByXref.set(xref, person.id);
  }

  const map = new Map<string, string>();
  const orphaned = new Set<string>();
  for (const person of before) {
    const xref = normalise(person.gedcom_xref);
    const landed = xref ? newByXref.get(xref) : undefined;
    if (landed) map.set(person.id, landed);
    else orphaned.add(person.id);
  }
  return { map, orphaned };
}

export interface CarryableRow {
  id: string;
  individual_id: string;
}

export interface CarryPlan<T extends CarryableRow> {
  /** Rows that can move, already carrying their new individual id. */
  moving: { row: T; newIndividualId: string }[];
  /** Rows whose person is gone from the refreshed file. */
  stranded: T[];
}

/**
 * Split a set of person-attached rows into what survives the refresh and what
 * does not, so the UI can report the cost before the user commits to it.
 */
export function planCarryForward<T extends CarryableRow>(
  rows: readonly T[],
  remap: IdRemap,
): CarryPlan<T> {
  const moving: { row: T; newIndividualId: string }[] = [];
  const stranded: T[] = [];
  for (const row of rows) {
    const landed = remap.map.get(row.individual_id);
    if (landed) moving.push({ row, newIndividualId: landed });
    else stranded.push(row);
  }
  return { moving, stranded };
}

/**
 * One honest sentence about what a refresh will cost, or null when it costs
 * nothing. Named counts rather than a total, because "2 research briefs" is a
 * thing the reader can weigh and "2 items" is not.
 */
export function carryCostWarning(counts: {
  strandedBriefs: number;
  strandedArchiveVerdicts: number;
  homePersonLost: boolean;
}): string | null {
  const parts: string[] = [];
  if (counts.strandedBriefs > 0) {
    parts.push(
      `${counts.strandedBriefs} research ${counts.strandedBriefs === 1 ? 'brief' : 'briefs'}`,
    );
  }
  if (counts.strandedArchiveVerdicts > 0) {
    parts.push(
      `${counts.strandedArchiveVerdicts} archive ${
        counts.strandedArchiveVerdicts === 1 ? 'verdict' : 'verdicts'
      }`,
    );
  }
  if (counts.homePersonLost) parts.push('your home person');
  if (parts.length === 0) return null;

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${list} ${parts.length === 1 && !counts.homePersonLost ? 'is' : 'are'} attached to people who are not in the new file, and will not carry over.`;
}
