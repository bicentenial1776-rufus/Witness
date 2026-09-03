import { setPassengerCandidateStatus, type PassengerCandidate } from '@witness/core/query';

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

  let placeId: string | null = null;
  if (candidate.arrivalPlace) {
    const { data: existing } = await supabase
      .from('places')
      .select('id')
      .eq('tree_id', candidate.treeId)
      .eq('raw', candidate.arrivalPlace)
      .maybeSingle();
    if (existing) {
      placeId = existing.id as string;
    } else {
      const { data: place } = await supabase
        .from('places')
        .insert({
          tree_id: candidate.treeId,
          user_id: userId,
          raw: candidate.arrivalPlace,
          parts: candidate.arrivalPlace.split(',').map((p) => p.trim()).filter(Boolean),
        })
        .select('id')
        .single();
      placeId = (place?.id as string) ?? null;
    }
  }

  const detail = `${candidate.ship}, ${candidate.arrivalYear} — matched from ${candidate.source}`;

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
      detail,
      place_id: placeId,
      sort_order: 150,
    });
    if (eventError) throw new Error(`The immigration event failed: ${eventError.message}`);
  } else if (existingEvent.date_year === null && existingEvent.place_id === null) {
    const { error: updateError } = await supabase
      .from('individual_events')
      .update({ date_year: candidate.arrivalYear, place_id: placeId, detail })
      .eq('id', existingEvent.id);
    if (updateError) throw new Error(`The immigration event failed: ${updateError.message}`);
  }

  await setPassengerCandidateStatus(supabase, candidate.id, 'confirmed');
}

export async function dismissPassengerCandidate(candidateId: string): Promise<void> {
  await setPassengerCandidateStatus(supabase, candidateId, 'dismissed');
}
