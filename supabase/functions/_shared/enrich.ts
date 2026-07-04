// Shared plumbing for enrichment Edge Functions: CORS, auth, RLS-scoped
// and service-role clients, the daily AI budget, and the fact-gathering
// query for one ancestor. Each function stays a thin prompt + cache layer.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const DAILY_LIMIT = 20;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export interface EnrichContext {
  db: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
}

/** Auth + client setup. Returns a Response on failure, a context on success. */
export async function authenticate(req: Request): Promise<EnrichContext | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing authorization' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'Invalid token' });

  return { db, admin, userId: userData.user.id };
}

/**
 * Fresh AI generations across all enrichment types share one daily budget.
 * Research briefs live in their own table but count against the same pool.
 */
export async function checkDailyLimit(ctx: EnrichContext): Promise<Response | null> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const since = startOfDay.toISOString();

  const [{ count: enrichments }, { count: briefs }] = await Promise.all([
    ctx.db
      .from('enrichment_cache')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .gte('created_at', since),
    ctx.db
      .from('research_briefs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .gte('created_at', since),
  ]);

  if ((enrichments ?? 0) + (briefs ?? 0) >= DAILY_LIMIT) {
    return json(429, {
      error: `Daily limit of ${DAILY_LIMIT} AI generations reached. It resets at midnight UTC.`,
      code: 'rate_limited',
    });
  }
  return null;
}

export interface PersonRow {
  id: string;
  tree_id: string;
  full_name: string;
  given_name: string | null;
  surname: string | null;
  sex: 'M' | 'F' | 'U';
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

export interface EventRow {
  event_type: string;
  date_year: number | null;
  date_raw: string | null;
  places: { raw: string; parts: string[] } | null;
}

export interface PersonFacts {
  person: PersonRow;
  events: EventRow[];
  factLines: string[];
}

/** Loads one ancestor (RLS-scoped) with events; null when not visible. */
export async function loadPersonFacts(
  ctx: EnrichContext,
  individualId: string,
): Promise<PersonFacts | Response> {
  const { data: person, error } = await ctx.db
    .from('individuals')
    .select('id, tree_id, full_name, given_name, surname, sex, birth_year, death_year, living')
    .eq('id', individualId)
    .maybeSingle();
  if (error) return json(500, { error: error.message });
  if (!person) return json(404, { error: 'Ancestor not found' });

  const { data: events } = await ctx.db
    .from('individual_events')
    .select('event_type, date_year, date_raw, places(raw, parts)')
    .eq('individual_id', individualId)
    .order('date_year', { ascending: true, nullsFirst: false })
    .returns<EventRow[]>();

  const factLines: string[] = [
    `Name: ${person.full_name}` +
      (person.sex === 'M' ? ' (male)' : person.sex === 'F' ? ' (female)' : ''),
  ];
  if (person.birth_year || person.death_year) {
    factLines.push(`Lived: ${person.birth_year ?? 'unknown'} – ${person.death_year ?? 'unknown'}`);
  }
  for (const event of events ?? []) {
    const place = event.places?.raw ? ` in ${event.places.raw}` : '';
    factLines.push(`${event.event_type}: ${event.date_raw ?? event.date_year ?? 'date unknown'}${place}`);
  }

  return { person, events: events ?? [], factLines };
}

/**
 * Minimal country canonicalization for external history lookups. The
 * client has the full classifier in @witness/core; functions only need
 * enough to pick the right country for Wikidata and to decide whether
 * Chronicling America (US newspapers) applies.
 */
const US_STATES = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware',
  'florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky',
  'louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi',
  'missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico',
  'new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania',
  'rhode island','south carolina','south dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west virginia','wisconsin','wyoming',
  'ma','me','ri','nh','vt','ct','ny','nj','pa','mass','conn',
]);
const US_NAMES = new Set(['usa', 'us', 'united states', 'united states of america', 'america', 'british america']);

export interface PlaceProfile {
  /** Canonical country label for Wikidata ('United States', 'England', …). */
  country: string | null;
  /** Most frequent US state name (full, capitalized) if the life was American. */
  usState: string | null;
  /** Most frequent town/first place part. */
  town: string | null;
  isAmerican: boolean;
}

export function profilePlaces(events: EventRow[]): PlaceProfile {
  const countryCounts = new Map<string, number>();
  const stateCounts = new Map<string, number>();
  const townCounts = new Map<string, number>();

  for (const event of events) {
    const parts = event.places?.parts;
    if (!parts?.length) continue;
    const last = parts[parts.length - 1].toLowerCase().replace(/\./g, '').trim();
    const secondLast = parts.length >= 2 ? parts[parts.length - 2].toLowerCase().replace(/\./g, '').trim() : null;

    let country: string;
    let state: string | null = null;
    if (US_NAMES.has(last)) {
      country = 'United States';
      if (secondLast && US_STATES.has(secondLast)) state = secondLast;
    } else if (US_STATES.has(last)) {
      country = 'United States';
      state = last;
    } else if (parts.length >= 2) {
      country = parts[parts.length - 1];
    } else {
      continue;
    }
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    if (state) stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
    if (parts[0]) townCounts.set(parts[0], (townCounts.get(parts[0]) ?? 0) + 1);
  }

  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const country = top(countryCounts);
  const stateAbbrev: Record<string, string> = {
    ma: 'massachusetts', me: 'maine', ri: 'rhode island', nh: 'new hampshire', vt: 'vermont',
    ct: 'connecticut', ny: 'new york', nj: 'new jersey', pa: 'pennsylvania',
    mass: 'massachusetts', conn: 'connecticut',
  };
  let usState = top(stateCounts);
  if (usState) {
    usState = stateAbbrev[usState] ?? usState;
    usState = usState.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return {
    country,
    usState,
    town: top(townCounts),
    isAmerican: country === 'United States',
  };
}
