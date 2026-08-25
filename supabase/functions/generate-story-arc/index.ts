// generate-story-arc: one founder-to-home-person descent narrative — the
// Home lead's daily story. The chain, names, dates, places, and marriages
// are assembled here from the record; the model writes ONLY the connective
// prose (2–6 sentences per generation) and the world-event chips, under the
// same decline-over-guess doctrine as the historical-context general tier.
// Living chain members are never named in the prompt; the client renders
// their names from the assembled record data.
//
// POST { treeId: string, founderId?: string }
//  → { arc: ArcContent, founderId: string, cached: boolean }
// Without founderId, today's founder is picked deterministically: founders
// (direct ancestors with no recorded parents, 6+ generations back) ordered
// by depth then id, rotated by UTC day number.
//
// Warm mode — POST { treeId, warm: true, dayOffset?: 0 | 1 } with the
// x-cron-secret header: the featured-today warmer fans out here nightly so
// the first reader never waits on generation. Runs AS the tree's owner
// (their entitlement, their daily budget); dayOffset 1 pre-warms tomorrow's
// rotation pick for readers who arrive before the next cron run.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

import { requireCronSecret } from '../_shared/cron.ts';
import {
  authenticate,
  checkDailyLimit,
  checkEntitlement,
  corsHeaders,
  json,
  type EnrichContext,
} from '../_shared/enrich.ts';

const MODEL = 'claude-opus-5';
// v5: DPLA joins as the third card — a period image of the person's own
// town from their own years ("SEE THE PLACE"), rehosted like the papers.
// v4: papers filtered to the person's own state (a Spencer, Mass. family
// was getting Pennsylvania papers that merely said "Spencer"), thumbnails
// rehosted to arc-assets at generation (tile.loc.gov takes a minute), and
// the tap-through goes to the scan itself, not loc.gov's viewer.
// v3 (2026-08-25, Rufus's revisions): longer tellings (4–7 sentences),
// and the "Their world, further" layer — era facts grounded in fetched
// Wikipedia year articles, a period newspaper page from Chronicling
// America, and a public-domain era recording where the years allow.
// v2: placeholder events (no year/place/detail) no longer reach the
// prompt or the fact line. Cached arcs regenerate via the rotation.
const PROMPT_VERSION = 5;
const MIN_FOUNDER_DEPTH = 6;
const MAX_CHAIN = 20;

interface ChainPerson {
  id: string;
  name: string;
  birth: number | null;
  death: number | null;
  living: boolean;
  relationLabel: string | null;
  facts: string[]; // record lines: events + marriages, prompt-ready
}

const ARC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'dek', 'generations'],
  properties: {
    title: { type: 'string', description: 'Short name for this line, e.g. "The Howe Line"' },
    dek: { type: 'string', description: 'One-sentence standfirst for the whole arc' },
    generations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['personId', 'story', 'world', 'worldFacts'],
        properties: {
          personId: { type: 'string' },
          story: { type: 'string', description: '4–7 sentences connecting this life to the line' },
          world: {
            type: 'array',
            items: { type: 'string' },
            description: '0–2 short world-event chips, e.g. "King Philip\'s War · 1675–76"',
          },
          worldFacts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'source'],
              properties: {
                text: { type: 'string', description: '1–2 sentences, drawn ONLY from the provided WORLD SOURCES' },
                source: { type: 'string', description: 'The source tag exactly as given, e.g. "Wikipedia · 1775"' },
              },
            },
            description: '0–3 era facts relevant to this person\'s place and age, from the provided sources only',
          },
        },
      },
    },
  },
} as const;

async function chunkedIn<T>(
  fetchChunk: (ids: string[]) => Promise<T[]>,
  ids: string[],
  size = 150,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(...(await fetchChunk(ids.slice(i, i + size))));
  }
  return out;
}

// ——— "Their world, further": outside sources, fetched per generation ———
// Every call is best-effort with a short timeout — a slow archive
// degrades a panel, never an arc. Sources are baked into the cached
// content, so each founder pays these calls exactly once.

const UA = 'WitnessLives/1.0 (hello@witnesslives.com)';

