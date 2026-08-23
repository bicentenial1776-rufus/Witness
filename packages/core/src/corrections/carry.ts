import type { CarryableRow } from '../pulse/carryForward.js';
import { correctionSnapshot, type SnapshotPerson } from './snapshot.js';

/** The columns the refresh needs to move a correction and judge its fact. */
export interface CorrectionCarryRow extends CarryableRow {
  subject: string;
  snapshot_key: string | null;
  status: string;
}

/**
 * Among the corrections that are moving, how many annotate a fact the new
 * file has CHANGED — candidates for having been adopted at the source. Only
 * open corrections with a comparable snapshot count; the answer feeds a
 * "may have been adopted; review them" sentence, never an auto-resolve.
 */
export function countChangedFacts(
  moving: readonly { row: CorrectionCarryRow; newIndividualId: string }[],
  newPeople: ReadonlyMap<string, SnapshotPerson>,
): number {
  let changed = 0;
  for (const { row, newIndividualId } of moving) {
    if (row.status !== 'open' || row.snapshot_key === null) continue;
    const person = newPeople.get(newIndividualId);
    if (!person) continue;
    const fresh = correctionSnapshot(row.subject, person);
    if (fresh !== null && fresh !== row.snapshot_key) changed += 1;
  }
  return changed;
}
