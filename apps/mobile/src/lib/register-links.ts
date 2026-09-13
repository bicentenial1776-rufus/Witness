import type { PersonRegisterLink, RegisterDef, RegisterRecord, RenderedSaveBack } from '@witness/core/registers';
import { attachRegisterEntity, attachRegisterSaveBack, setRegisterLinkStatus } from '@witness/core/registers';

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
      .replace('{record_summary}', link.recordSummary ?? link.recordName ?? '')
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

  // The person's cached "world" narrative predates this confirmation —
  // clear it so the next open regenerates with the record woven in.
  await supabase
    .from('enrichment_cache')
    .delete()
    .eq('individual_id', link.individualId)
    .eq('enrichment_type', 'historical_context');
}

export async function dismissRegisterLink(linkId: string): Promise<void> {
  await setRegisterLinkStatus(supabase, linkId, 'rejected');
}

/**
 * Variant B: attach the entity the reader found (the regiment), then
 * confirm exactly as a record match would — the event write from the
 * register's confirmEvent spec runs with the unit's name in the detail.
 */
export async function attachAndConfirmRegisterEntity(
  link: PersonRegisterLink,
  register: RegisterDef,
  record: RegisterRecord,
  extra: { company?: string | null; rank?: string | null },
): Promise<PersonRegisterLink> {
  await attachRegisterEntity(supabase, link.id, record, extra);
  const attached: PersonRegisterLink = {
    ...link,
    recordId: record.id,
    recordName: record.nameAsRecorded,
    sourceCitation: record.sourceCitation,
    findingAidUrl: record.findingAidUrl,
    recordSummary: typeof record.attributes['history_excerpt'] === 'string' ? (record.attributes['history_excerpt'] as string).slice(0, 600) : null,
  };
  await confirmRegisterLink(attached, register);
  return { ...attached, status: 'confirmed' };
}

/**
 * Variant C's confirm: the reader found the record in the outside file
 * and typed its key fields (renderSaveBack); the link takes the rendered
 * snapshot and is confirmed, and the register's confirmEvent writes the
 * event with the record's own summary in its detail.
 */
export async function saveBackAndConfirm(
  link: PersonRegisterLink,
  register: RegisterDef,
  rendered: RenderedSaveBack,
): Promise<PersonRegisterLink> {
  await attachRegisterSaveBack(supabase, link.id, rendered);
  const attached: PersonRegisterLink = {
    ...link,
    recordName: rendered.recordName,
    recordSummary: rendered.recordSummary || null,
    sourceCitation: rendered.sourceCitation,
    findingAidUrl: rendered.findingAidUrl ?? link.findingAidUrl,
    savedPayload: rendered.savedPayload,
  };
  await confirmRegisterLink(attached, register);
  return { ...attached, status: 'confirmed' };
}