async function fetchJson(url: string, ms = 6000): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Plain-text slice of a Wikipedia article, or null. */
async function wikiExtract(title: string, chars = 1300): Promise<string | null> {
  const d = (await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${encodeURIComponent(title)}&format=json&explaintext=1&exchars=${chars}&redirects=1`,
  )) as { query?: { pages?: Record<string, { extract?: string }> } } | null;
  const page = d?.query?.pages ? Object.values(d.query.pages)[0] : null;
  const text = page?.extract?.trim();
  return text && text.length > 80 ? text : null;
}

export interface ArcPaper {
  title: string;
  date: string;
  /** Card thumbnail — rehosted to the arc-assets bucket at generation
      time; tile.loc.gov renders on demand and can take a minute. */
  image: string;
  /** The scan itself at readable width (direct IIIF), for the tap-through
      — loc.gov's own viewer page is what took the minute. */
  imageFull: string;
  url: string;
  hits: number;
}

/** Swap the size segment of a loc.gov IIIF url: ".../full/pct:6.25/0/default.jpg#h=..." → width-based. */
function iiifAt(url: string, width: number): string {
  return url.split('#')[0].replace(/\/full\/[^/]+\/0\/default\.jpg.*$/, `/full/${width},/0/default.jpg`);
}

const US_STATES = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware',
  'florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky',
  'louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi',
  'missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico',
  'new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania',
  'rhode island','south carolina','south dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west virginia','wisconsin','wyoming','district of columbia',
];

/** One period newspaper page from the person's own state that mentions
    their town, via the Library of Congress (Chronicling America now
    lives in the loc.gov API — the classic endpoint is retired).
    Coverage 1756–1963, US. The state filter is what keeps a Spencer,
    Massachusetts family out of Pennsylvania papers that merely contain
    the word "Spencer". */
async function fetchPaper(
  town: string,
  state: string,
  from: number,
  to: number,
): Promise<ArcPaper | null> {
  const y1 = Math.max(from, 1756);
  const y2 = Math.min(to, 1963);
  if (!town || !state || y1 >= y2) return null;
  // loc.gov search regularly takes 30+ seconds — callers must hide this
  // behind the model call, never hold a prompt on it. One retry: their
  // cache usually answers the repeated query quickly.
  const url = `https://www.loc.gov/collections/chronicling-america/?q=${encodeURIComponent(town)}&fa=${encodeURIComponent(`location_state:${state}`)}&dates=${y1}/${y2}&fo=json&c=3`;
  const d = ((await fetchJson(url, 50_000)) ?? (await fetchJson(url, 50_000))) as {
    pagination?: { of?: number };
    results?: { partof_title?: string[]; date?: string; id?: string; image_url?: string[] }[];
  } | null;
  const hit = d?.results?.find((r) => r.image_url?.[0] && r.id && r.date);
  if (!hit) return null;
  const rawTitle = hit.partof_title?.[0] ?? 'A period newspaper';
  return {
    // "the kentucky gazette (lexington [ky.]) 1789-1803" → "The Kentucky Gazette (Lexington)"
    title: rawTitle
      .replace(/\s*\[[^\]]*\]\s*/g, ' ')
      .replace(/\s*\d{4}-\d{4}\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (ch) => ch.toUpperCase()),
    date: hit.date!,
    image: iiifAt(hit.image_url![0], 500),
    imageFull: iiifAt(hit.image_url![0], 1800),
    url: hit.id!.replace(/^http:/, 'https:'),
    hits: d?.pagination?.of ?? 1,
  };
}

export interface ArcAudio {
  title: string;
  url: string;
}

export interface ArcScene {
  title: string;
  date: string | null;
  image: string;
  url: string;
  provider: string;
}

/** A period image of the person's own town from their own years, via the
    DPLA aggregator (Digital Commonwealth, state archives, LoC…). Prefers
    a result whose title names the town. */
