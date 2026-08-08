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

export interface FindingRow {
  finding_id: string;
  source: string;
  subject_ids: string[];
  sentence: string;
  edition_key: string | null;
  section: string | null;
  first_seen_at: string;
}

export interface FindingsCarryPlan {
  /** Rows that can move, with their ids and subjects rewritten to the new tree. */
  moving: { row: FindingRow; newFindingId: string; newSubjectIds: string[] }[];
  /** Rows that cannot: someone their identity depends on is not in the new file. */
  stranded: FindingRow[];
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Plan the findings ledger's crossing (the back issues among them carry the
 * edition history — docs/cohesion-design-brief.md, gap G3).
 *
 * Unlike briefs, a finding's IDENTITY can embed the people it names, and the
 * embedding differs by source, so the rewrite must too:
 *
 * - `tree-health:CHECK:id,id`  — every id is a person; all must map, and the
 *   remapped set is re-sorted so the id stays canonical with findingKey().
 * - `crossing:id:year`         — the id is the crosser; it must map.
 * - `archives:id`              — the id is the CANDIDATE row, which the
 *   refresh moves keeping its id. Not a person; never remapped.
 * - `migration:From>To`        — place names, no ids.
 *
 * Subjects are remapped individually; a row whose remaining subjects all
 * vanished is stranded — a story with nobody left in it. Guessing at an
 * unmapped person would re-point history onto the wrong human, which is
 * worse than losing it loudly (same rule as remapIndividuals).
 */
export function planFindingsCarry(
  rows: readonly FindingRow[],
  remap: IdRemap,
): FindingsCarryPlan {
  const moving: FindingsCarryPlan['moving'] = [];
  const stranded: FindingRow[] = [];

  for (const row of rows) {
    const newSubjectIds = row.subject_ids
      .map((id) => remap.map.get(id))
      .filter((id): id is string => Boolean(id));

    let newFindingId: string | null = row.finding_id;
    if (row.source === 'tree-health') {
      const [prefix, check, idList] = row.finding_id.split(':');
      const mapped = (idList ?? '').split(',').map((id) => remap.map.get(id));
      newFindingId = mapped.every(Boolean)
        ? `${prefix}:${check}:${(mapped as string[]).sort().join(',')}`
        : null;
    } else if (row.source === 'crossing') {
      const match = UUID.exec(row.finding_id);
      const landed = match ? remap.map.get(match[0]) : undefined;
      newFindingId = landed ? row.finding_id.replace(match![0], landed) : null;
    }

    if (newFindingId && newSubjectIds.length > 0) {
      moving.push({ row, newFindingId, newSubjectIds });
    } else {
      stranded.push(row);
    }
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
  strandedBackIssues?: number;
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
  if ((counts.strandedBackIssues ?? 0) > 0) {
    parts.push(
      `${counts.strandedBackIssues} back-issue ${
        counts.strandedBackIssues === 1 ? 'piece' : 'pieces'
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
