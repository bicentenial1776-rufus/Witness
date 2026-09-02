import type { PersonRegisterLink, RegisterDef } from '@witness/core/registers';
import { setRegisterLinkStatus } from '@witness/core/registers';

import { supabase } from '@/lib/supabase';

/**
 * The register card's confirm/dismiss actions — the Crossing card's write
 * path, generalized. Confirming records the verdict; when the register's
 * config asks for it (confirmEvent), a real event is written on the
 * person with the record's provenance in its detail. Witness never
 * auto-writes; this runs only from an explicit "This is them" tap.
 */
export async function confirmRegisterLink(
  link: PersonRegisterLink,
  register: RegisterDef,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');

  const spec = register.config.confirmEvent;
  if (spec) {
    const detail = spec.detailTemplate
      .replace('{record_name}', link.recordName ?? '')
      .replace('{register_label}', register.provenanceLabel)
      .replace('{source}', link.sourceCitation ?? '');
    const year = link.savedPayload?.['event_year'];
    const { data: existing } = await supabase
      .from('individual_events')
      .select('id')
      .eq('individual_id', link.individualId)
      .eq('event_type', spec.eventType as never)
      .limit(1)
      .maybeSingle();
    // An event of this type already on the record is left alone rather
    // than duplicated — the crossing rule.
    if (!existing) {
      const { error } = await supabase.from('individual_events').insert({
        tree_id: link.treeId,
        user_id: userId,
        individual_id: link.individualId,
        event_type: spec.eventType as never,
        date_year: typeof year === 'number' ? year : null,
        detail,
        sort_order: 150,
      });
      if (error) throw new Error(`The event write failed: ${error.message}`);
    }
  }

  await setRegisterLinkStatus(supabase, link.id, 'confirmed');
}

export async function dismissRegisterLink(linkId: string): Promise<void> {
  await setRegisterLinkStatus(supabase, linkId, 'rejected');
}