async function fetchScene(
  town: string,
  state: string,
  from: number,
  to: number,
): Promise<ArcScene | null> {
  const key = Deno.env.get('DPLA_API_KEY');
  if (!key || !town || !state) return null;
  const stateName = state.replace(/\b\w/g, (ch) => ch.toUpperCase());
  const d = (await fetchJson(
    `https://api.dp.la/v2/items?sourceResource.spatial.name=${encodeURIComponent(town)}&sourceResource.spatial.state=${encodeURIComponent(stateName)}&sourceResource.type=image&sourceResource.date.after=${from}&sourceResource.date.before=${to}&api_key=${key}&page_size=10&fields=${encodeURIComponent('sourceResource.title,sourceResource.date.displayDate,object,isShownAt,provider.name')}`,
    15_000,
  )) as {
    docs?: {
      'sourceResource.title'?: string | string[];
      'sourceResource.date.displayDate'?: string | string[];
      object?: string | string[];
      isShownAt?: string;
      'provider.name'?: string;
    }[];
  } | null;
  const usable = (d?.docs ?? []).filter((doc) => doc.object && doc.isShownAt);
  const first = (v: string | string[] | undefined): string | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  const pick =
    usable.find((doc) =>
      (first(doc['sourceResource.title']) ?? '').toLowerCase().includes(town.toLowerCase()),
    ) ?? usable[0];
  if (!pick) return null;
  return {
    title: first(pick['sourceResource.title']) ?? `${town}, ${stateName}`,
    date: first(pick['sourceResource.date.displayDate']),
    image: first(pick.object)!,
    url: pick.isShownAt!,
    provider: pick['provider.name'] ?? 'DPLA',
  };
}

/** A public-domain era recording from Wikimedia Commons. Recordings
    published before 1926 are public domain (rolling window); the search
    leans on the Victor 78 digitizations that dominate Commons's holdings
    for those years. Callers clamp the anchor into 1900–1925, so anyone
    whose life brushed the recorded era gets its sound. */
