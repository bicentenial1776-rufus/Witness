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
