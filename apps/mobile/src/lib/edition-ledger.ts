import type { Finding } from '@witness/core/findings';

import { supabase } from '@/lib/supabase';

/**
 * Record what an edition printed — the findings ledger's write path
 * (supabase/migrations/20260808090000_findings_ledger.sql).
 *
 * Fire-and-forget from Home after the desks pick: a failed write costs a
 * back issue, never the front page. Upsert keyed (tree_id, finding_id), so
 * a piece re-printed in a later edition keeps its first edition_key — the
 * week it first ran is the fact worth keeping.
 */
export interface RecordPiece {
  findingId: string;
  sentence: string;
  subjectId: string | null;
}

/**
 * The edition's "From the records" slot: today's already-printed record
 * piece if one ran (the front page stays stable all day), else the
 * oldest NOTICED crossing/register finding takes the slot and is stamped
 * with today's edition key — the update recordEditionPieces cannot do,
 * since its upsert deliberately never overwrites an existing row.
 * Returns null on a day with nothing noticed: the module simply doesn't
 * print, silence over filler.
 */
export async function pullRecordPiece(
  treeId: string,
  editionKey: string,
): Promise<RecordPiece | null> {
  const { data: printed } = await supabase
    .from('findings')
    .select('finding_id, sentence, subject_ids')
    .eq('tree_id', treeId)
    .eq('edition_key', editionKey)
    .eq('section', 'records')
    .limit(1)
    .maybeSingle();
  if (printed) {
    return {
      findingId: printed.finding_id,
      sentence: printed.sentence,
      subjectId: printed.subject_ids?.[0] ?? null,
    };
  }
  const { data: noticed } = await supabase
    .from('findings')
    .select('finding_id, sentence, subject_ids')
    .eq('tree_id', treeId)
    .is('edition_key', null)
    .in('source', ['crossing', 'register'])
    .order('first_seen_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!noticed) return null;
  await supabase
    .from('findings')
    .update({ edition_key: editionKey, section: 'records' })
    .eq('tree_id', treeId)
    .eq('finding_id', noticed.finding_id)
    .is('edition_key', null);
  return {
    findingId: noticed.finding_id,
    sentence: noticed.sentence,
    subjectId: noticed.subject_ids?.[0] ?? null,
  };
}

export function recordEditionPieces(
  treeId: string,
  editionKey: string,
  pieces: { finding: Finding; section: string }[],
): void {
  if (pieces.length === 0) return;
  void (async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    await supabase.from('findings').upsert(
      pieces.map(({ finding, section }) => ({
        tree_id: treeId,
        user_id: userId,
        finding_id: finding.id,
        source: finding.source,
        subject_ids: finding.subjectIds,
        sentence: finding.sentence,
        edition_key: editionKey,
        section,
      })),
      { onConflict: 'tree_id,finding_id', ignoreDuplicates: true },
    );
  })().catch(() => {});
}