async function fetchAudio(year: number): Promise<ArcAudio | null> {
  if (year < 1900 || year > 1925) return null;
  const d = (await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`Victor ${year} filetype:audio`)}&srnamespace=6&format=json&srlimit=1`,
  )) as { query?: { search?: { title?: string }[] } } | null;
  const file = d?.query?.search?.[0]?.title;
  if (!file) return null;
  const info = (await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(file)}&prop=imageinfo&iiprop=url&format=json`,
  )) as { query?: { pages?: Record<string, { imageinfo?: { url?: string }[] }> } } | null;
  const url = info?.query?.pages ? Object.values(info.query.pages)[0]?.imageinfo?.[0]?.url : null;
  if (!url) return null;
  // "File:April Showers (1921, Paul Whiteman).mp3" → "April Showers (1921, Paul Whiteman)"
  const title = file.replace(/^File:/, '').replace(/\.(mp3|ogg|oga|flac|wav)$/i, '');
  return { title, url: url.split('?')[0] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: { treeId?: string; founderId?: string; warm?: boolean; dayOffset?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  if (!body.treeId) return json(400, { error: 'treeId is required' });

  let ctx: EnrichContext;
  let dayOffset = 0;
  if (body.warm) {
    const denied = requireCronSecret(req);
    if (denied) return denied;
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: warmTree } = await admin
      .from('trees')
      .select('user_id')
      .eq('id', body.treeId)
      .maybeSingle();
    if (!warmTree) return json(404, { error: 'Tree not found' });
    ctx = { db: admin, admin, userId: warmTree.user_id };
    dayOffset = body.dayOffset === 1 ? 1 : 0;
  } else {
    const auth = await authenticate(req);
    if (auth instanceof Response) return auth;
    ctx = auth;
  }

  // RLS proves ownership: a foreign tree simply isn't found.
  const { data: tree } = await ctx.db
    .from('trees')
    .select('id, home_person_id')
    .eq('id', body.treeId)
    .maybeSingle();
  if (!tree) return json(404, { error: 'Tree not found' });
  if (!tree.home_person_id) return json(422, { error: 'This tree has no home person yet.' });

  // Direct-ancestor set with depths — the skeleton every arc hangs on.
  const { data: rels } = await ctx.db
    .from('relationships')
    .select('individual_id, generation_distance, label')
    .eq('tree_id', tree.id)
    .eq('is_direct_ancestor', true);
  if (!rels?.length) {
    return json(422, { error: 'No computed relationships yet — open the tree first.' });
  }
  const relByPerson = new Map(rels.map((r) => [r.individual_id as string, r]));

  // Founders: direct ancestors with no recorded parents, deep enough to
  // carry a story. Deterministic order → stable daily rotation.
  const directIds = [...relByPerson.keys()];
  const hasParent = new Set(
    (
      await chunkedIn(
        async (ids) =>
          (await ctx.db.from('family_children').select('individual_id').in('individual_id', ids))
            .data ?? [],
        directIds,
      )
    ).map((r: { individual_id: string }) => r.individual_id),
  );
  const founders = directIds
    .filter(
      (id) =>
        !hasParent.has(id) &&
        (relByPerson.get(id)!.generation_distance as number) >= MIN_FOUNDER_DEPTH,
    )
    .sort((a, b) => {
      const d =
        (relByPerson.get(b)!.generation_distance as number) -
        (relByPerson.get(a)!.generation_distance as number);
      return d !== 0 ? d : a.localeCompare(b);
    });
  if (!founders.length) {
    return json(422, { error: 'No line in this tree runs deep enough for a story arc yet.' });
  }

  const founderId =
    body.founderId && founders.includes(body.founderId)
      ? body.founderId
      : founders[(Math.floor(Date.now() / 86_400_000) + dayOffset) % founders.length];

  // Cache first — one arc per founder, forever (per prompt version).
  const { data: cached } = await ctx.db
    .from('story_arcs')
    .select('content')
    .eq('founder_id', founderId)
    .eq('prompt_version', PROMPT_VERSION)
    .maybeSingle();
  if (cached) return json(200, { arc: cached.content, founderId, cached: true });

  const gate = (await checkEntitlement(ctx)) ?? (await checkDailyLimit(ctx));
  if (gate) return gate;

  // Walk DOWN from the founder: at each step, the child who is also a
  // direct ancestor one generation nearer (or the home person). Descent
  // paths are unique; ties (pedigree collapse) break deterministically.
  const chainIds: string[] = [founderId];
  let cursor = founderId;
  for (let i = 0; i < MAX_CHAIN && cursor !== tree.home_person_id; i++) {
    const { data: fams } = await ctx.db
      .from('families')
      .select('id')
      .or(`husband_id.eq.${cursor},wife_id.eq.${cursor}`)
      .eq('tree_id', tree.id);
    if (!fams?.length) break;
    const { data: kids } = await ctx.db
      .from('family_children')
      .select('individual_id')
      .in('family_id', fams.map((f) => f.id));
    const cursorGen = relByPerson.get(cursor)!.generation_distance as number;
    const next = (kids ?? [])
      .map((k) => k.individual_id as string)
      .filter(
        (id) =>
          id === tree.home_person_id ||
          (relByPerson.has(id) &&
            (relByPerson.get(id)!.generation_distance as number) === cursorGen - 1),
      )
      .sort()[0];
    if (!next) break;
    chainIds.push(next);
    cursor = next;
  }
  if (chainIds.length < 4) {
    return json(422, { error: 'This line is too thin in the record to tell yet.' });
  }

  // Assemble each chain member's record: person row, events, marriages.
  const { data: peopleRows } = await ctx.db
    .from('individuals')
    .select('id, full_name, birth_year, death_year, living')
    .in('id', chainIds);
  const personById = new Map((peopleRows ?? []).map((p) => [p.id as string, p]));

  const { data: eventRows } = await ctx.db
    .from('individual_events')
    .select('individual_id, event_type, date_year, label, detail, places(raw)')
    .in('individual_id', chainIds)
    .order('date_year', { ascending: true, nullsFirst: false });

  const { data: famRows } = await ctx.db
    .from('families')
    .select('husband_id, wife_id, marriage_date_year')
    .eq('tree_id', tree.id);
  const spouseIds = new Set<string>();
  for (const f of famRows ?? []) {
    if (chainIds.includes(f.husband_id) && f.wife_id) spouseIds.add(f.wife_id);
    if (chainIds.includes(f.wife_id) && f.husband_id) spouseIds.add(f.husband_id);
  }
  const spouseRows = await chunkedIn(
    async (ids) =>
      (await ctx.db.from('individuals').select('id, full_name, living').in('id', ids)).data ?? [],
    [...spouseIds],
  );
  const spouseById = new Map(spouseRows.map((s: { id: string }) => [s.id, s]));

  const chain: ChainPerson[] = chainIds.map((id) => {
    const p = personById.get(id);
    const living = Boolean(p?.living);
    const facts: string[] = [];
    if (!living) {
      for (const e of eventRows ?? []) {
        if (e.individual_id !== id) continue;
        if (!['birth', 'death', 'burial', 'residence', 'military', 'occupation', 'immigration', 'emigration', 'naturalization', 'census'].includes(e.event_type)) continue;
        const place = (e as { places: { raw: string } | null }).places?.raw
          ?.split(',')
          .slice(0, 2)
          .join(',')
          .trim();
        // A placeholder event — no year, no place, no detail — asserts
        // nothing; skip it rather than render a bare "death ·".
        if (!e.date_year && !place && !e.detail) continue;
        const name = e.label ?? e.event_type;
        facts.push(`${name}${e.date_year ? ` ${e.date_year}` : ''}${place ? ` — ${place}` : ''}${e.detail ? ` (${e.detail})` : ''}`);
      }
      for (const f of famRows ?? []) {
        const isMember = f.husband_id === id || f.wife_id === id;
        if (!isMember) continue;
        const spouse = spouseById.get(f.husband_id === id ? f.wife_id : f.husband_id);
        if (spouse && !spouse.living) {
          facts.push(`married${f.marriage_date_year ? ` ${f.marriage_date_year}` : ''} — ${spouse.full_name}`);
        }
      }
    }
    return {
      id,
      name: p?.full_name ?? 'Unknown',
      birth: p?.birth_year ?? null,
      death: p?.death_year ?? null,
      living,
      relationLabel: (relByPerson.get(id)?.label as string) ?? null,
      facts: facts.slice(0, 14),
    };
  });

  // ——— outside sources per generation, gathered in parallel ———
  // Anchor: the year each person turned twenty, clamped to their span.
  // Towns come from the birth (else death) event's place. Wikipedia year
  // articles are deduped across generations; every fetch is best-effort.
  const placeOf = (id: string): { town: string; state: string } => {
    const rows = (eventRows ?? []).filter((e) => e.individual_id === id);
    const pick =
      rows.find((e) => e.event_type === 'birth') ?? rows.find((e) => e.event_type === 'death');
    const raw = (pick as { places: { raw: string } | null } | undefined)?.places?.raw;
    if (!raw) return { town: '', state: '' };
    const parts = raw.split(',').map((p) => p.trim());
    const state = parts.find((p) => US_STATES.includes(p.toLowerCase()))?.toLowerCase() ?? '';
    return { town: parts[0] ?? '', state };
  };
  const anchorOf = (c: ChainPerson): number | null =>
    c.birth === null ? null : Math.min(c.birth + 20, c.death ?? c.birth + 20);

  const yearCache = new Map<number, Promise<string | null>>();
  const yearArticle = (y: number) => {
    let p = yearCache.get(y);
    if (!p) {
      p = wikiExtract(String(y));
      yearCache.set(y, p);
    }
    return p;
  };

  // Wikipedia feeds the prompt, so it must land before the model call —
  // it's fast. The papers and recordings don't: they are fetched inside
  // finish(), concurrently with the Opus call, because a single loc.gov
  // search can take 30+ seconds and the model call hides that entirely.
  const sources = await Promise.all(
    chain.map(async (c) => {
      if (c.living) return { wiki: [] as { tag: string; text: string }[] };
      const anchor = anchorOf(c);
      const wiki: { tag: string; text: string }[] = [];
      const [yearText, topics] = await Promise.all([
        anchor ? yearArticle(anchor) : Promise.resolve(null),
        anchor && anchor >= 1890
          ? Promise.all(
              ['music', 'sports', 'film'].map(async (t) => ({
                tag: `Wikipedia · ${anchor} in ${t}`,
                text: await wikiExtract(`${anchor} in ${t}`, 1100),
              })),
            )
          : Promise.resolve([]),
      ]);
      if (anchor && yearText) wiki.push({ tag: `Wikipedia · ${anchor}`, text: yearText });
      for (const t of topics) if (t.text) wiki.push({ tag: t.tag, text: t.text });
      return { wiki };
    }),
  );

  // Thumbnails rehost to the public arc-assets bucket at generation time:
  // source archives render images on demand (tile.loc.gov can take a
  // minute), which is a fine price once, here, and a terrible one on
  // every reader's screen.
  const rehost = async (srcUrl: string, path: string): Promise<string | null> => {
    try {
      const res = await fetch(srcUrl, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(50_000),
      });
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const { error } = await ctx.admin.storage
        .from('arc-assets')
        .upload(path, bytes, { contentType: res.headers.get('content-type') ?? 'image/jpeg', upsert: true });
      if (error) return null;
      return `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/arc-assets/${path}`;
    } catch {
      return null;
    }
  };

  const fetchExtras = () =>
    Promise.all(
      chain.map(async (c) => {
        if (c.living) return { paper: null, audio: null, scene: null };
        const anchor = anchorOf(c);
        const { town, state } = placeOf(c.id);
        const [paper, audio, scene] = await Promise.all([
          c.birth && c.death
            ? fetchPaper(town, state, c.birth, c.death).then(async (p) =>
                p ? { ...p, image: (await rehost(p.image, `papers/${founderId}/${c.id}.jpg`)) ?? p.image } : null,
              )
            : Promise.resolve(null),
          // Anyone alive during the recorded era (1900–1925) gets its
          // sound: clamp their 20th-year anchor into the window.
          anchor && c.birth && c.birth <= 1925 && (c.death ?? c.birth + 80) >= 1900
            ? fetchAudio(Math.max(1900, Math.min(anchor, 1925)))
            : Promise.resolve(null),
          c.birth && c.death
            ? fetchScene(town, state, c.birth, c.death).then(async (s) =>
                s ? { ...s, image: (await rehost(s.image, `scenes/${founderId}/${c.id}.jpg`)) ?? s.image } : null,
              )
            : Promise.resolve(null),
        ]);
        return { paper, audio, scene };
      }),
    );

  // The prompt: living members appear only as anonymous closing generations.
  const promptLines = chain.map((c, i) => {
    if (c.living) {
      return `GENERATION ${i + 1} (id ${c.id}): [a living member of the family — do not name or describe; if this is the last generation, close the arc addressed to "you", the reader]`;
    }
    const lines = [
      `GENERATION ${i + 1} (id ${c.id}): ${c.name} (${c.birth ?? '?'}–${c.death ?? '?'})`,
      ...c.facts.map((f) => `  - ${f}`),
    ];
    for (const w of sources[i].wiki) {
      lines.push(`  WORLD SOURCE [${w.tag}]: ${w.text.replace(/\s+/g, ' ').slice(0, 1100)}`);
    }
    return lines.join('\n');
  });

  // Everything up to here is quick queries; only the model call is long.
  // In warm mode that call runs past the response via EdgeRuntime.waitUntil
  // so the featured-today fan-out never holds N generations on its own
  // wall clock (it did once, and died of WORKER_RESOURCE_LIMIT for it).
  const finish = async (): Promise<Response> => {
  // Papers and recordings ride alongside the model call — both are slow,
  // and neither needs the other.
  const extrasPromise = fetchExtras();
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 9000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ARC_SCHEMA } },
      system: [
        'You write generational story arcs for Witness, a family history app: one bloodline, founder to reader, told as a flowing descent.',
        'For each generation write 4–7 sentences (JSON "story"): lead with what the record shows — offices held, children counted, marriages, moves — and set the life in its history and geography: the rivers and roads, the wars and revivals, what the place was in that decade. Connect each life to the one before it. Where the record is rich, spend the sentences on it; where it is thin, let well-documented history of the time and place carry more of the weight, and never pad with speculation.',
        'Work ONLY from the facts provided for names, dates, places, marriages, and moves. Never invent record specifics. No claims about personality, feelings, or motivations.',
        'World events (JSON "world", 0–2 per generation, format "Name · years"): well-documented history that genuinely intersects this life\'s time and place, from your own knowledge. Hard rule: if you are not certain enough that a careful historian would state it flatly, omit it — an empty list is the correct failure mode. You may weave a world event into the story prose only under the same certainty rule.',
        'Era facts (JSON "worldFacts", 0–3 per generation): drawn STRICTLY from the WORLD SOURCE blocks provided for that generation — quote or closely paraphrase, never supplement from your own knowledge. Choose only entries that belong to this person\'s place and age; a farmer in Essex County does not get a Frankfurt premiere. Each item carries its source tag exactly as given. No sources provided, or nothing relevant → empty list.',
        'A living generation gets one or two graceful closing sentences addressed to "you" — never a name, never facts, empty worldFacts.',
        'Title the line by its surname where one dominates ("The Howe Line"). The dek is one sentence: the whole arc\'s shape.',
        'No headers, no lists inside stories. Begin directly.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: `The line, founder first, ending at the reader:\n\n${promptLines.join('\n\n')}`,
        },
      ],
    });
  } catch (error) {
    console.error('Anthropic call failed:', error);
    return json(502, { error: 'Story generation failed. Please try again.' });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (response.stop_reason === 'refusal' || !textBlock) {
    return json(502, { error: 'Story generation was declined. Please try again.' });
  }

  let wire: {
    title: string;
    dek: string;
    generations: {
      personId: string;
      story: string;
      world: string[];
      worldFacts: { text: string; source: string }[];
    }[];
  };
  try {
    wire = JSON.parse(textBlock.text);
    if (!wire.title || !Array.isArray(wire.generations)) throw new Error('malformed');
  } catch (error) {
    console.error('Malformed generation:', error);
    return json(502, { error: 'Story generation failed. Please try again.' });
  }
  const storyById = new Map(wire.generations.map((g) => [g.personId, g]));
  const extras = await extrasPromise;

  // Content = record data (server-assembled) + model prose + outside
  // sources, zipped by id. v2 content: worldFacts/paper/audio per gen.
  const content = {
    v: 2,
    title: wire.title,
    dek: wire.dek,
    founderId,
    generations: chain.map((c, i) => ({
      personId: c.id,
      name: c.name,
      birth: c.birth,
      death: c.death,
      living: c.living,
      relationLabel: c.relationLabel,
      factLine: c.living
        ? null
        : c.facts
            .filter((f) => !f.startsWith('residence'))
            .slice(0, 4)
            .join(' · ') || null,
      story: storyById.get(c.id)?.story ?? null,
      world: storyById.get(c.id)?.world ?? [],
      worldFacts: storyById.get(c.id)?.worldFacts ?? [],
      paper: extras[i].paper,
      audio: extras[i].audio,
      scene: extras[i].scene,
    })),
  };

  const { error: upsertError } = await ctx.admin.from('story_arcs').upsert(
    {
      tree_id: tree.id,
      user_id: ctx.userId,
      founder_id: founderId,
      content,
      model: response.model,
      prompt_version: PROMPT_VERSION,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    { onConflict: 'founder_id,prompt_version' },
  );
  if (upsertError) console.error('Arc cache upsert failed:', upsertError.message);

  return json(200, { arc: content, founderId, cached: false });
  };

  const runtime = globalThis as unknown as {
    EdgeRuntime?: { waitUntil(p: Promise<unknown>): void };
  };
  if (body.warm && runtime.EdgeRuntime?.waitUntil) {
    runtime.EdgeRuntime.waitUntil(
      finish()
        .then((r) => {
          if (r.status !== 200) console.error(`warm arc ${founderId} failed: ${r.status}`);
        })
        .catch((err) => console.error(`warm arc ${founderId} threw:`, err)),
    );
    return json(202, { queued: true, founderId, cached: false });
  }
  return await finish();
});
