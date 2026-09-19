// fsv-keepsakes — what a room's keepsakes hold when the family file has
// nothing of its own: material from the time and place, marked as such.
// (docs/FSV_KEEPSAKES_SEAM.md; Greg's design of 2026-09-16, "Keepsakes
// and tunes": portrait · record · letters · papers · news · place.)
//
// This function answers three of the kinds — the ones that come from
// outside the file:
//
//   news    the news of its day and place   Library of Congress, Chronicling America (1756–1963, US)
//   place   pictures and maps of the place  DPLA (all US), Digital Commonwealth (New England, keyless IIIF)
//   papers  deeds, probate, other papers    Digital Commonwealth first (the only free route to real
//                                           New England probate and deed images), then DPLA
//
// POST { kind: 'news'|'place'|'papers', town: string, state?: string, country?: string, year: number }
//   → { kind, place: { town, state, country }, decade, items: [...], cached: boolean, fetched_at }
//   item: { title, date, image, thumb, url, provider, note: 'from the time' }
//
// The enrichment pattern (sanborn-lookup): cached by (kind, place, decade)
// in fsv_keepsake_cache — never by user; households in the same town and
// decade share one find. One outbound call every two seconds per host,
// across every running copy, through fsv_source_ticks. Every source is
// optional: a source that fails is logged and skipped, never fatal, and
// an empty answer is cached only briefly so a quiet source is re-asked.

import { authenticate, corsHeaders, json } from '../_shared/enrich.ts';

type Kind = 'news' | 'place' | 'papers';
const KINDS: Kind[] = ['news', 'place', 'papers'];
const UA = 'WitnessLives/1.0 (family history app; hello@witnesslives.com)';
const FRESH_DAYS = 180;
const EMPTY_FRESH_DAYS = 7;
const MAX_ITEMS = 8;
const SLOT_MS = 2000;

interface Item {
  title: string;
  date: string | null;
  image: string;
  thumb: string;
  url: string;
  provider: string;
  note: 'from the time';
}

// deno-lint-ignore no-explicit-any
type Admin = any;

// ── The two-second rule ────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Claims this host's next free two-second slot, waiting up to ~12 s. */
async function claimSlot(admin: Admin, host: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const slot = Math.floor(Date.now() / SLOT_MS);
    const { error } = await admin.from('fsv_source_ticks').insert({ host, slot });
    if (!error) return;
    await sleep(SLOT_MS - (Date.now() % SLOT_MS) + 20);
  }
  // Six busy slots in a row: go anyway rather than hang the room.
}

async function politeJson(admin: Admin, url: string, timeoutMs: number): Promise<unknown | null> {
  const host = new URL(url).host;
  await claimSlot(admin, host);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.error(`fsv-keepsakes: ${host} answered ${res.status} for ${url}`);
      return null;
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      console.error(`fsv-keepsakes: ${host} answered non-JSON (a CAPTCHA page under load?)`);
      return null;
    }
  } catch (error) {
    console.error(`fsv-keepsakes: ${host} failed:`, error);
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────
const first = (v: unknown): string | null => (Array.isArray(v) ? (v[0] ?? null) : typeof v === 'string' ? v : null);
const titleCase = (s: string) => s.replace(/\b\w/g, (ch) => ch.toUpperCase());

/** LOC's IIIF thumbnail URL at another width (pct:6.25 → !w,w). */
function iiifAt(url: string, width: number): string {
  return url.replace(/\/full\/[^/]+\/0\/default\.jpg$/, `/full/!${width},${width}/0/default.jpg`);
}

// Digital Commonwealth's geographic facet spells a town the library way:
// "Watertown (Mass.)". Its holdings reach across New England.
const NEW_ENGLAND: Record<string, string> = {
  massachusetts: 'Mass.', maine: 'Me.', 'new hampshire': 'N.H.', vermont: 'Vt.', connecticut: 'Conn.', 'rhode island': 'R.I.',
};

// ── Sources ─────────────────────────────────────────────────────────────

/** Chronicling America through the loc.gov collection API; pages off tile.loc.gov. */
async function fromChroniclingAmerica(admin: Admin, town: string, state: string, decade: number): Promise<Item[]> {
  const from = Math.max(decade, 1756);
  const to = Math.min(decade + 9, 1963);
  if (from >= to) return [];
  const params = new URLSearchParams({ q: town, dates: `${from}/${to}`, dl: 'page', fo: 'json', c: '10', at: 'results' });
  params.set('fa', `location_state:${state.toLowerCase()}`);
  const d = (await politeJson(admin, `https://www.loc.gov/collections/chronicling-america/?${params}`, 45_000)) as {
    results?: { partof_title?: string[]; date?: string; id?: string; image_url?: string[]; title?: string }[];
  } | null;
  return (d?.results ?? [])
    .filter((r) => r.image_url?.[0] && r.id && r.date)
    .slice(0, MAX_ITEMS)
    .map((r) => ({
      title: titleCase(
        (r.partof_title?.[0] ?? 'A period newspaper').replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s*\d{4}-\d{4}\s*$/, '').replace(/\s+/g, ' ').trim(),
      ),
      date: r.date!,
      image: iiifAt(r.image_url![0]!, 1200),
      thumb: iiifAt(r.image_url![0]!, 400),
      url: r.id!.replace(/^http:/, 'https:'),
      provider: 'Library of Congress, Chronicling America',
      note: 'from the time' as const,
    }));
}

