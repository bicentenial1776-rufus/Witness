import {
  countChangedFacts,
  type CorrectionCarryRow,
  type SnapshotPerson,
} from '../corrections/index.js';
import { findOrphanRecords } from '../query/orphanRecords.js';
import { fetchTreeHealthData, findingKey, runTreeHealth, type TreeHealthData } from '../query/treeHealth.js';
import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { Json } from '../supabase/database.types.js';
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
 */

export interface RefreshPreview {
  pulse: TreePulse;
  summary: string;
  /** Null when the refresh costs the user nothing. */
  costWarning: string | null;
  remap: IdRemap;
  strandedBriefs: number;
  strandedArchiveVerdicts: number;
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

interface ShareLinkRow {
  token: string;
  individual_id: string;
}

async function fetchCarryables(supabase: WitnessSupabaseClient, oldTreeId: string) {
  const [briefs, candidates, findings, marks, shareLinks, corrections] = await Promise.all([
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
  ]);
  return {
    briefs: (briefs.data ?? []) as BriefRow[],
    candidates: (candidates.data ?? []) as CandidateRow[],
    findings: (findings.data ?? []) as FindingRow[],
    marks: (marks.data ?? []) as MarkRow[],
    shareLinks: (shareLinks.data ?? []) as ShareLinkRow[],
    corrections: (corrections.data ?? []) as CorrectionCarryRow[],
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
  if (metadata.ancestryTreeId) {
    const { data } = await supabase
      .from('trees')
      .select('id, name, individual_count')
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
  const [before, after, carryables, oldTree] = await Promise.all([
    fetchTreeHealthData(supabase, oldTreeId),
    fetchTreeHealthData(supabase, newTreeId),
    fetchCarryables(supabase, oldTreeId),
    supabase.from('trees').select('home_person_id').eq('id', oldTreeId).maybeSingle(),
  ]);

  const pulse = diffTrees(before, after);
  const remap = remapIndividuals(before.individuals, after.individuals);

  const briefPlan = planCarryForward(carryables.briefs, remap);
  const candidatePlan = planCarryForward(carryables.candidates, remap);
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
      strandedBackIssues: findingsPlan.stranded.length,
      strandedMarks: marksPlan.stranded,
      strandedShareLinks: shareLinksStranded,
      strandedCorrections: correctionsPlan.stranded.length,
      homePersonLost,
    }),
    remap,
    strandedBriefs: briefPlan.stranded.length,
    strandedArchiveVerdicts: candidatePlan.stranded.length,
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
  };
}

export interface RefreshResult {
  briefsMoved: number;
  verdictsMoved: number;
  backIssuePiecesMoved: number;
  marksCarried: number;
  marksGraduated: number;
  shareLinksMoved: number;
  correctionsMoved: number;
  homePersonMoved: boolean;
  oldTreeDeleted: boolean;
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
): Promise<RefreshResult> {
  const carryables = await fetchCarryables(supabase, oldTreeId);
  const briefPlan = planCarryForward(carryables.briefs, preview.remap);
  const candidatePlan = planCarryForward(carryables.candidates, preview.remap);
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
  return {
    briefsMoved: briefPlan.moving.length,
    verdictsMoved: candidatePlan.moving.length,
    backIssuePiecesMoved: findingsPlan.moving.length,
    marksCarried: marksPlan.carrying.length,
    marksGraduated: marksPlan.graduated,
    shareLinksMoved,
    correctionsMoved: correctionsPlan.moving.length,
    homePersonMoved: movedHome,
    oldTreeDeleted: await retireTree(supabase, oldTreeId),
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
