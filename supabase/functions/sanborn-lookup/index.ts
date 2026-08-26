// sanborn-lookup: town + state (+ optional target year) → the Sanborn
// fire-insurance map editions LOC holds for that town, with the edition
// closest to the year called out. The Street View sourcing prototype:
// a Sanborn sheet carries building footprints, materials, and stories
// for the family address in the decade they lived there.
//
// POST { city: string, state: string, year?: number }
//   → { place, editions: [...], closest: {...}|null, cached: boolean }
//
// LOC's API is keyless but rate-limited (20 req/min, hour-long blocks,
// occasional CAPTCHA pages under load) — so every town's editions are
// cached in sanborn_place_cache and refreshed at most twice a year.
// If the cache table doesn't exist yet (migration not applied), the
// function still answers from LOC directly — it just can't remember.

import { authenticate, corsHeaders, json } from '../_shared/enrich.ts';

const LOC_URL = 'https://www.loc.gov/collections/sanborn-maps/';
const UA = 'WitnessLives/1.0 (hello@witnesslives.com)';
const CACHE_FRESH_DAYS = 180;
const MAX_EDITIONS = 60;

const STATE_NAMES: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california',
  co: 'colorado', ct: 'connecticut', de: 'delaware', dc: 'district of columbia',
  fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois',
  in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky', la: 'louisiana',
  me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan',
  mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana',
  ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey',
  nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota',
  oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania',
  ri: 'rhode island', sc: 'south carolina', sd: 'south dakota',
  tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia',
  wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
};

interface Edition {
  item_id: string | null;
  item_url: string;
  title: string;
  /** The town the edition actually names (may differ: Rumford Falls for Rumford). */
  place: string | null;
  date: string | null;
  year: number | null;
  /** Digitized sheet count; null when LOC lists no files (the 1923–30 copyright gap). */
  sheets: number | null;
  thumb: string | null;
}

function normalizeState(raw: string): string {
  const s = raw.trim().toLowerCase();
  return STATE_NAMES[s] ?? s;
}

interface LocResult {
  id?: string;
  title?: string;
  date?: string;
  location?: string[];
  image_url?: string[];
  resources?: { files?: number }[];
}

/** "North Rumford" → "Rumford": directional qualifiers name neighborhoods
    on the user's side and separate volumes on LOC's side — the core name
    is the join. ("Westbrook" keeps its West; only a leading word drops.) */
function coreTown(city: string): string {
  return city.trim().replace(/^(north|south|east|west)\s+/i, '');
}

function parseEditions(results: LocResult[], city: string, state: string): Edition[] {
  const cityLc = coreTown(city).toLowerCase();
  const editions: Edition[] = [];
  for (const r of results) {
    const title = r.title ?? '';
    // Only true Sanborn edition items; the collection search can surface
    // essays and related pages.
    if (!/^sanborn fire insurance map from /i.test(title)) continue;
    const locs = (r.location ?? []).map((l) => l.toLowerCase());
    if (!locs.includes(state)) continue;
    // The location facet lists every town a volume touches (Rumford's
    // volumes also list Mexico), so the title's own town is the anchor.
    // Match the asked-for name as whole words anywhere in it: "Rumford"
    // takes Rumford Falls, "Paris" takes South Paris and West Paris.
    const placeMatch = /from ([^,]+),/i.exec(title);
    const place = placeMatch ? placeMatch[1].trim() : null;
    const cityRe = new RegExp(`\\b${cityLc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (place && !cityRe.test(place)) continue;
    const year = r.date ? Number.parseInt(r.date.slice(0, 4), 10) : NaN;
    editions.push({
      item_id: /\/item\/([^/]+)/.exec(r.id ?? '')?.[1] ?? null,
      item_url: r.id ?? '',
      title,
      place,
      date: r.date ?? null,
      year: Number.isFinite(year) ? year : null,
      sheets: r.resources?.[0]?.files ?? null,
      thumb: r.image_url?.[0] ?? null,
    });
  }
  editions.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  return editions.slice(0, MAX_EDITIONS);
}

async function fetchFromLoc(city: string, state: string): Promise<Edition[] | Response> {
  const params = new URLSearchParams({
    fo: 'json',
    c: '100',
    q: `"${coreTown(city)}"`,
    fa: `location:${state}`,
  });
  const res = await fetch(`${LOC_URL}?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) {
    return json(503, { error: 'The Library of Congress is asking us to slow down — try again in a minute.' });
  }
  if (!res.ok) return json(502, { error: `The Library of Congress answered ${res.status}.` });
  const text = await res.text();
  let data: { results?: LocResult[] };
  try {
    data = JSON.parse(text);
  } catch {
    // Under load LOC serves an HTML CAPTCHA page in place of JSON.
    return json(503, { error: 'The Library of Congress is busy — try again shortly.' });
  }
  return parseEditions(data.results ?? [], city, state);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: { city?: string; state?: string; year?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  const city = body.city?.trim();
  if (!city || !body.state?.trim()) return json(400, { error: 'city and state are required' });
  const state = normalizeState(body.state);
  const placeKey = `${city.toLowerCase()}|${state}`;

  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  // The cache first; a missing table (migration not yet applied) just
  // means we answer live and forget.
  let cacheOk = true;
  let editions: Edition[] | null = null;
  const { data: cached, error: cacheError } = await ctx.admin
    .from('sanborn_place_cache')
    .select('editions, fetched_at')
    .eq('place_key', placeKey)
    .maybeSingle();
  if (cacheError) cacheOk = false;
  const freshMs = CACHE_FRESH_DAYS * 24 * 3600 * 1000;
  let cacheHit = false;
  // An empty cached answer is never trusted long — it may be a transient
  // miss (or an old filter bug), and re-asking LOC for a quiet town is cheap.
  if (
    cached &&
    (cached.editions as Edition[]).length > 0 &&
    Date.now() - new Date(cached.fetched_at as string).getTime() < freshMs
  ) {
    editions = cached.editions as Edition[];
    cacheHit = true;
  }

  if (!editions) {
    const fetched = await fetchFromLoc(city, state);
    if (fetched instanceof Response) return fetched;
    editions = fetched;
    if (cacheOk) {
      await ctx.admin.from('sanborn_place_cache').upsert({
        place_key: placeKey,
        city,
        state,
        editions,
        edition_count: editions.length,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  // The edition nearest the asked-for year; earlier wins a tie — the town
  // as it was, not as it was about to become.
  let closest: Edition | null = null;
  if (body.year && editions.length) {
    closest = editions.reduce((best, e) => {
      if (e.year === null) return best;
      if (!best || best.year === null) return e;
      const d = Math.abs(e.year - body.year!);
      const bd = Math.abs(best.year - body.year!);
      return d < bd || (d === bd && e.year < best.year) ? e : best;
    }, null as Edition | null);
  }

  return json(200, {
    place: { city, state },
    editions,
    closest,
    cached: cacheHit,
    attribution: 'Library of Congress, Geography and Map Division, Sanborn Maps Collection',
  });
});
