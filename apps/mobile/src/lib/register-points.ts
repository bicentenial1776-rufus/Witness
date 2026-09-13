import {
  fetchActiveRegisters,
  fetchRegisterLinksForTree,
  pointsFromSavedPayloads,
  type RegisterMapPoint,
} from '@witness/core/registers';

import { supabase } from '@/lib/supabase';

/**
 * The record books on the map: every confirmed register link whose
 * save-back carries a geocode — a veterans' cemetery, a land parcel —
 * as a point the Ancestor Map can draw beside the tree's own places.
 * Labelled with the person's name so the marker reads as "Charles Howe —
 * Lakeside Cemetery", not as a bare record. Failures return nothing: the
 * map's own places never wait on this layer.
 */
export interface RecordMapPoint extends RegisterMapPoint {
  personName: string;
}

export async function fetchRecordMapPoints(treeId: string): Promise<RecordMapPoint[]> {
  try {
    const [registers, links] = await Promise.all([
      fetchActiveRegisters(supabase),
      fetchRegisterLinksForTree(supabase, treeId),
    ]);
    const points = pointsFromSavedPayloads(links, registers);
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
