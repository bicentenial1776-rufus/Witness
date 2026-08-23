// The pencil in the margin's plumbing (Katie's round-trip arc, the piece
// deferred in b7e88ee). A correction is the researcher's own annotation
// beside a fact — recorded the moment they spot the error, never changing
// the displayed record, carried to Ancestry on the punch list and across
// refreshes by the same remap that moves briefs.

import { supabase } from '@/lib/supabase';
import type { Database } from '@witness/core/supabase';

export type CorrectionRow = Database['public']['Tables']['corrections']['Row'];

/** The person columns the punch list needs alongside each correction. */
export interface CorrectionPerson {
  full_name: string;
  gedcom_xref: string;
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
  familysearch_id: string | null;
}

export async function fetchCorrectionsForPerson(individualId: string): Promise<CorrectionRow[]> {
  const { data } = await supabase
    .from('corrections')
    .select('*')
    .eq('individual_id', individualId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function addCorrection(args: {
  individualId: string;
  treeId: string;
  subject: string;
  currentValue: string | null;
  snapshotKey: string | null;
  correctedValue: string;
  note: string | null;
}): Promise<CorrectionRow | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  const { data } = await supabase
    .from('corrections')
    .insert({
      individual_id: args.individualId,
      tree_id: args.treeId,
      user_id: userId,
      subject: args.subject,
      current_value: args.currentValue,
      snapshot_key: args.snapshotKey,
      corrected_value: args.correctedValue,
      note: args.note,
    })
    .select()
    .single();
  return data;
}

export async function updateCorrection(
  id: string,
  patch: { correctedValue: string; note: string | null },
): Promise<CorrectionRow | null> {
  const { data } = await supabase
    .from('corrections')
    .update({
      corrected_value: patch.correctedValue,
      note: patch.note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  return data;
}

export async function setCorrectionStatus(
  id: string,
  status: 'open' | 'resolved',
): Promise<CorrectionRow | null> {
  const { data } = await supabase
    .from('corrections')
    .update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  return data;
}

export async function deleteCorrection(id: string): Promise<boolean> {
  const { error } = await supabase.from('corrections').delete().eq('id', id);
  return !error;
}

/**
 * Every correction in the tree with its person attached — the punch list's
 * read. Explicit tree filter per AGENTS.md: RLS is per-user, not per-tree.
 */
export async function fetchTreeCorrections(
  treeId: string,
): Promise<(CorrectionRow & { individuals: CorrectionPerson | null })[]> {
  const { data } = await supabase
    .from('corrections')
    .select(
      '*, individuals(full_name, gedcom_xref, birth_year, death_year, living, familysearch_id)',
    )
    .eq('tree_id', treeId)
    .order('created_at', { ascending: true });
  return (data ?? []) as (CorrectionRow & { individuals: CorrectionPerson | null })[];
}
