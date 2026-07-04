import type { WitnessSupabaseClient } from '../supabase/client.js';

/**
 * Geocoding pipeline: populates places.latitude/longitude via OpenStreetMap
 * Nominatim. Respects the usage policy — one request per second, identifying
 * User-Agent — so a full tree (thousands of places) is an hour-plus batch
 * job, not an interactive call. Every attempted place gets geocoded_at set,
 * hit or miss, so re-runs only try places never attempted before.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_DELAY_MS = 1100;
const DEFAULT_USER_AGENT = 'Witness/0.1 (family history app; witnesslives.com)';
const PAGE_SIZE = 1000;

export interface GeocodeProgress {
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  current: string;
}

export interface GeocodeOptions {
  delayMs?: number;
  userAgent?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  onProgress?: (progress: GeocodeProgress) => void;
  /** Stop after this many places (for partial/testing runs). */
  limit?: number;
}

export interface GeocodeResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

interface PlaceRow {
  id: string;
  raw: string;
  parts: string[];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Query strings from most to least specific: the full raw string, then the
 * trailing parts. Small hamlets and misspelled townships often only resolve
 * at county or state level — a coarse point still beats no point for
 * radius search.
 */
export function geocodeQueries(place: { raw: string; parts: string[] }): string[] {
  const queries = [place.raw];
  for (let drop = 1; place.parts.length - drop >= 2; drop++) {
    queries.push(place.parts.slice(drop).join(', '));
  }
  return [...new Set(queries)];
}

async function lookup(
  query: string,
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`;
  const response = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok) throw new Error(`Nominatim ${response.status} for "${query}"`);
  const results = (await response.json()) as { lat: string; lon: string }[];
  const first = results[0];
  if (!first) return null;
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export async function geocodeTreePlaces(
  client: WitnessSupabaseClient,
  treeId: string,
  options: GeocodeOptions = {},
): Promise<GeocodeResult> {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const fetchImpl = options.fetchImpl ?? fetch;

  const pending: PlaceRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('places')
      .select('id, raw, parts')
      .eq('tree_id', treeId)
      .is('geocoded_at', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Fetching ungeocoded places failed: ${error.message}`);
    pending.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const targets = options.limit ? pending.slice(0, options.limit) : pending;
  let succeeded = 0;
  let failed = 0;

  for (const [i, place] of targets.entries()) {
    let coords: { latitude: number; longitude: number } | null = null;
    for (const query of geocodeQueries(place)) {
      coords = await lookup(query, fetchImpl, userAgent);
      await sleep(delayMs);
      if (coords) break;
    }

    const { error } = await client
      .from('places')
      .update({
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        geocoded_at: new Date().toISOString(),
      })
      .eq('id', place.id);
    if (error) throw new Error(`Updating place "${place.raw}" failed: ${error.message}`);

    if (coords) succeeded++;
    else failed++;
    options.onProgress?.({
      processed: i + 1,
      total: targets.length,
      succeeded,
      failed,
      current: place.raw,
    });
  }

  return { attempted: targets.length, succeeded, failed };
}