/** DPLA: the aggregator over state archives, libraries, NARA, LoC. */
async function fromDpla(admin: Admin, town: string, state: string | null, decade: number, type: 'image' | 'text', q?: string): Promise<Item[]> {
  const key = Deno.env.get('DPLA_API_KEY');
  if (!key) {
    console.error('fsv-keepsakes: DPLA_API_KEY is not set in the function secrets');
    return [];
  }
  const params = new URLSearchParams({
    'sourceResource.spatial.name': town,
    'sourceResource.type': type,
    'sourceResource.date.after': String(decade),
    'sourceResource.date.before': String(decade + 9),
    page_size: '12',
    fields: 'sourceResource.title,sourceResource.date.displayDate,object,isShownAt,provider.name,dataProvider.name',
    api_key: key,
  });
  if (state) params.set('sourceResource.spatial.state', titleCase(state));
  if (q) params.set('q', q);
  const d = (await politeJson(admin, `https://api.dp.la/v2/items?${params}`, 15_000)) as {
    docs?: Record<string, unknown>[];
  } | null;
  return (d?.docs ?? [])
    .filter((doc) => first(doc.object) && first(doc.isShownAt))
    .slice(0, MAX_ITEMS)
    .map((doc) => {
      const data = first(doc['dataProvider.name']);
      const provider = first(doc['provider.name']) ?? 'DPLA';
      return {
        title: first(doc['sourceResource.title']) ?? `${titleCase(town)}${state ? `, ${titleCase(state)}` : ''}`,
        date: first(doc['sourceResource.date.displayDate']),
        image: first(doc.object)!,
        thumb: first(doc.object)!,
        url: first(doc.isShownAt)!,
        provider: data && data !== provider ? `${data} · via DPLA` : `${provider} · via DPLA`,
        note: 'from the time' as const,
      };
    });
}

/**
 * Digital Commonwealth (Boston Public Library's aggregator for
 * Massachusetts and neighbours): keyless search JSON and keyless IIIF
 * images — deeds, probate inventories, maps and views the DPLA feed
 * carries only as records.
 */
async function fromDigitalCommonwealth(
  admin: Admin,
  town: string,
  decade: number,
  kind: 'place' | 'papers',
  /** The geographic facet value for papers: the town, or "<County> (county)" — deeds and probate are county records. */
  facet: string = titleCase(town),
  from = decade,
  to = decade + 9,
): Promise<Item[]> {
  // Papers are found by the geographic FACET (subject_geographic_sim) plus
  // a word for the kind of paper — a plain "Watertown deed" search finds the
  // word, not the town (2026-09-19: 0 for the 1880s by words). Town-level
  // papers are sparse in any one decade; the caller widens to the county
  // (where the registry and the probate court actually sat) and the years.
  const searches = kind === 'papers' ? ['deed', 'probate', 'will', 'inventory'] : [town];
  const want = kind === 'papers' ? /^(documents|manuscripts|objects|correspondence)$/i : /^(maps|photographs|prints|postcards|drawings|paintings)$/i;
  const townLc = town.toLowerCase();
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const q of searches) {
    if (items.length >= MAX_ITEMS) break;
    const params = new URLSearchParams({ per_page: '20', q });
    if (kind === 'papers') params.append('f[subject_geographic_sim][]', facet);
    params.set('range[date_facet_yearly_itim][begin]', String(from));
    params.set('range[date_facet_yearly_itim][end]', String(to));
    const d = (await politeJson(admin, `https://www.digitalcommonwealth.org/search.json?${params}`, 20_000)) as {
      data?: { attributes?: Record<string, unknown> }[];
    } | null;
    for (const row of d?.data ?? []) {
      const a = row.attributes ?? {};
      const genres = (a.genre_basic_ssim as string[] | undefined) ?? [];
      if (!genres.some((g) => want.test(g))) continue;
      const places = ((a.subject_geographic_sim as string[] | undefined) ?? []).map((p) => p.toLowerCase());
      const title = first(a.title_info_primary_tsi) ?? '';
      // The town must be the SUBJECT of a place picture; the title only
      // counts when the record names no place at all, and then as a whole
      // word ("New Ipswich, N.H." is not Ipswich, Mass. — 2026-09-19).
      if (kind === 'place') {
        const named = places.length ? places.includes(townLc) : new RegExp(`(^|[^\\w])${townLc}([^\\w]|$)`, 'i').test(title) && !/\bnew\s+/i.test(title.slice(0, title.toLowerCase().indexOf(townLc)));
        if (!named) continue;
      }
      const imageId = first(a.exemplary_image_ssi);
      const url = first(a.identifier_uri_ss);
      if (!imageId || !url || seen.has(url)) continue;
      seen.add(url);
      items.push({
        title: title || `${titleCase(town)}`,
        date: first(a.date_tsim),
        image: `https://iiif.digitalcommonwealth.org/iiif/2/${imageId}/full/!1200,1200/0/default.jpg`,
        thumb: `https://iiif.digitalcommonwealth.org/iiif/2/${imageId}/full/!400,400/0/default.jpg`,
        url,
        provider: `${first(a.physical_location_ssim) ?? 'Digital Commonwealth'} · Digital Commonwealth`,
        note: 'from the time',
      });
      if (items.length >= MAX_ITEMS) break;
    }
  }
  return items;
}

