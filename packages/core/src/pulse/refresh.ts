import {
  countChangedFacts,
  type CorrectionCarryRow,
  type SnapshotPerson,
} from '../corrections/index.js';
import { findOrphanRecords } from '../query/orphanRecords.js';
import { fetchTreeHealthData, findingKey, runTreeHealth, type TreeHealthData } from '../query/treeHealth.js';
import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { Json } from '../supabase/database.types.js';
import { photosNote, type MediaCarryPlan } from './mediaCarry.js';
import {
  applyMediaCarry,
  fetchMediaCarryables,
  moveCarriedObjects,
  planMediaRefresh,
  type MoveProgress,
} from './mediaRefresh.js';
import {
  carryCostWarning,
  diffTrees,
  planCarryForward,
  planFindingsCarry,
  planMarksCarry,
  pulseSummary,
  remapIndividuals,
  type FindingRow,
  type IdRemap,
  type MarkRow,
  type TreePulse,
} from './index.js';

/**
 * GEDCOM Refresh, import-then-swap.
 *
 * The new file is imported by the ordinary path first, as its own tree —
 * nothing here mutates a working tree in place. Only once the new tree exists
 * and is whole does the user's own work move across and the old tree go. The
 * failure mode is therefore a leftover tree the user can delete, never a
 * half-rewritten one they cannot.
 *
 * What moves, and what deliberately does not:
 *
 * - Research Briefs and National Archives verdicts move. They are the
 *   researcher's own work and nothing in the new file recreates them.
 * - Tree Health "fixed" marks GRADUATE (2026-08-18, Katie's round-trip arc):
 *   each mark is re-checked against the new tree's live findings. Finding
 *   gone → the file really fixed it, counted and announced. Finding still
 *   present → the mark carries under its rewritten key. A stale mark can
 *   never hide a live problem, and a real fix is never deleted silently.
 * - Shared links move: the tokens readers hold survive the refresh instead
 *   of dying with the old tree's cascade.
 * - Margin corrections move like briefs — resolved ones too, as the record
 *   of work already entered at the source. Open ones whose underlying fact
 *   the new file CHANGED are counted out loud ("may have been adopted"),
 *   never auto-resolved.
 * - "Not an error" rulings need no help: they are user-scoped and keyed by
 *   xref, so they already survive any number of uploads.
 * - Photos move (2026-09-15). The bytes came from one desktop overlay of a
 *   Family Tree Maker export and no refreshed file brings them back, so the
 *   old rows' uploads adopt the new tree's own media rows for the same
 *   files (mediaCarry.ts), readings follow, and the objects are moved into
 *   the new tree's folder once the old tree is gone — the bucket's sharing
 *   policy gates on the tree id in the path.
 */

export interface RefreshPreview {
  pulse: TreePulse;
  summary: string;
  /** Null when the refresh costs the user nothing. */
  costWarning: string | null;
  remap: IdRemap;
  strandedBriefs: number;
  strandedArchiveVerdicts: number;
  strandedCrossingVerdicts: number;
  strandedRecordLinks: number;
  strandedBackIssues: number;
  homePersonLost: boolean;
  /** "You marked N fixed — this file confirms M of them." Null without marks. */
  marksNote: string | null;
  marksGraduated: number;
  marksCarrying: number;
  marksStranded: number;
  shareLinksMoving: number;
  shareLinksStranded: number;
  correctionsMoving: number;
  correctionsStranded: number;
  /** Open corrections whose underlying fact the new file changed. */
  correctionsChanged: number;
  /** "Your N margin corrections come along." Null without corrections. */
  correctionsNote: string | null;
  /** Uploaded photos that land on the new tree, by any tier. */
  photosMoving: number;
  /** Uploaded photos with nowhere to land — lost with the old tree. */
  photosStranded: number;
  /** "Your N photos come along." Null without photos. */
  photosNote: string | null;
  /** Kept so apply writes exactly what the preview promised. */
  mediaPlan: MediaCarryPlan;
}

interface BriefRow {
  id: string;
  individual_id: string;
}
interface CandidateRow {
  id: string;
  individual_id: string;
  /** Needed to find the new tree's duplicate of this same document. */
  na_id: number;
}
interface CrossingRow {
  id: string;
  individual_id: string;
  /** Needed to find the new tree's duplicate of this same passenger. */
  passenger_id: string;
}
interface RegisterLinkRow {
  id: string;
  individual_id: string;
  register_key: string;
  /** Null for Variant C save-backs, which cannot collide on the new tree. */
  record_id: string | null;
}

