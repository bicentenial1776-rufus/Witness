import type { WitnessSupabaseClient } from '../supabase/client.js';
import { regionOf } from './regions.js';

/**
 * Geographic queries load the tree's places, events, and individuals once
 * into an in-memory index, then answer rollups, region lookups, and radius
 * searches off that index. At genealogy scale (thousands of rows, not
 * millions) this keeps every follow-up query instant and the region logic
 * in one testable place.
 */

export interface GeoPlace {
  id: string;
  raw: string;
  parts: string[];
  latitude: number | null;
  longitude: number | null;
  region: string | null;
}

export interface GeoEvent {
  individualId: string;
  eventType: 'birth' | 'death' | 'burial' | 'residence' | 'military';
  year: number | null;
  placeId: string | null;
}

export interface GeoIndividual {
  id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
}

export interface GeographyIndex {
  places: Map<string, GeoPlace>;
  events: GeoEvent[];
  individuals: Map<string, GeoIndividual>;
}

const PAGE_SIZE = 1000;

async function fetchAll<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Fetching ${label} failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function fetchGeographyIndex(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<GeographyIndex> {
  const [placeRows, eventRows, individualRows] = await Promise.all([
    fetchAll<Omit<GeoPlace, 'region'>>(
      (from, to) =>
        client
          .from('places')
          .select('id, raw, parts, latitude, longitude')
          .eq('tree_id', treeId)
          .order('id')
          .range(from, to),
      'places',
    ),
    fetchAll<{ individual_id: string; event_type: GeoEvent['eventType']; date_year: number | null; place_id: string | null }>(
      (from, to) =>
        client
          .from('individual_events')
          .select('individual_id, event_type, date_year, place_id')
          .eq('tree_id', treeId)
          .order('id')
          .range(from, to),
      'events',
    ),
    fetchAll<GeoIndividual>(
      (from, to) =>
        client
          .from('individuals')
          .select('id, full_name, birth_year, death_year')
          .eq('tree_id', treeId)
          .order('id')
          .range(from, to),
      'individuals',
    ),
  ]);

  const places = new Map<string, GeoPlace>();
  for (const row of placeRows) places.set(row.id, { ...row, region: regionOf(row.parts) });

  const events: GeoEvent[] = eventRows.map((row) => ({
    individualId: row.individual_id,
    eventType: row.event_type,
    year: row.date_year,
    placeId: row.place_id,
  }));

  const individuals = new Map<string, GeoIndividual>();
  for (const row of individualRows) individuals.set(row.id, row);

  return { places, events, individuals };
}

// Rollups ------------------------------------------------------------------

export interface RegionRollup {
  region: string;
  individualCount: number;
  placeCount: number;
}

/** Distinct regions with how many ancestors had a life event there. */
export function regionRollups(index: GeographyIndex): RegionRollup[] {
  const individualsByRegion = new Map<string, Set<string>>();
  const placesByRegion = new Map<string, Set<string>>();

  for (const place of index.places.values()) {
    if (!place.region) continue;
    if (!placesByRegion.has(place.region)) placesByRegion.set(place.region, new Set());
    placesByRegion.get(place.region)!.add(place.id);
  }
  for (const event of index.events) {
    if (!event.placeId) continue;
    const region = index.places.get(event.placeId)?.region;
    if (!region) continue;
    if (!individualsByRegion.has(region)) individualsByRegion.set(region, new Set());
    individualsByRegion.get(region)!.add(event.individualId);
  }

  return [...individualsByRegion.entries()]
    .map(([region, ids]) => ({
      region,
      individualCount: ids.size,
      placeCount: placesByRegion.get(region)?.size ?? 0,
    }))
    .sort((a, b) => b.individualCount - a.individualCount || a.region.localeCompare(b.region));
}

// Region residents ----------------------------------------------------------

export interface ResidentEvent {
  eventType: GeoEvent['eventType'];
  year: number | null;
  placeRaw: string;
}

export interface RegionResident {
  individual: GeoIndividual;
  events: ResidentEvent[];
}

/** Everyone with a life event in a region, earliest-connected first. */
export function ancestorsInRegion(index: GeographyIndex, region: string): RegionResident[] {
  const byIndividual = new Map<string, ResidentEvent[]>();
  for (const event of index.events) {
    if (!event.placeId) continue;
    const place = index.places.get(event.placeId);
    if (!place || place.region !== region) continue;
    if (!byIndividual.has(event.individualId)) byIndividual.set(event.individualId, []);
    byIndividual.get(event.individualId)!.push({
      eventType: event.eventType,
      year: event.year,
      placeRaw: place.raw,
    });
  }

  const residents: RegionResident[] = [];
  for (const [individualId, events] of byIndividual) {
    const individual = index.individuals.get(individualId);
    if (!individual) continue;
    events.sort((a, b) => (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER));
    residents.push({ individual, events });
  }

  const earliest = (r: RegionResident) =>
    r.events.find((e) => e.year !== null)?.year ?? Number.MAX_SAFE_INTEGER;
  residents.sort((a, b) => earliest(a) - earliest(b) || a.individual.full_name.localeCompare(b.individual.full_name));
  return residents;
}

// Radius search --------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface NearbyOptions {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export interface NearbyPlace {
  place: GeoPlace;
  distanceKm: number;
  residents: RegionResident[];
}

/**
 * Geocoded places within the radius, nearest first, each with the
 * ancestors who had a life event there. Requires the geocoding pipeline
 * to have populated lat/lng; ungeocoded places are simply not searchable.
 */
export function nearbyAncestors(index: GeographyIndex, options: NearbyOptions): NearbyPlace[] {
  const { latitude, longitude, radiusKm } = options;

  const hits: { place: GeoPlace; distanceKm: number }[] = [];
  for (const place of index.places.values()) {
    if (place.latitude === null || place.longitude === null) continue;
    const distanceKm = haversineKm(latitude, longitude, place.latitude, place.longitude);
    if (distanceKm <= radiusKm) hits.push({ place, distanceKm });
  }
  hits.sort((a, b) => a.distanceKm - b.distanceKm);

  return hits.map(({ place, distanceKm }) => {
    const byIndividual = new Map<string, ResidentEvent[]>();
    for (const event of index.events) {
      if (event.placeId !== place.id) continue;
      if (!byIndividual.has(event.individualId)) byIndividual.set(event.individualId, []);
      byIndividual.get(event.individualId)!.push({
        eventType: event.eventType,
        year: event.year,
        placeRaw: place.raw,
      });
    }
    const residents: RegionResident[] = [];
    for (const [individualId, events] of byIndividual) {
      const individual = index.individuals.get(individualId);
      if (individual) residents.push({ individual, events });
    }
    residents.sort((a, b) => a.individual.full_name.localeCompare(b.individual.full_name));
    return { place, distanceKm, residents };
  });
}
