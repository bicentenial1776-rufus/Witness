import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { Database } from '../supabase/database.types.js';
import { fetchAllPages, PAGE_SIZE } from '../supabase/paginate.js';
import { classifyPlace, regionOf } from './regions.js';

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
  country: string | null;
}

export interface GeoEvent {
  individualId: string;
  eventType: Database['public']['Enums']['individual_event_type'];
  year: number | null;
  placeId: string | null;
}

export interface GeoIndividual {
  id: string;
  full_name: string;
  surname: string | null;
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

export interface GeographyIndex {
  places: Map<string, GeoPlace>;
  events: GeoEvent[];
  individuals: Map<string, GeoIndividual>;
  /** Find A Grave memorial URL per individual, where a citation carries one. */
  graveLinks: Map<string, string>;
}

/**
 * Detect by URL, not source title: Ancestry-direct citations sit under a
 * "U.S., Find A Grave Index" source, but FamilySearch-mediated ones carry
 * the same memorial URL under a FamilySearch collection title.
 */
export function isFindAGraveUrl(url: string): boolean {
  return /findagrave\.com/i.test(url);
}

export async function fetchGeographyIndex(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<GeographyIndex> {
  const [placeRows, eventRows, individualRows, graveRows, confirmedRows] = await Promise.all([
    fetchAllPages<Omit<GeoPlace, 'region' | 'country'>>(
      (after) => {
        let q = client
          .from('places')
          .select('id, raw, parts, latitude, longitude')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching places failed',
    ),
    fetchAllPages<{ id: string; individual_id: string; event_type: GeoEvent['eventType']; date_year: number | null; place_id: string | null }>(
      (after) => {
        let q = client
          .from('individual_events')
          .select('id, individual_id, event_type, date_year, place_id')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching events failed',
    ),
    fetchAllPages<GeoIndividual>(
      (after) => {
        let q = client
          .from('individuals')
          .select('id, full_name, surname, birth_year, death_year, living')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching individuals failed',
    ),
    // Filtered server-side: a tree's citations run to the tens of thousands,
    // but only the Find A Grave ones matter here. A failure yields an index
    // without links, never a broken map.
    fetchAllPages<{ id: string; individual_id: string | null; url: string | null }>(
      (after) => {
        let q = client
          .from('citations')
          .select('id, individual_id, url')
          .eq('tree_id', treeId)
          .not('individual_id', 'is', null)
          .ilike('url', '%findagrave.com%')
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching grave links failed',
    ).catch(() => [] as { id: string; individual_id: string | null; url: string | null }[]),
    // The user's own confirmed memorials — they override imported citations.
    fetchAllPages<{ id: string; individual_id: string; url: string }>(
      (after) => {
        let q = client
          .from('grave_confirmations')
          .select('id, individual_id, url')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching grave confirmations failed',
    ).catch(() => [] as { id: string; individual_id: string; url: string }[]),
  ]);

  const places = new Map<string, GeoPlace>();
  for (const row of placeRows)
    places.set(row.id, { ...row, region: regionOf(row.parts), country: classifyPlace(row.parts).country });

  const events: GeoEvent[] = eventRows.map((row) => ({
    individualId: row.individual_id,
    eventType: row.event_type,
    year: row.date_year,
    placeId: row.place_id,
  }));

  const individuals = new Map<string, GeoIndividual>();
  for (const row of individualRows) individuals.set(row.id, row);

  // Ancestry attaches the same memorial citation to every fact it touched —
  // one link per person is the whole story.
  const graveLinks = new Map<string, string>();
  for (const row of graveRows) {
    if (row.individual_id && row.url && !graveLinks.has(row.individual_id)) {
      graveLinks.set(row.individual_id, row.url);
    }
  }
  // A personally confirmed memorial beats the imported citation's claim.
  for (const row of confirmedRows) graveLinks.set(row.individual_id, row.url);

  return { places, events, individuals, graveLinks };
}

// Event-type vocabulary ------------------------------------------------------

export type GeoEventType = GeoEvent['eventType'];

/**
 * The reader-facing vocabulary for event types, in life order (birth →
 * burial). `custom` is the GEDCOM EVEN bucket — christenings, draft cards,
 * anything without its own tag — so it reads as "Other", last.
 */
export const EVENT_TYPE_ORDER: GeoEventType[] = [
  'birth',
  'baptism',
  'residence',
  'census',
  'occupation',
  'military',
  'immigration',
  'emigration',
  'naturalization',
  'death',
  'burial',
  'probate',
  'custom',
];

export const EVENT_TYPE_LABELS: Record<GeoEventType, string> = {
  birth: 'Birth',
  baptism: 'Baptism',
  residence: 'Residence',
  census: 'Census',
  occupation: 'Occupation',
  military: 'Military',
  immigration: 'Immigration',
  emigration: 'Emigration',
  naturalization: 'Naturalization',
  death: 'Death',
  burial: 'Burial',
  probate: 'Probate',
  custom: 'Other',
};

/** Accepts plain strings too — some rows type event_type loosely. */
export function eventTypeLabel(type: string): string {
  return (
    EVENT_TYPE_LABELS[type as GeoEventType] ??
    (type ? type.charAt(0).toUpperCase() + type.slice(1) : type)
  );
}

/** Event types actually present in a set of nearby results, in life order. */
export function eventTypesOf(places: NearbyPlace[]): GeoEventType[] {
  const present = new Set<GeoEventType>();
  for (const hit of places)
    for (const resident of hit.residents)
      for (const event of resident.events) present.add(event.eventType);
  return EVENT_TYPE_ORDER.filter((type) => present.has(type));
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

/** Everyone with a life event at one specific place. */
export function ancestorsAtPlace(index: GeographyIndex, placeId: string): RegionResident[] {
  const place = index.places.get(placeId);
  if (!place) return [];
  const byIndividual = new Map<string, ResidentEvent[]>();
  for (const event of index.events) {
    if (event.placeId !== placeId) continue;
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
  return residents;
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

  return hits.map(({ place, distanceKm }) => ({
    place,
    distanceKm,
    residents: ancestorsAtPlace(index, place.id),
  }));
}

// Lived near ----------------------------------------------------------------

const MILES_PER_KM = 0.621371;

export interface LivedNearNeighbor {
  individual: GeoIndividual;
  /** Nearest qualifying place, rounded to whole miles. */
  distanceMiles: number;
  /** The place that put them within reach. */
  placeRaw: string;
}

/**
 * Assumed lifespan when one endpoint is undocumented — the same figure the
 * alive-during engine uses (aliveDuring.ts), so "lived near" and "alive
 * during" never disagree about who counts as a contemporary.
 */
const ASSUMED_LIFESPAN_YEARS = 90;

function lifespanOf(person: GeoIndividual): { start: number; end: number } | null {
  const start =
    person.birth_year ??
    (person.death_year !== null ? person.death_year - ASSUMED_LIFESPAN_YEARS : null);
  const end =
    person.death_year ??
    (person.birth_year !== null ? person.birth_year + ASSUMED_LIFESPAN_YEARS : null);
  if (start === null || end === null) return null;
  return { start, end };
}

/** Birth anchors best; baptism stands in for it; a residence beats
    an arbitrary event; any geocoded event beats nothing. */
const ANCHOR_PREFERENCE: readonly GeoEventType[] = ['birth', 'baptism', 'residence'];

function anchorPlaceOf(index: GeographyIndex, individualId: string): GeoPlace | null {
  let fallback: GeoPlace | null = null;
  let bestRank = Number.MAX_SAFE_INTEGER;
  let best: GeoPlace | null = null;
  for (const event of index.events) {
    if (event.individualId !== individualId || !event.placeId) continue;
    const place = index.places.get(event.placeId);
    if (!place || place.latitude === null || place.longitude === null) continue;
    const rank = ANCHOR_PREFERENCE.indexOf(event.eventType);
    if (rank !== -1 && rank < bestRank) {
      bestRank = rank;
      best = place;
    }
    if (!fallback) fallback = place;
  }
  return best ?? fallback;
}

/**
 * Contemporaries with a documented event within `radiusMiles` of the
 * subject's own anchor place. Immediate family arrives via `excludeIds`
 * (the caller already holds the register), the living are left out, and
 * lifespans must overlap — an undocumented death gets the assumed
 * lifespan, so a neighbor two centuries later never reads as a neighbor.
 * Each person appears once, at their nearest qualifying place.
 */
export function livedNear(
  index: GeographyIndex,
  subjectId: string,
  options: { radiusMiles?: number; excludeIds?: ReadonlySet<string>; cap?: number } = {},
): LivedNearNeighbor[] {
  const { radiusMiles = 25, excludeIds, cap = 8 } = options;
  const subject = index.individuals.get(subjectId);
  if (!subject) return [];
  const subjectSpan = lifespanOf(subject);
  if (!subjectSpan) return [];
  const anchor = anchorPlaceOf(index, subjectId);
  if (!anchor) return [];

  const near = nearbyAncestors(index, {
    latitude: anchor.latitude!,
    longitude: anchor.longitude!,
    radiusKm: radiusMiles / MILES_PER_KM,
  });

  // nearbyAncestors returns places nearest-first, so the first sighting of
  // a person is already their closest qualifying place.
  const best = new Map<string, LivedNearNeighbor>();
  for (const hit of near) {
    for (const resident of hit.residents) {
      const person = resident.individual;
      if (person.id === subjectId || excludeIds?.has(person.id) || person.living) continue;
      if (best.has(person.id)) continue;
      const span = lifespanOf(person);
      if (!span || span.start > subjectSpan.end || subjectSpan.start > span.end) continue;
      best.set(person.id, {
        individual: person,
        distanceMiles: Math.round(hit.distanceKm * MILES_PER_KM),
        placeRaw: hit.place.raw,
      });
    }
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        a.distanceMiles - b.distanceMiles ||
        a.individual.full_name.localeCompare(b.individual.full_name),
    )
    .slice(0, cap);
}

// Map support --------------------------------------------------------------

export interface PlaceActivity {
  place: GeoPlace;
  /** Events at this place inside the era window. */
  eventCount: number;
}

/**
 * Geocoded places with at least one event in the era window, busiest
 * first — the map's marker source. Events without a year only count
 * when no era filter is applied.
 */
export function placesWithActivity(
  index: GeographyIndex,
  era?: { startYear: number; endYear: number },
): PlaceActivity[] {
  const counts = new Map<string, number>();
  for (const event of index.events) {
    if (!event.placeId) continue;
    if (era && (event.year === null || event.year < era.startYear || event.year > era.endYear)) continue;
    counts.set(event.placeId, (counts.get(event.placeId) ?? 0) + 1);
  }
  const result: PlaceActivity[] = [];
  for (const [placeId, eventCount] of counts) {
    const place = index.places.get(placeId);
    if (!place || place.latitude === null || place.longitude === null) continue;
    result.push({ place, eventCount });
  }
  result.sort((a, b) => b.eventCount - a.eventCount);
  return result;
}
