import { fetchTreeHealthData } from '../query/treeHealth.js';
import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { Json } from '../supabase/database.types.js';
import {
  carryCostWarning,
  diffTrees,
  planCarryForward,
  pulseSummary,
  remapIndividuals,
  type IdRemap,
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
 * - Tree Health "fixed" marks do not. If the record really was corrected the
 *   finding will not reappear; if it does reappear, the mark was premature.
 *   Carrying them would let a stale mark hide a live problem.
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
  homePersonLost: boolean;
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

async function fetchCarryables(supabase: WitnessSupabaseClient, oldTreeId: string) {
  const [briefs, candidates] = await Promise.all([
    supabase.from('research_briefs').select('id, individual_id').eq('tree_id', oldTreeId),
    // Only decided candidates are worth carrying. A pending row is a machine
    // suggestion the new tree's enrichment will regenerate anyway; moving it
    // would just fight the unique (individual_id, na_id) constraint.
    supabase
      .from('nara_candidates')
      .select('id, individual_id, na_id')
      .eq('tree_id', oldTreeId)
      .neq('status', 'pending'),
  ]);
  return {
    briefs: (briefs.data ?? []) as BriefRow[],
    candidates: (candidates.data ?? []) as CandidateRow[],
  };
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
  const homePersonId = oldTree.data?.home_person_id ?? null;
  const homePersonLost = Boolean(homePersonId && !remap.map.has(homePersonId));

  return {
    pulse,
    summary: pulseSummary(pulse),
    costWarning: carryCostWarning({
      strandedBriefs: briefPlan.stranded.length,
      strandedArchiveVerdicts: candidatePlan.stranded.length,
      homePersonLost,
    }),
    remap,
    strandedBriefs: briefPlan.stranded.length,
    strandedArchiveVerdicts: candidatePlan.stranded.length,
    homePersonLost,
  };
}

export interface RefreshResult {
  briefsMoved: number;
  verdictsMoved: number;
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

  for (const { row, newIndividualId } of briefPlan.moving) {
    const { error } = await supabase
      .from('research_briefs')
      .update({ tree_id: newTreeId, individual_id: newIndividualId })
      .eq('id', row.id);
    if (error) throw new Error(`Could not move a research brief: ${error.message}`);
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
