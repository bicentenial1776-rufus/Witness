import type { PersonRegisterLink, RegisterDef } from './types.js';

/**
 * Map points a register contributes. Two kinds, flagged apart: an entity
 * was here (a regiment's movement — the unit's history, not the person's
 * footprint) versus a person was here (a Variant C save-back with a
 * geocode — a land patent's parcel). Marker style comes from the
 * register's config; the map layer resolves it.
 */
export interface RegisterMapPoint {
  registerKey: string;
  markerStyle: string | null;
  latitude: number;
  longitude: number;
  label: string;
  kind: 'person' | 'entity';
  /** The person the point belongs to (Variant C save-backs), for routing. */
  individualId?: string;
  linkId?: string;
}

interface RecordEventRow {
  latitude: number | null;
  longitude: number | null;
  event_type: string;
  event_year: number | null;
  place_text: string | null;
}

export function pointsFromSavedPayloads(
  links: readonly PersonRegisterLink[],
  registers: ReadonlyMap<string, RegisterDef>,
): RegisterMapPoint[] {
  const points: RegisterMapPoint[] = [];
  for (const link of links) {
    if (link.status !== 'confirmed' || !link.savedPayload) continue;
    const lat = link.savedPayload['latitude'];
    const lng = link.savedPayload['longitude'];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const register = registers.get(link.registerKey);
    points.push({
      registerKey: link.registerKey,
      markerStyle: register?.config.markerStyle ?? null,
      latitude: lat,
      longitude: lng,
      label: link.recordSummary ?? link.recordName ?? register?.displayName ?? link.registerKey,
      kind: 'person',
      individualId: link.individualId,
      linkId: link.id,
    });
  }
  return points;
}

export function pointsFromRecordEvents(
  registerKey: string,
  markerStyle: string | null,
  events: readonly RecordEventRow[],
): RegisterMapPoint[] {
  const points: RegisterMapPoint[] = [];
  for (const event of events) {
    if (event.latitude === null || event.longitude === null) continue;
    points.push({
      registerKey,
      markerStyle,
      latitude: event.latitude,
      longitude: event.longitude,
      label: [event.event_type, event.event_year, event.place_text]
        .filter((p) => p !== null && p !== undefined && p !== '')
        .join(' · '),
      kind: 'entity',
    });
  }
  return points;
}
