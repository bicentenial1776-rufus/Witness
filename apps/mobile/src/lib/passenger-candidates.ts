import {
  describeRegistration,
  setPassengerCandidateStatus,
  type PassengerCandidate,
} from '@witness/core/query';

import { supabase } from '@/lib/supabase';

/**
 * The Crossing card's confirm/dismiss actions. Mirrors the At the Stone
 * write path (src/lib/grave-captures.ts attachCapture): confirming resolves
 * or creates the arrival place, then adds — or backfills a blank —
 * immigration event citing the transcription. Witness never auto-writes;
 * this only runs from an explicit "This is them" tap.
 */
export async function confirmPassengerCandidate(candidate: PassengerCandidate): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');

  // A register names where this ship was bound; a reconstruction only
  // knows where the voyage as a whole arrived.
  const destination = candidate.boundFor ?? candidate.arrivalPlace;
  let placeId: string | null = null;
  if (destination) {
    const { data: existing } = await supabase
      .from('places')
      .select('id')
      .eq('tree_id', candidate.treeId)
      .eq('raw', destination)
      .maybeSingle();
    if (existing) {
      placeId = existing.id as string;
    } else {
      const { data: place } = await supabase
        .from('places')
        .insert({
          tree_id: candidate.treeId,
          user_id: userId,
          raw: destination,
          parts: destination.split(',').map((p) => p.trim()).filter(Boolean),
        })
        .select('id')
        .single();
      placeId = (place?.id as string) ?? null;
    }
  }

  const registration = describeRegistration(candidate);
  const detail = [`${candidate.ship}, ${candidate.arrivalYear}`, registration, `matched from ${candidate.source}`]
    .filter(Boolean)
    .join(' — ');
  // The register's own date, down to the day when the OCR kept it.
  const [, registerMonth, registerDay] = (candidate.registerDate ?? '').split('-').map(Number);
  const registerDateFields = {
    ...(registerMonth ? { date_month: registerMonth } : {}),
    ...(registerDay ? { date_day: registerDay } : {}),
  };

  // A GEDCOM import can carry a bare immigration tag with no date or
  // place — the crossing fills it in; an immigration event that already
  // says something is left alone rather than duplicated.
  const { data: existingEvent } = await supabase
    .from('individual_events')
    .select('id, date_year, place_id')
    .eq('individual_id', candidate.individualId)
    .eq('event_type', 'immigration')
    .limit(1)
    .maybeSingle();
  if (!existingEvent) {
    const { error: eventError } = await supabase.from('individual_events').insert({
      tree_id: candidate.treeId,
      user_id: userId,
      individual_id: candidate.individualId,
      event_type: 'immigration',
      date_year: candidate.arrivalYear,
      ...registerDateFields,
      detail,
      place_id: placeId,
      sort_order: 150,
    });
    if (eventError) throw new Error(`The immigration event failed: ${eventError.message}`);
  } else if (existingEvent.date_year === null && existingEvent.place_id === null) {
    const { error: updateError } = await supabase
      .from('individual_events')
      .update({ date_year: candidate.arrivalYear, ...registerDateFields, place_id: placeId, detail })
      .eq('id', existingEvent.id);
    if (updateError) throw new Error(`The immigration event failed: ${updateError.message}`);
  }

  await setPassengerCandidateStatus(supabase, candidate.id, 'confirmed');

  // The biography and its historical context were written from the facts
  // as they stood; the crossing is a new fact, so the next read regenerates.
  // The verdict is already saved — a failure here only leaves a stale story.
  const { error: cacheError } = await supabase
    .from('enrichment_cache')
    .delete()
    .eq('individual_id', candidate.individualId)
    .in('enrichment_type', ['biography', 'historical_context']);
  if (cacheError) console.warn('Could not clear the cached story:', cacheError.message);
}

export async function dismissPassengerCandidate(candidateId: string): Promise<void> {
  await setPassengerCandidateStatus(supabase, candidateId, 'dismissed');
}
