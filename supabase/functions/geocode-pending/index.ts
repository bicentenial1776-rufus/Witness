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

import { requireCronSecret } from '../_shared/cron.ts';

const BATCH = 40; // 40 lookups * 1.1s ≈ 44s — inside both the minute and the function wall clock
const DELAY_MS = 1100;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Witness/1.0 (family history app; witnesslives.com; hello@witnesslives.com)';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Umbrella terms no modern gazetteer indexes; dropping them leaves the
// resolvable anchors ("Wenham, Essex, Massachusetts Bay, British Colonial
// America" → "Wenham, Essex, Massachusetts").
const DROP_TERMS = new Set([
  'colonial america',
  'british colonial america',
  'british america',
  'north america',
  'new england',
  'new france',
  'acadia',
  'america',
]);

// Historical entities with a clean modern equivalent.
const MODERN_NAME: Record<string, string> = {
  'massachusetts bay': 'Massachusetts',
  'massachusetts bay colony': 'Massachusetts',
  'province of massachusetts': 'Massachusetts',
  'province of massachusetts bay': 'Massachusetts',
  'plymouth colony': 'Massachusetts',
  'province of maine': 'Maine',
  'province of new hampshire': 'New Hampshire',
  'connecticut colony': 'Connecticut',
  'colony of connecticut': 'Connecticut',
  'province of new york': 'New York',
  'new netherland': 'New York',
  'province of pennsylvania': 'Pennsylvania',
  'upper canada': 'Ontario',
  'lower canada': 'Quebec',
  'canada west': 'Ontario',
  'canada east': 'Quebec',
};

// Misspellings observed in real GEDCOM place strings.
const RESPELL: Record<string, string> = {
  massachusettes: 'Massachusetts',
  massachusets: 'Massachusetts',
  worchester: 'Worcester',
  conneticut: 'Connecticut',
  pensylvania: 'Pennsylvania',
  virgina: 'Virginia',
  blddeford: 'Biddeford',
  quebeck: 'Quebec',
};

function normalizePart(part: string): string | null {
  let p = part.trim();
  // Narrative tails: "United States. Arrived in New England in 1635".
  // The length guard keeps abbreviations ("St. Gregoire") intact.
  const sentences = p.split(/\.\s+/);
  if (sentences.length > 1 && sentences[0].length >= 4) p = sentences[0];
  p = p.replace(/\.+$/, '').trim();
  for (const [typo, fix] of Object.entries(RESPELL)) {
    p = p.replace(new RegExp(`\\b${typo}\\b`, 'gi'), fix);
  }
  const key = p.toLowerCase();
  if (DROP_TERMS.has(key)) return null;
  if (MODERN_NAME[key]) return MODERN_NAME[key];
  return p || null;
}

/**
 * Most to least specific: full string, then trailing parts — first on the
 * string as written, and again on a normalized copy that strips colonial
 * umbrella terms, modernizes historical entities, and fixes known typos.
 * When normalization changed anything, its queries go first: a dirty raw
 * string has already proven it won't match.
 */
function geocodeQueries(place: { raw: string; parts: string[] }): string[] {
  const original = [place.raw];
  for (let i = 1; i < place.parts.length; i++) {
    original.push(place.parts.slice(i).join(', '));
  }

  const cleaned = (place.parts.length ? place.parts : [place.raw])
    .map(normalizePart)
    .filter((p): p is string => p !== null);
  const rescue: string[] = [];
  if (cleaned.length > 0) {
    rescue.push(cleaned.join(', '));
    // Town + region, skipping middle parts ("Portsmouth, Rockingham, New
    // Hampshire" also as "Portsmouth, New Hampshire").
    if (cleaned.length > 2) rescue.push(`${cleaned[0]}, ${cleaned[cleaned.length - 1]}`);
    for (let i = 1; i < cleaned.length; i++) {
      rescue.push(cleaned.slice(i).join(', '));
    }
  }

  const changed = rescue.length > 0 && rescue[0] !== place.raw;
  const ordered = changed ? [...rescue, ...original] : [...original, ...rescue];
  return [...new Set(ordered.map((q) => q.trim()).filter(Boolean))].slice(0, 8);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const denied = requireCronSecret(req);
  if (denied) return denied;

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

    // Defer rather than half-try: a miss is only stamped after the full
    // query ladder, so it must fit inside this minute's lookup budget.
    const queries = geocodeQueries(place);
    if (looked + queries.length > BATCH) break;

    let coords: { latitude: number; longitude: number } | null = null;
    // Only a lookup Nominatim actually ANSWERED can prove a miss. A thrown
    // fetch or a non-2xx (outage, rate limit) leaves the place unstamped so
    // a later run retries — an outage once burned a whole batch as
    // permanent no-coordinate "successes."
    let unanswered = false;
    for (const query of queries) {
      looked++;
      const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`;
      try {
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (response.ok) {
          const results = await response.json();
          if (Array.isArray(results) && results.length > 0) {
            coords = { latitude: Number(results[0].lat), longitude: Number(results[0].lon) };
          }
        } else {
          unanswered = true;
        }
      } catch {
        unanswered = true;
      }
      await sleep(DELAY_MS);
      if (coords) break;
    }

    if (coords) {
      hits++;
      knownByRaw.set(place.raw, coords);
    }
    // geocoded_at is set on a hit or an ANSWERED miss, so unresolvable
    // hamlets are not retried forever — but an unanswered ladder stays
    // pending for the next run.
    if (coords || !unanswered) {
      await supabase
        .from('places')
        .update({ ...(coords ?? {}), geocoded_at: new Date().toISOString() })
        .eq('id', place.id);
    }
  }

  return Response.json({ batch: pending.length, reused, lookups: looked, hits });
});
