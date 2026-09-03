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
  /** Old individual id → new individual id, for everyone matched. */
  map: Map<string, string>;
  /**
   * Old individual ids with no counterpart in the refreshed file. Rows
   * attached to these cannot move and will be lost — the caller is expected
   * to say so out loud before applying, not to discover it afterwards.
   */
  orphaned: Set<string>;
  /** How each match landed — the Pulse reports recoveries by name out loud. */
  tiers: { uid: number; xref: number; conservative: number };
}

function normalise(xref: string | null): string | null {
  const trimmed = xref?.replace(/^@+|@+$/g, '');
  return trimmed ? trimmed : null;
}

/** _UID values arrive with or without braces/case noise across exports. */
function normaliseUid(uid: string | null): string | null {
  const trimmed = uid?.replace(/[{}]/g, '').trim().toUpperCase();
  return trimmed ? trimmed : null;
}

/** Name + birth-year fingerprint for the conservative tier. */
function conservativeKey(person: HealthIndividual): string | null {
  if (person.birth_year === null) return null;
  const slug = person.full_name.trim().toLowerCase().replace(/\s+/g, ' ');
  return slug ? `${slug}|${person.birth_year}` : null;
}

/** Values appearing exactly once — anything ambiguous is no key at all. */
function uniqueIndex(
  people: readonly HealthIndividual[],
  keyOf: (p: HealthIndividual) => string | null,
): Map<string, HealthIndividual> {
  const counts = new Map<string, number>();
  for (const person of people) {
    const key = keyOf(person);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const index = new Map<string, HealthIndividual>();
  for (const person of people) {
    const key = keyOf(person);
    if (key && counts.get(key) === 1) index.set(key, person);
  }
  return index;
}

/**
 * Build the old-id → new-id mapping between two imports of the same tree —
 * the identity spine of the round-trip arc (Katie review, 2026-08-15).
 *
 * Three tiers, most trustworthy first:
 * 1. Vendor _UID — survives renumbering, so a tree reworked in Ancestry or
 *    RootsMagic still matches even when every xref changed.
 * 2. GEDCOM xref — the same file re-exported keeps its @I12@ pointers.
 * 3. Conservative name + birth year — only when that pair is UNIQUE on both
 *    sides; an ambiguous fingerprint matches nobody. This recovers people
 *    whose export dropped both ids without ever guessing between two Johns.
 *
 * Whoever no tier can place lands in `orphaned` — lost loudly, never
 * silently re-pointed.
 */
export function remapIndividuals(
  before: readonly HealthIndividual[],
  after: readonly HealthIndividual[],
): IdRemap {
  const newByUid = uniqueIndex(after, (p) => normaliseUid(p.ancestry_uid));
  const newByXref = uniqueIndex(after, (p) => normalise(p.gedcom_xref));
  const newByConservative = uniqueIndex(after, conservativeKey);
  const oldByUid = uniqueIndex(before, (p) => normaliseUid(p.ancestry_uid));
  const oldByConservative = uniqueIndex(before, conservativeKey);

  const map = new Map<string, string>();
  const orphaned = new Set<string>();
  const claimed = new Set<string>();
  const tiers = { uid: 0, xref: 0, conservative: 0 };

  for (const person of before) {
    const uid = normaliseUid(person.ancestry_uid);
    const uidLanding =
      uid && oldByUid.get(uid) === person ? newByUid.get(uid) : undefined;
    if (uidLanding && !claimed.has(uidLanding.id)) {
      map.set(person.id, uidLanding.id);
      claimed.add(uidLanding.id);
      tiers.uid += 1;
      continue;
    }

    const xref = normalise(person.gedcom_xref);
    const xrefLanding = xref ? newByXref.get(xref) : undefined;
    if (xrefLanding && !claimed.has(xrefLanding.id)) {
      map.set(person.id, xrefLanding.id);
      claimed.add(xrefLanding.id);
      tiers.xref += 1;
      continue;
    }

    const key = conservativeKey(person);
    const conservativeLanding =
      key && oldByConservative.get(key) === person ? newByConservative.get(key) : undefined;
    if (conservativeLanding && !claimed.has(conservativeLanding.id)) {
      map.set(person.id, conservativeLanding.id);
      claimed.add(conservativeLanding.id);
      tiers.conservative += 1;
      continue;
    }

    orphaned.add(person.id);
  }
  return { map, orphaned, tiers };
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
export interface MarkRow {
  id: string;
  finding_key: string;
}

export interface MarksCarryPlan {
  /** Marks whose finding persists in the new tree — they move, key rewritten. */
  carrying: { row: MarkRow; newKey: string }[];
  /** Marks whose finding is GONE from the new file: the fix is confirmed. */
  graduated: number;
  /** Marks accusing people no tier could follow across — lost loudly. */
  stranded: number;
}

const ORPHAN_PREFIX = 'orphan:';

/**
 * Marks graduate instead of dying (Katie review: "you marked 17, this file
 * fixes 12"). A mark's finding_key is check:sorted-db-ids; the ids remap,
 * and the rewritten key is looked up in the NEW tree's freshly-computed
 * findings. Present → the problem persists, the mark carries. Absent → the
 * file really fixed it, and that's a graduation worth announcing, not a
 * row worth deleting silently.
 *
 * The same table also holds Orphan Records marks under an `orphan:<id>` key,
 * which can never appear among tree-health finding keys — before 2026-08-23
 * every carried orphan mark was therefore miscounted as graduated and
 * dropped. Orphan keys now graduate against `newOrphanKeys` (`orphan:<id>`
 * for everyone still disconnected in the new tree); when the caller cannot
 * say who that is, they carry — a stale mark is recoverable, a dropped one
 * is not. One island quirk: the mark keys on the anchor, and if a surviving
 * island re-anchors, the carried mark shows as open again on the workbench
 * rather than as fixed. Recoverable, unlike the silent drop it replaces.
 */
export function planMarksCarry(
  marks: readonly MarkRow[],
  remap: IdRemap,
  newFindingKeys: ReadonlySet<string>,
  newOrphanKeys?: ReadonlySet<string>,
): MarksCarryPlan {
  const carrying: { row: MarkRow; newKey: string }[] = [];
  let graduated = 0;
  let stranded = 0;
  for (const row of marks) {
    if (row.finding_key.startsWith(ORPHAN_PREFIX)) {
      const landed = remap.map.get(row.finding_key.slice(ORPHAN_PREFIX.length));
      if (!landed) {
        stranded += 1;
      } else if (newOrphanKeys && !newOrphanKeys.has(`${ORPHAN_PREFIX}${landed}`)) {
        graduated += 1;
      } else {
        carrying.push({ row, newKey: `${ORPHAN_PREFIX}${landed}` });
      }
      continue;
    }
    const colon = row.finding_key.indexOf(':');
    if (colon < 0) {
      stranded += 1;
      continue;
    }
    const check = row.finding_key.slice(0, colon);
    const oldIds = row.finding_key.slice(colon + 1).split(',').filter(Boolean);
    const newIds = oldIds.map((id) => remap.map.get(id));
    if (oldIds.length === 0 || newIds.some((id) => !id)) {
      stranded += 1;
      continue;
    }
    const newKey = `${check}:${(newIds as string[]).sort().join(',')}`;
    if (newFindingKeys.has(newKey)) carrying.push({ row, newKey });
    else graduated += 1;
  }
  return { carrying, graduated, stranded };
}

export function carryCostWarning(counts: {
  strandedBriefs: number;
  strandedArchiveVerdicts: number;
  strandedCrossingVerdicts?: number;
  strandedRecordLinks?: number;
  strandedBackIssues?: number;
  strandedMarks?: number;
  strandedShareLinks?: number;
  strandedCorrections?: number;
  strandedNotes?: number;
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
  if ((counts.strandedCrossingVerdicts ?? 0) > 0) {
    parts.push(
      `${counts.strandedCrossingVerdicts} crossing ${
        counts.strandedCrossingVerdicts === 1 ? 'verdict' : 'verdicts'
      }`,
    );
  }
  if ((counts.strandedRecordLinks ?? 0) > 0) {
    parts.push(
      `${counts.strandedRecordLinks} record ${
        counts.strandedRecordLinks === 1 ? 'link' : 'links'
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
  if ((counts.strandedMarks ?? 0) > 0) {
    parts.push(
      `${counts.strandedMarks} fixed ${counts.strandedMarks === 1 ? 'mark' : 'marks'}`,
    );
  }
  if ((counts.strandedShareLinks ?? 0) > 0) {
    parts.push(
      `${counts.strandedShareLinks} shared ${counts.strandedShareLinks === 1 ? 'link' : 'links'}`,
    );
  }
  if ((counts.strandedCorrections ?? 0) > 0) {
    parts.push(
      `${counts.strandedCorrections} margin ${
        counts.strandedCorrections === 1 ? 'correction' : 'corrections'
      }`,
    );
  }
  if ((counts.strandedNotes ?? 0) > 0) {
    parts.push(
      `${counts.strandedNotes} ancestor ${counts.strandedNotes === 1 ? 'note' : 'notes'}`,
    );
  }
  if (counts.homePersonLost) parts.push('your home person');
  if (parts.length === 0) return null;

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  // The verb agrees with the whole subject: singular only when the list is
  // one part naming one thing ("1 research brief is…", "your home person
  // is…"); "3 ancestor notes are…" like any plural.
  const singular = parts.length === 1 && !/^([2-9]|\d\d)/.test(parts[0]!);
  return `${list} ${singular ? 'is' : 'are'} attached to people who are not in the new file, and will not carry over.`;
}