interface ShareLinkRow {
  token: string;
  individual_id: string;
}

async function fetchCarryables(supabase: WitnessSupabaseClient, oldTreeId: string) {
  const [
    briefs,
    candidates,
    findings,
    marks,
    shareLinks,
    corrections,
    notes,
    visits,
    graves,
    crossings,
    registerLinks,
  ] = await Promise.all([
    supabase.from('research_briefs').select('id, individual_id').eq('tree_id', oldTreeId),
    // Only decided candidates are worth carrying. A pending row is a machine
    // suggestion the new tree's enrichment will regenerate anyway; moving it
    // would just fight the unique (individual_id, na_id) constraint.
    supabase
      .from('nara_candidates')
      .select('id, individual_id, na_id')
      .eq('tree_id', oldTreeId)
      .neq('status', 'pending'),
    // The findings ledger — only printed pieces (edition_key set) carry:
    // an unprinted row is a machine notice the new tree will re-derive, but
    // a back issue is history and dies with the old tree's cascade otherwise.
    supabase
      .from('findings')
      .select('finding_id, source, subject_ids, sentence, edition_key, section, first_seen_at')
      .eq('tree_id', oldTreeId)
      .not('edition_key', 'is', null),
    // "Fixed" marks now graduate or carry rather than dying (Katie review).
    supabase.from('tree_health_marks').select('id, finding_key').eq('tree_id', oldTreeId),
    // Every shared URL used to die with the old tree's cascade — carrying
    // the row keeps the reader's link alive across a refresh.
    supabase.from('share_links').select('token, individual_id').eq('tree_id', oldTreeId),
    // The researcher's margin — their own authored work, like briefs.
    // Carried whole, resolved rows included: those are the record of work
    // already entered at the source.
    supabase
      .from('corrections')
      .select('id, individual_id, subject, snapshot_key, status')
      .eq('tree_id', oldTreeId),
    // Betsey's box and Betsey's star. Both are the reader's own — a note
    // is family lore nothing regenerates, a visit is the read-mark that
    // stops her re-reading — and both used to die silently with the old
    // tree's cascade on every refresh.
    supabase.from('ancestor_notes').select('id, individual_id').eq('tree_id', oldTreeId),
    supabase.from('ancestor_visits').select('id, individual_id').eq('tree_id', oldTreeId),
    // The user's own confirmed Find a Grave memorial URLs — testimony, not
    // imported data, so they move like notes.
    supabase.from('grave_confirmations').select('id, individual_id').eq('tree_id', oldTreeId),
    // Crossing verdicts move like the archive verdicts above: only decided
    // rows carry — a pending row is a machine suggestion the next
    // match-passengers --write regenerates, and moving it would fight the
    // unique (individual_id, passenger_id) constraint.
    supabase
      .from('passenger_candidates')
      .select('id, individual_id, passenger_id')
      .eq('tree_id', oldTreeId)
      .neq('status', 'pending'),
    // Register verdicts (confirmed / rejected / parsed_from_gedcom) are
    // the researcher's work — the registers framework's day-one invariant
    // is that they survive the refresh. Candidates regenerate on the next
    // match-registers run and stay behind.
    supabase
      .from('person_register_links')
      .select('id, individual_id, register_key, record_id')
      .eq('tree_id', oldTreeId)
      .neq('status', 'candidate'),
  ]);
  return {
    briefs: (briefs.data ?? []) as BriefRow[],
    candidates: (candidates.data ?? []) as CandidateRow[],
    findings: (findings.data ?? []) as FindingRow[],
    marks: (marks.data ?? []) as MarkRow[],
    shareLinks: (shareLinks.data ?? []) as ShareLinkRow[],
    corrections: (corrections.data ?? []) as CorrectionCarryRow[],
    notes: (notes.data ?? []) as BriefRow[],
    visits: (visits.data ?? []) as BriefRow[],
    graves: (graves.data ?? []) as BriefRow[],
    crossings: (crossings.data ?? []) as CrossingRow[],
    registerLinks: (registerLinks.data ?? []) as RegisterLinkRow[],
  };
}

