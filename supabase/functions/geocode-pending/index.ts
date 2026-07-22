// Geocoding worker: resolves places.latitude/longitude for imported trees.
// Invoked every minute by pg_cron (see migration 20260722211000); each run
// processes one bounded batch against OpenStreetMap Nominatim at their
// usage-policy pace (1 req/sec, identifying User-Agent), oldest tree first,
// so any freshly imported tree is fully mapped within hours with no client
// involved. Before paying for a lookup, each place is checked against every
// coordinate any tree has already resolved — imports overlap heavily, so
// most places settle without touching Nominatim at all.
//
// A tick row per minute (geocode_ticks) keeps overlapping invocations from
// doubling the Nominatim rate: the second invocation of the same minute
// fails the insert and exits.

import { createClient } from 'npm:@supabase/supabase-js@2';

const BATCH = 40; // 40 lookups * 1.1s ≈ 44s — inside both the minute and the function wall clock
const DELAY_MS = 1100;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Witness/1.0 (family history app; witnesslives.com; hello@witnesslives.com)';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Most to least specific: full raw string, then trailing parts. */
function geocodeQueries(place: { raw: string; parts: string[] }): string[] {
  const queries = [place.raw];
  for (let i = 1; i < place.parts.length; i++) {
    queries.push(place.parts.slice(i).join(', '));
  }
  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // One worker per minute, even if invoked twice.
  const minute = new Date().toISOString().slice(0, 16);
  const { error: tickError } = await supabase.from('geocode_ticks').insert({ minute });
  if (tickError) {
    return Response.json({ skipped: 'another worker owns this minute' });
  }

  // Oldest tree with pending places goes first, so early importers finish first.
  const { data: pending, error } = await supabase
    .from('places')
    .select('id, raw, parts, tree_id, trees!inner(imported_at)')
    .is('geocoded_at', null)
    .order('imported_at', { referencedTable: 'trees', ascending: true })
    .order('id')
    .limit(BATCH);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!pending || pending.length === 0) return Response.json({ done: 'queue empty' });

  // Free pass: coordinates some tree already resolved for the same string.
  const raws = [...new Set(pending.map((p) => p.raw))];
  const { data: known } = await supabase
    .from('places')
    .select('raw, latitude, longitude')
    .in('raw', raws)
    .not('latitude', 'is', null)
    .limit(raws.length * 4);
  const knownByRaw = new Map<string, { latitude: number; longitude: number }>();
  for (const k of known ?? []) {
    if (!knownByRaw.has(k.raw)) knownByRaw.set(k.raw, k);
  }

  let reused = 0;
  let looked = 0;
  let hits = 0;
  for (const place of pending) {
    if (looked >= BATCH) break; // lookup budget, not place count — misses retry broader queries
    const cached = knownByRaw.get(place.raw);
    if (cached) {
      await supabase
        .from('places')
        .update({
          latitude: cached.latitude,
          longitude: cached.longitude,
          geocoded_at: new Date().toISOString(),
        })
        .eq('id', place.id);
      reused++;
      continue;
    }

    let coords: { latitude: number; longitude: number } | null = null;
    for (const query of geocodeQueries(place)) {
      looked++;
      const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`;
      try {
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (response.ok) {
          const results = await response.json();
          if (Array.isArray(results) && results.length > 0) {
            coords = { latitude: Number(results[0].lat), longitude: Number(results[0].lon) };
          }
        }
      } catch {
        // Network hiccup: leave geocoded_at null so a later run retries.
      }
      await sleep(DELAY_MS);
      if (coords) break;
    }

    if (coords) {
      hits++;
      knownByRaw.set(place.raw, coords);
    }
    // geocoded_at is set hit or miss, so unresolvable hamlets are not retried forever.
    await supabase
      .from('places')
      .update({ ...(coords ?? {}), geocoded_at: new Date().toISOString() })
      .eq('id', place.id);
  }

  return Response.json({ batch: pending.length, reused, lookups: looked, hits });
});
