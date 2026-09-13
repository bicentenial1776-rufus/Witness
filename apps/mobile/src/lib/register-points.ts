import {
  fetchActiveRegisters,
  fetchRegisterLinksForTree,
  pointsFromRecordEvents,
  pointsFromSavedPayloads,
  type RegisterMapPoint,
} from '@witness/core/registers';

import { supabase } from '@/lib/supabase';

/**
 * The record books on the map: every confirmed register link with a
 * geocode — a veterans' cemetery or a land parcel from a save-back
 * (kind 'person': the record placed the person here), and the dated,
 * placed events of a confirmed entity, a regiment's engagements (kind
 * 'entity': the regiment was there; the person probably was). Labelled
 * with the person's name so a marker reads "Charles Howe — Lakeside
 * Cemetery", never a bare record. Failures return nothing: the map's
 * own places never wait on this layer.
 */
export interface RecordMapPoint extends RegisterMapPoint {
  personName: string;
  /** For entity points: the record the events belong to ("25th Massachusetts Infantry"). */
  recordName?: string | null;
}

const MAX_EVENTS_PER_RECORD = 40;

export async function fetchRecordMapPoints(treeId: string): Promise<RecordMapPoint[]> {
  try {
    const [registers, links] = await Promise.all([
      fetchActiveRegisters(supabase),
      fetchRegisterLinksForTree(supabase, treeId),
    ]);
    const confirmed = links.filter((l) => l.status === 'confirmed' || l.status === 'parsed_from_gedcom');
    const points: RecordMapPoint[] = pointsFromSavedPayloads(confirmed, registers).map((p) => ({ ...p, personName: '' }));

    // Entity events: one fetch for every confirmed record id, then one
    // point per event per person who confirmed that entity.
    const withRecord = confirmed.filter((l) => l.recordId !== null);
    if (withRecord.length > 0) {
      const recordIds = [...new Set(withRecord.map((l) => l.recordId!))];
      const { data: events } = await supabase
        .from('register_record_events')
        .select('record_id, event_type, event_year, place_text, latitude, longitude')
        .in('record_id', recordIds)
        .not('latitude', 'is', null)
        .order('event_year', { ascending: true });
      const byRecord = new Map<string, NonNullable<typeof events>>();
      for (const e of events ?? []) {
        const list = byRecord.get(e.record_id) ?? [];
        if (list.length < MAX_EVENTS_PER_RECORD) list.push(e);
        byRecord.set(e.record_id, list);
      }
      for (const link of withRecord) {
        const register = registers.get(link.registerKey);
        const rows = byRecord.get(link.recordId!) ?? [];
        for (const p of pointsFromRecordEvents(link.registerKey, register?.config.markerStyle ?? null, rows)) {
          points.push({ ...p, individualId: link.individualId, linkId: link.id, personName: '', recordName: link.recordName });
        }
      }
    }
    if (points.length === 0) return [];

    const ids = [...new Set(points.map((p) => p.individualId).filter((id): id is string => Boolean(id)))];
    const { data } = await supabase.from('individuals').select('id, full_name').in('id', ids);
    const names = new Map((data ?? []).map((row) => [row.id, row.full_name]));
    return points.map((p) => ({
      ...p,
      personName: (p.individualId && names.get(p.individualId)) || 'An ancestor',
    }));
  } catch {
    return [];
  }
}