/**
 * `orphan:<id>` for everyone still disconnected in the new tree — the set
 * orphan-records marks graduate against, mirroring how tree-health marks
 * graduate against the new tree's finding keys. All island members count,
 * not just anchors, so a mark graduates only when its person is genuinely
 * reconnected.
 */
function orphanKeysOf(health: TreeHealthData): Set<string> {
  const report = findOrphanRecords(health);
  const keys = new Set<string>();
  for (const island of report.islands) {
    for (const id of island.memberIds) keys.add(`orphan:${id}`);
  }
  for (const solo of report.solos) keys.add(`orphan:${solo.individualId}`);
  return keys;
}

export interface RefreshTarget {
  id: string;
  name: string;
  individualCount: number;
  matchedBy: 'provider_tree_id' | 'name';
}

/**
 * The front door of the round-trip (Katie: plain import silently duplicated
 * the tree). Given a freshly-parsed file's header, find the existing tree it
 * looks like a newer export of — the vendor tree id is decisive when both
 * sides carry one; the tree name is the fallback. Returns the largest match
 * so the import screen can offer "update" as the primary path, with plain
 * import always available.
 */
export async function findRefreshTarget(
  supabase: WitnessSupabaseClient,
  metadata: { ancestryTreeId?: string; treeName?: string },
): Promise<RefreshTarget | null> {
  // Owned trees only: family members sharing one Ancestry tree carry the
  // SAME vendor tree id (and often the same tree name), and under
  // sharing membership policies both matches below would otherwise offer
  // "update THEIR tree" as the primary path.
  const { data: auth } = await supabase.auth.getSession();
  const ownerId = auth.session?.user.id;
  if (!ownerId) return null;
  if (metadata.ancestryTreeId) {
    const { data } = await supabase
      .from('trees')
      .select('id, name, individual_count')
      .eq('user_id', ownerId)
      .eq('import_status', 'complete')
      .eq('ancestry_tree_id', metadata.ancestryTreeId)
      .order('individual_count', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      return { id: data.id, name: data.name, individualCount: data.individual_count, matchedBy: 'provider_tree_id' };
    }
  }
  if (metadata.treeName) {
    const { data } = await supabase
      .from('trees')
      .select('id, name, individual_count')
      .eq('user_id', ownerId)
      .eq('import_status', 'complete')
      .eq('name', metadata.treeName)
      .order('individual_count', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      return { id: data.id, name: data.name, individualCount: data.individual_count, matchedBy: 'name' };
    }
  }
  return null;
}

/**
 * Everything the user needs to decide whether to apply, computed without
 * writing anything. Both trees must already exist.
 */