async function gather(admin: Admin, kind: Kind, town: string, state: string | null, county: string | null, decade: number): Promise<Item[]> {
  const newEngland = !!state && state.toLowerCase() in NEW_ENGLAND;
  const seen = new Set<string>();
  const merge = (lists: Item[][]) => lists.flat().filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true))).slice(0, MAX_ITEMS);
  if (kind === 'news') {
    return state ? await fromChroniclingAmerica(admin, town, state, decade) : [];
  }
  if (kind === 'place') {
    const dc = newEngland ? await fromDigitalCommonwealth(admin, town, decade, 'place') : [];
    const dpla = dc.length >= MAX_ITEMS ? [] : await fromDpla(admin, town, state, decade, 'image');
    return merge([dc, dpla]);
  }
  // Papers: the town in the decade first, then the county (the registry of
  // deeds and the probate court sat at the county seat), then the
  // generation around the decade — before giving up.
  let dc: Item[] = [];
  if (newEngland) {
    const facets = [titleCase(town), ...(county ? [`${titleCase(county.replace(/\s+county$/i, ''))} (county)`] : [])];
    outer: for (const [from, to] of [[decade, decade + 9], [decade - 10, decade + 19], [decade - 20, decade + 29]]) {
      for (const facet of facets) {
        dc = await fromDigitalCommonwealth(admin, town, decade, 'papers', facet, from!, to!);
        if (dc.length) break outer;
      }
    }
  }
  const dpla = dc.length >= MAX_ITEMS ? [] : await fromDpla(admin, town, state, decade, 'text', 'deed OR probate OR will OR inventory');
  return merge([dc, dpla]);
}

// ── The door ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: { kind?: string; town?: string; state?: string | null; county?: string | null; country?: string | null; year?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  const kind = body.kind as Kind;
  const town = body.town?.trim();
  const year = Number(body.year);
  if (!KINDS.includes(kind) || !town || !Number.isFinite(year)) {
    return json(400, { error: 'kind (news|place|papers), town and year are required' });
  }
  const state = body.state?.trim() || null;
  const county = body.county?.trim() || null;
  const country = body.country?.trim() || (state ? 'United States' : null);
  const decade = Math.floor(year / 10) * 10;
  const placeKey = `${town.toLowerCase()}|${(state ?? country ?? '').toLowerCase()}`;

  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  const { data: cached } = await ctx.admin
    .from('fsv_keepsake_cache')
    .select('items, fetched_at')
    .eq('kind', kind)
    .eq('place_key', placeKey)
    .eq('decade', decade)
    .maybeSingle();
  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at as string).getTime();
    const items = cached.items as Item[];
    const freshMs = (items.length ? FRESH_DAYS : EMPTY_FRESH_DAYS) * 24 * 3600 * 1000;
    if (age < freshMs) {
      return json(200, { kind, place: { town, state, country }, decade, items, cached: true, fetched_at: cached.fetched_at });
    }
  }

  const items = await gather(ctx.admin, kind, town, state, county, decade);
  const fetchedAt = new Date().toISOString();
  await ctx.admin.from('fsv_keepsake_cache').upsert({ kind, place_key: placeKey, decade, items, fetched_at: fetchedAt });
  // Housekeeping for the slot table, cheap and occasional.
  if (Math.random() < 0.05) {
    await ctx.admin.from('fsv_source_ticks').delete().lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  }
  return json(200, { kind, place: { town, state, country }, decade, items, cached: false, fetched_at: fetchedAt });
});