export async function previewRefresh(
  supabase: WitnessSupabaseClient,
  oldTreeId: string,
  newTreeId: string,
): Promise<RefreshPreview> {
  const [before, after, carryables, oldTree, mediaCarryables] = await Promise.all([
    fetchTreeHealthData(supabase, oldTreeId),
    fetchTreeHealthData(supabase, newTreeId),
    fetchCarryables(supabase, oldTreeId),
    supabase.from('trees').select('home_person_id').eq('id', oldTreeId).maybeSingle(),
    fetchMediaCarryables(supabase, oldTreeId, newTreeId),
  ]);

  const pulse = diffTrees(before, after);
  const remap = remapIndividuals(before.individuals, after.individuals);
  const mediaPlan = planMediaRefresh(mediaCarryables, remap);

  const briefPlan = planCarryForward(carryables.briefs, remap);
  const candidatePlan = planCarryForward(carryables.candidates, remap);
  const crossingPlan = planCarryForward(carryables.crossings, remap);
  const registerLinksPlan = planCarryForward(carryables.registerLinks, remap);
  const findingsPlan = planFindingsCarry(carryables.findings, remap);
  const homePersonId = oldTree.data?.home_person_id ?? null;
  const homePersonLost = Boolean(homePersonId && !remap.map.has(homePersonId));

  // The new tree's live findings, so old marks can graduate against them —
  // and its still-disconnected people, so orphan marks can do the same.
  const newFindingKeys = new Set(
    runTreeHealth(after, { currentYear: new Date().getFullYear() }).findings.map(findingKey),
  );
  const marksPlan = planMarksCarry(carryables.marks, remap, newFindingKeys, orphanKeysOf(after));
  const marksNote =
    carryables.marks.length > 0
      ? `You had marked ${carryables.marks.length} finding${
          carryables.marks.length === 1 ? '' : 's'
        } fixed — this file confirms ${marksPlan.graduated} of them.`
      : null;

  const shareLinksMoving = carryables.shareLinks.filter((l) => remap.map.has(l.individual_id)).length;
  const shareLinksStranded = carryables.shareLinks.length - shareLinksMoving;

  const correctionsPlan = planCarryForward(carryables.corrections, remap);
  // Stranded visits are just read-marks and go quietly; a stranded NOTE is
  // the reader's own words and belongs in the cost warning.
  const notesPlan = planCarryForward(carryables.notes, remap);
  const newPeopleById = new Map<string, SnapshotPerson>(
    after.individuals.map((p) => [p.id, p]),
  );
  const correctionsChanged = countChangedFacts(correctionsPlan.moving, newPeopleById);
  // Counts only what moves — stranded corrections are the cost warning's job.
  const correctionsNote =
    correctionsPlan.moving.length > 0
      ? `Your ${correctionsPlan.moving.length} margin correction${
          correctionsPlan.moving.length === 1 ? ' comes' : 's come'
        } along.${
          correctionsChanged > 0
            ? ` The file has changed the fact behind ${correctionsChanged} of ${
                correctionsChanged === 1 ? 'it' : 'them'
              } — ${
                correctionsChanged === 1 ? 'it' : 'they'
              } may have been adopted; review ${
                correctionsChanged === 1 ? 'it' : 'them'
              } on the punch list.`
            : ''
        }`
      : null;

  return {
    pulse,
    summary: pulseSummary(pulse),
    costWarning: carryCostWarning({
      strandedBriefs: briefPlan.stranded.length,
      strandedArchiveVerdicts: candidatePlan.stranded.length,
      strandedCrossingVerdicts: crossingPlan.stranded.length,
      strandedRecordLinks: registerLinksPlan.stranded.length,
      strandedBackIssues: findingsPlan.stranded.length,
      strandedMarks: marksPlan.stranded,
      strandedShareLinks: shareLinksStranded,
      strandedCorrections: correctionsPlan.stranded.length,
      strandedNotes: notesPlan.stranded.length,
      strandedPhotos: mediaPlan.stranded.length,
      homePersonLost,
    }),
    remap,
    strandedBriefs: briefPlan.stranded.length,
    strandedArchiveVerdicts: candidatePlan.stranded.length,
    strandedCrossingVerdicts: crossingPlan.stranded.length,
    strandedRecordLinks: registerLinksPlan.stranded.length,
    strandedBackIssues: findingsPlan.stranded.length,
    homePersonLost,
    marksNote,
    marksGraduated: marksPlan.graduated,
    marksCarrying: marksPlan.carrying.length,
    marksStranded: marksPlan.stranded,
    shareLinksMoving,
    shareLinksStranded,
    correctionsMoving: correctionsPlan.moving.length,
    correctionsStranded: correctionsPlan.stranded.length,
    correctionsChanged,
    correctionsNote,
    photosMoving: mediaPlan.adopting.length + mediaPlan.recreating.length + mediaPlan.alreadyComplete,
    photosStranded: mediaPlan.stranded.length,
    photosNote: photosNote(mediaPlan),
    mediaPlan,
  };
}

export interface RefreshResult {
  briefsMoved: number;
  verdictsMoved: number;
  crossingVerdictsMoved: number;
  recordLinksMoved: number;
  backIssuePiecesMoved: number;
  marksCarried: number;
  marksGraduated: number;
  shareLinksMoved: number;
  correctionsMoved: number;
  homePersonMoved: boolean;
  /** Uploaded photos now on the new tree: adopted plus recreated. */
  photosMoved: number;
  /**
   * Photos whose object could not be moved into the new tree's folder. The
   * rows still point at the old folder, readable by the owner; family
   * members will not see these until a later refresh or overlay moves them.
   */
  photosLeftBehind: number;
  oldTreeDeleted: boolean;
}

export interface ApplyRefreshOptions {
  /** Moving the photo objects is the slow part; the screen can say so. */
  onPhotoProgress?: (progress: MoveProgress) => void;
}

/**
 * Apply the refresh: move the user's work onto the new tree, record the
 * report, then retire the old tree.
 *
 * Ordering is load-bearing. Every carried row moves before the old tree is
 * deleted, because research_briefs and nara_candidates both cascade from
 * trees — deleting first would take the very rows this function exists to
 * save. If a move fails, the old tree is left standing and the caller can
 * retry; a duplicate tree is recoverable, a deleted brief is not.
 */
export async function applyRefresh(
  supabase: WitnessSupabaseClient,
  oldTreeId: string,
  newTreeId: string,
  preview: RefreshPreview,
  options: ApplyRefreshOptions = {},
): Promise<RefreshResult> {
  const carryables = await fetchCarryables(supabase, oldTreeId);
  const briefPlan = planCarryForward(carryables.briefs, preview.remap);
  const candidatePlan = planCarryForward(carryables.candidates, preview.remap);
  const crossingPlan = planCarryForward(carryables.crossings, preview.remap);
  const registerLinksPlan = planCarryForward(carryables.registerLinks, preview.remap);
  const findingsPlan = planFindingsCarry(carryables.findings, preview.remap);
  // Marks re-plan against the new tree's live findings, same as the preview.
  const newHealth = await fetchTreeHealthData(supabase, newTreeId);
  const newFindingKeys = new Set(
    runTreeHealth(newHealth, { currentYear: new Date().getFullYear() }).findings.map(findingKey),
  );
  const marksPlan = planMarksCarry(
    carryables.marks,
    preview.remap,
    newFindingKeys,
    orphanKeysOf(newHealth),
  );

  for (const { row, newIndividualId } of briefPlan.moving) {
    const { error } = await supabase
      .from('research_briefs')
      .update({ tree_id: newTreeId, individual_id: newIndividualId })
      .eq('id', row.id);
    if (error) throw new Error(`Could not move a research brief: ${error.message}`);
  }

  // The margin moves the same way the briefs do: the researcher's own rows,
  // re-pointed by primary key onto the people the remap could follow.
  const correctionsPlan = planCarryForward(carryables.corrections, preview.remap);
  for (const { row, newIndividualId } of correctionsPlan.moving) {
    const { error } = await supabase
      .from('corrections')
      .update({ tree_id: newTreeId, individual_id: newIndividualId })
      .eq('id', row.id);
    if (error) throw new Error(`Could not move a margin correction: ${error.message}`);
  }

  // Betsey's box and star: the reader's notes and read-marks, previously
  // lost to the cascade on every refresh. Neither can collide on the new
  // tree — its people are freshly minted rows with no notes or visits, and
  // the remap never lands two old people on one new one.
  const notesPlan = planCarryForward(carryables.notes, preview.remap);
  for (const { row, newIndividualId } of notesPlan.moving) {
    const { error } = await supabase
      .from('ancestor_notes')
      .update({ tree_id: newTreeId, individual_id: newIndividualId })
      .eq('id', row.id);
    if (error) throw new Error(`Could not move an ancestor note: ${error.message}`);
  }
  const gravesPlan = planCarryForward(carryables.graves, preview.remap);
  for (const { row, newIndividualId } of gravesPlan.moving) {
    const { error } = await supabase
      .from('grave_confirmations')
      .update({ tree_id: newTreeId, individual_id: newIndividualId })
      .eq('id', row.id);
    if (error) throw new Error(`Could not move a grave confirmation: ${error.message}`);
  }
  const visitsPlan = planCarryForward(carryables.visits, preview.remap);
  for (const { row, newIndividualId } of visitsPlan.moving) {
    // A visit is a convenience mark — a failed move is not worth failing
    // the refresh over, unlike the authored rows above.
    await supabase
      .from('ancestor_visits')
      .update({ tree_id: newTreeId, individual_id: newIndividualId })
      .eq('id', row.id);
  }

  for (const { row, newIndividualId } of candidatePlan.moving) {
    // The new tree's enrichment may already have surfaced this same document
    // for this same person as a pending suggestion. `unique (individual_id,
    // na_id)` means moving the verdict on top of it is a constraint violation,
    // not an overwrite — so the machine's guess is cleared first. A verdict the
    // researcher actually gave outranks a pending suggestion, and without this
    // the refresh aborts for exactly the people who have done the most archive
    // work.
    const { error: clearError } = await supabase
      .from('nara_candidates')
      .delete()
      .eq('tree_id', newTreeId)
      .eq('individual_id', newIndividualId)
      .eq('na_id', row.na_id);
    if (clearError) {
      throw new Error(`Could not clear a duplicate archive candidate: ${clearError.message}`);
    }

    const { error } = await supabase
      .from('nara_candidates')
      .update({ tree_id: newTreeId, individual_id: newIndividualId })
      .eq('id', row.id);
    if (error) throw new Error(`Could not move an archive verdict: ${error.message}`);
  }

  for (const { row, newIndividualId } of crossingPlan.moving) {
    // Same shape as the archive verdicts: a fresh match-passengers run may
    // already have re-suggested this same passenger for this same person on
    // the new tree, and `unique (individual_id, passenger_id)` would turn
    // the move into a constraint violation — clear the machine's pending
    // guess and let the researcher's verdict land.
    const { error: clearError } = await supabase
      .from('passenger_candidates')
      .delete()
      .eq('tree_id', newTreeId)
      .eq('individual_id', newIndividualId)
      .eq('passenger_id', row.passenger_id);
    if (clearError) {
      throw new Error(`Could not clear a duplicate crossing candidate: ${clearError.message}`);
    }

    const { error } = await supabase
      .from('passenger_candidates')
      .update({ tree_id: newTreeId, individual_id: newIndividualId })
      .eq('id', row.id);
    if (error) throw new Error(`Could not move a crossing verdict: ${error.message}`);
  }

  for (const { row, newIndividualId } of registerLinksPlan.moving) {
    // Same shape again: where a record id exists, a fresh match-registers
    // run may have re-suggested the pair on the new tree — clear the
    // machine's candidate before the verdict lands. Variant C rows
    // (record_id null) sit outside the unique index and move directly.
    if (row.record_id !== null) {
      const { error: clearError } = await supabase
        .from('person_register_links')
        .delete()
        .eq('tree_id', newTreeId)
        .eq('individual_id', newIndividualId)
        .eq('register_key', row.register_key)
        .eq('record_id', row.record_id);
      if (clearError) {
        throw new Error(`Could not clear a duplicate register candidate: ${clearError.message}`);
      }
    }
    const { error } = await supabase
      .from('person_register_links')
      .update({ tree_id: newTreeId, individual_id: newIndividualId })
      .eq('id', row.id);
    if (error) throw new Error(`Could not move a record link: ${error.message}`);
  }

  // The ledger crosses by insert rather than update: finding_id is half the
  // primary key and must be rewritten, and the new tree's Home may already
  // have printed this week's pieces there — ignoreDuplicates lets the two
  // histories meet without a constraint violation. The old rows retire with
  // the old tree's cascade.
  if (findingsPlan.moving.length > 0) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId) {
      const { error } = await supabase.from('findings').upsert(
        findingsPlan.moving.map(({ row, newFindingId, newSubjectIds }) => ({
          tree_id: newTreeId,
          user_id: userId,
          finding_id: newFindingId,
          source: row.source,
          subject_ids: newSubjectIds,
          sentence: row.sentence,
          edition_key: row.edition_key,
          section: row.section,
          first_seen_at: row.first_seen_at,
        })),
        { onConflict: 'tree_id,finding_id', ignoreDuplicates: true },
      );
      if (error) throw new Error(`Could not carry the back issues: ${error.message}`);
    }
  }

  // Carry the still-live marks onto the new tree under their rewritten keys.
  if (marksPlan.carrying.length > 0) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId) {
      const { error } = await supabase.from('tree_health_marks').upsert(
        marksPlan.carrying.map(({ newKey }) => ({
          tree_id: newTreeId,
          user_id: userId,
          finding_key: newKey,
        })),
        { onConflict: 'tree_id,finding_key', ignoreDuplicates: true },
      );
      if (error) throw new Error(`Could not carry the fixed marks: ${error.message}`);
    }
  }

  // Re-point shared links so every URL a reader holds survives the refresh.
  let shareLinksMoved = 0;
  for (const link of carryables.shareLinks) {
    const landed = preview.remap.map.get(link.individual_id);
    if (!landed) continue;
    const { error } = await supabase
      .from('share_links')
      .update({ tree_id: newTreeId, individual_id: landed })
      .eq('token', link.token);
    if (error) throw new Error(`Could not carry a shared link: ${error.message}`);
    shareLinksMoved += 1;
  }

  let movedHome = false;
  if (!preview.homePersonLost) {
    const { data } = await supabase
      .from('trees')
      .select('home_person_id')
      .eq('id', oldTreeId)
      .maybeSingle();
    const landed = data?.home_person_id
      ? preview.remap.map.get(data.home_person_id)
      : undefined;
    if (landed) {
      await supabase.from('trees').update({ home_person_id: landed }).eq('id', newTreeId);
      movedHome = true;
    }
  }

  // Photos: the old rows' uploads adopt the new tree's rows for the same
  // files, readings follow, recreated rows land where their people did.
  // Objects stay in the old folder until the old tree is gone (below).
  const { data: ownerData } = await supabase.auth.getUser();
  const ownerId = ownerData.user?.id;
  let photosMoved = 0;
  if (ownerId) {
    const mediaResult = await applyMediaCarry(
      supabase,
      preview.mediaPlan,
      ownerId,
      oldTreeId,
      newTreeId,
    );
    photosMoved = mediaResult.adopted + mediaResult.recreated + preview.mediaPlan.alreadyComplete;
  }

  // Ancestry identity overlaid onto an FTM tree (ancestry_person_id, record
  // links) moves by xref and by unique name — the Ancestry export is taken
  // once, never again. A missing function (migration not applied) just
  // means nothing carries, said in the log, never a failed refresh.
  const { error: identityError } = await supabase.rpc('carry_ancestry_identity', {
    p_old_tree_id: oldTreeId,
    p_new_tree_id: newTreeId,
  });
  if (identityError) console.warn('Ancestry identity did not carry:', identityError.message);

  const { error: pulseError } = await supabase
    .from('trees')
    .update({
      // Structurally Json, but TreePulse is an interface rather than an index
      // signature, so it needs naming as such for the generated column type.
      last_pulse: preview.pulse as unknown as Json,
      last_pulse_at: new Date().toISOString(),
      refreshed_from: oldTreeId,
    })
    .eq('id', newTreeId);
  if (pulseError) throw new Error(`Could not record the Tree Pulse: ${pulseError.message}`);

  // Last, and only now that everything worth keeping has moved.
  const oldTreeDeleted = await retireTree(supabase, oldTreeId);

  // The photo objects follow once the old tree no longer reads them. A
  // move that fails leaves the row on its old path — readable by the
  // owner, invisible to family members — and is counted, never thrown:
  // the refresh has already succeeded by this point.
  let photosLeftBehind = 0;
  if (ownerId && oldTreeDeleted) {
    try {
      const moved = await moveCarriedObjects(
        supabase,
        ownerId,
        oldTreeId,
        newTreeId,
        options.onPhotoProgress,
      );
      photosLeftBehind = moved.leftBehind;
    } catch (error) {
      console.warn('Photos left in the old folder:', error);
      photosLeftBehind = photosMoved;
    }
  } else if (ownerId) {
    photosLeftBehind = photosMoved;
  }

  return {
    briefsMoved: briefPlan.moving.length,
    verdictsMoved: candidatePlan.moving.length,
    crossingVerdictsMoved: crossingPlan.moving.length,
    recordLinksMoved: registerLinksPlan.moving.length,
    backIssuePiecesMoved: findingsPlan.moving.length,
    marksCarried: marksPlan.carrying.length,
    marksGraduated: marksPlan.graduated,
    shareLinksMoved,
    correctionsMoved: correctionsPlan.moving.length,
    homePersonMoved: movedHome,
    photosMoved,
    photosLeftBehind,
    oldTreeDeleted,
  };
}

/**
 * Remove the superseded tree in bounded slices.
 *
 * A single `delete from trees` exceeds the API role's statement timeout on any
 * real tree — the delete_tree_batch migration exists precisely because of it,
 * and you.tsx has looped this way since a half-finished delete once left a
 * tree claiming 5,495 people while holding 295. A refresh deletes exactly the
 * same shape of thing, so it takes exactly the same route.
 *
 * Returning false rather than throwing is deliberate: by this point the user's
 * work has already moved to the new tree, so a failed tidy-up is a leftover to
 * report, not a reason to fail an operation that has otherwise succeeded.
 */
async function retireTree(supabase: WitnessSupabaseClient, treeId: string): Promise<boolean> {
  // ~40 calls for a 5,000-person tree; the ceiling is a runaway guard, and
  // falling out of the loop counts as not done rather than as success.
  for (let i = 0; i < 400; i++) {
    const { data, error } = await supabase.rpc('delete_tree_batch', { p_tree_id: treeId });
    if (error) return false;
    if ((data as { done?: boolean } | null)?.done) return true;
  }
  return false;
}
