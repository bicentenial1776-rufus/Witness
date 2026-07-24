// NARA enrichment worker: finds National Archives documents that might
// belong to a tree's ancestors and stores them as confirm/dismiss
// candidates. Invoked every ten minutes by pg_cron (see migration
// 20260724130000); each run examines a bounded batch of individuals,
// oldest tree first, and spends at most MAX_CALLS_PER_RUN catalog
// searches. The NARA key allows 10,000 calls/month, so a monthly ledger
// (nara_api_calls) hard-stops the worker at MONTHLY_BUDGET — the
// remainder is held for future interactive features.
//
// Matching doctrine: results are candidates, never facts. Every hit must
// at least contain the person's surname in its title; everything else is
// left to the human confirm/dismiss pass in the app.

import { createClient } from 'npm:@supabase/supabase-js@2';

const NARA_URL = 'https://catalog.archives.gov/api/v2/records/search';
const MONTHLY_BUDGET = 7000; // of the 10k quota; the rest is reserved
const MAX_CALLS_PER_RUN = 6;
const MAX_INDIVIDUALS_PER_RUN = 50; // ineligible people cost no calls but should still drain
const HITS_PER_QUERY = 5;
const CANDIDATES_PER_QUERY = 3;

interface EventRow {
  event_type: string;
  date_year: number | null;
  place_id: string | null;
  places: { raw: string; parts: string[] } | null;
}

interface IndividualRow {
  id: string;
  tree_id: string;
  user_id: string;
  full_name: string;
  surname: string | null;
  sex: string;
  birth_year: number | null;
  individual_events: EventRow[];
}

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming', 'District of Columbia',
];

function isUsPlace(raw: string): boolean {
  if (/united states|,\s*usa\b/i.test(raw)) return true;
  return US_STATES.some((state) => raw.includes(state));
}

/** The state name of the person's busiest US place, to sharpen the query. */
function usState(events: EventRow[]): string | null {
  for (const event of events) {
    const raw = event.places?.raw;
    if (!raw || !isUsPlace(raw)) continue;
    const state = US_STATES.find((s) => raw.includes(s));
    if (state) return state;
  }
  return null;
}

interface SeriesQuery {
  series: string;
  q: string;
  params: Record<string, string>;
  reason: string;
}

/**
 * Which record series plausibly cover this person, best signal first.
 * WWII draft registrations have the strongest name+place+date density in
 * the digitized catalog; naturalizations next; WWI draft cards last.
 */
function seriesQueries(person: IndividualRow): SeriesQuery[] {
  const events = person.individual_events ?? [];
  const hasUsEvent = events.some((e) => e.places && isUsPlace(e.places.raw));
  if (!hasUsEvent || !person.surname) return [];

  const state = usState(events);
  const namePart = `"${person.full_name}"`;
  const statePart = state ? ` ${state}` : '';
  const queries: SeriesQuery[] = [];

  const male = person.sex === 'M';
  const born = person.birth_year;

  if (male && born !== null && born >= 1877 && born <= 1927) {
    queries.push({
      series: 'wwii_draft',
      q: `${namePart} draft registration${statePart}`,
      params: { recordGroupNumber: '147' },
      reason: `WWII draft registration search (born ${born}${state ? `, ${state}` : ''})`,
    });
  }

  const birthEvent = events.find((e) => e.event_type === 'birth' && e.places);
  const foreignBorn = birthEvent ? !isUsPlace(birthEvent.places!.raw) : false;
  if (foreignBorn) {
    queries.push({
      series: 'naturalization',
      q: `${namePart} naturalization${statePart}`,
      params: {},
      reason: `Naturalization search (born ${birthEvent!.places!.raw})`,
    });
  }

  if (male && born !== null && born >= 1873 && born <= 1900) {
    queries.push({
      series: 'wwi_draft',
      q: `${namePart} draft registration${statePart}`,
      params: { recordGroupNumber: '163' },
      reason: `WWI draft registration search (born ${born}${state ? `, ${state}` : ''})`,
    });
  }

  // Two searches per person keeps a 500-person tree inside a month's budget.
  return queries.slice(0, 2);
}

/** True when the surname sorts inside a "Aaa, x - Bbb, y" range title. */
function surnameInRange(title: string, surname: string): boolean {
  const match = /^([A-Za-z'-]+),.*?-\s*([A-Za-z'-]+),/.exec(title);
  if (!match) return false;
  const from = match[1].toLowerCase();
  const to = match[2].toLowerCase();
  return from <= surname && surname <= to;
}

interface NaraHit {
  naId: number;
  title: string;
  score: number | null;
  levelOfDescription: string | null;
  recordGroup: string | null;
  startYear: number | null;
  endYear: number | null;
  objectUrl: string | null;
  objectCount: number;
  useRestriction: string | null;
}

function parseHits(payload: unknown): NaraHit[] {
  const hits = (payload as { body?: { hits?: { hits?: unknown[] } } })?.body?.hits?.hits ?? [];
  const parsed: NaraHit[] = [];
  for (const hit of hits as { _score?: number; _source?: { record?: Record<string, unknown> } }[]) {
    const record = hit._source?.record;
    if (!record || typeof record.naId !== 'number' || typeof record.title !== 'string') continue;
    const ancestors = (record.ancestors ?? []) as {
      levelOfDescription?: string;
      title?: string;
      recordGroupNumber?: number;
      inclusiveStartDate?: { year?: number };
      inclusiveEndDate?: { year?: number };
    }[];
    const series = ancestors.find((a) => a.levelOfDescription === 'series');
    const group = ancestors.find((a) => a.recordGroupNumber !== undefined);
    const objects = (record.digitalObjects ?? []) as { objectUrl?: string }[];
    parsed.push({
      naId: record.naId,
      title: record.title,
      score: typeof hit._score === 'number' ? hit._score : null,
      levelOfDescription: (record.levelOfDescription as string) ?? null,
      recordGroup: group ? `RG ${group.recordGroupNumber} — ${group.title ?? ''}`.trim() : null,
      startYear: series?.inclusiveStartDate?.year ?? null,
      endYear: series?.inclusiveEndDate?.year ?? null,
      objectUrl: objects[0]?.objectUrl ?? null,
      objectCount: objects.length,
      useRestriction:
        ((record.useRestriction as { status?: string } | undefined)?.status as string) ?? null,
    });
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const apiKey = Deno.env.get('NARA_API_KEY');
  if (!apiKey) return Response.json({ error: 'NARA_API_KEY not set' }, { status: 500 });

  // Diagnostics: every swallowed error lands here and in the response, so a
  // silently failing write can never again burn budget for hours unseen.
  const errors: string[] = [];
  const note = (label: string, error: { message?: string } | null) => {
    if (error) errors.push(`${label}: ${error.message ?? JSON.stringify(error)}`);
  };

  let force = false;
  try {
    force = ((await req.json()) as { force?: boolean })?.force === true;
  } catch {
    // empty body — the normal cron case
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // One worker per ten-minute bucket, even if invoked twice. `force` skips
  // the tick for manual diagnostic runs.
  if (!force) {
    const bucket = new Date().toISOString().slice(0, 15);
    const { error: tickError } = await supabase.from('nara_ticks').insert({ bucket });
    if (tickError) return Response.json({ skipped: 'another worker owns this bucket' });
  }

  // Monthly quota ledger: create the month's row if needed, stop at budget.
  const month = new Date().toISOString().slice(0, 7);
  await supabase.from('nara_api_calls').upsert({ month }, { onConflict: 'month', ignoreDuplicates: true });
  const { data: ledger } = await supabase
    .from('nara_api_calls')
    .select('calls')
    .eq('month', month)
    .single();
  let monthCalls = ledger?.calls ?? 0;
  if (monthCalls >= MONTHLY_BUDGET) {
    return Response.json({ skipped: 'monthly NARA budget exhausted', monthCalls });
  }

  // Unexamined individuals, oldest tree first — same fairness rule as the
  // geocode worker, so early importers see documents first. Draft-window
  // males go to the front of the line: most of any tree predates the
  // covered series entirely, and without this priority pass the queue
  // spends days draining seventeenth-century ancestors before spending
  // its first API call.
  const selectBatch = (eligibleOnly: boolean) => {
    let query = supabase
      .from('individuals')
      .select(
        'id, tree_id, user_id, full_name, surname, sex, birth_year, trees!individuals_tree_id_fkey!inner(imported_at), nara_enrichment_state!left(individual_id), individual_events(event_type, date_year, place_id, places(raw, parts))',
      )
      // Anti-join: the filter must be on the EMBED being null, not an
      // embedded column — a column filter only empties the embed and lets
      // the parent row through (the bug that once re-searched the same
      // three men every ten minutes).
      .is('nara_enrichment_state', null);
    if (eligibleOnly) {
      query = query.eq('sex', 'M').gte('birth_year', 1873).lte('birth_year', 1927);
    }
    return query
      .order('imported_at', { referencedTable: 'trees', ascending: true })
      .order('id')
      .limit(MAX_INDIVIDUALS_PER_RUN);
  };

  let { data: batch, error } = await selectBatch(true);
  if (!error && (!batch || batch.length === 0)) {
    ({ data: batch, error } = await selectBatch(false));
  }
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!batch || batch.length === 0) return Response.json({ done: 'queue empty' });

  let calls = 0;
  let candidates = 0;
  let examined = 0;
  let reused = 0;

  for (const person of batch as unknown as IndividualRow[]) {
    if (calls >= MAX_CALLS_PER_RUN || monthCalls >= MONTHLY_BUDGET) break;
    examined++;

    // Cross-tree reuse: another tree may contain this very person
    // (identical name + birth year), already examined. Cloning that
    // result costs no API budget — the reuse_geocodes philosophy.
    // Trees of the same family overlap near-100%; even strangers' trees
    // share ancestors.
    if (person.surname && person.birth_year !== null) {
      const { data: twin, error: twinError } = await supabase
        .from('individuals')
        .select('id, nara_enrichment_state!inner(individual_id)')
        .eq('full_name', person.full_name)
        .eq('surname', person.surname)
        .eq('birth_year', person.birth_year)
        .neq('id', person.id)
        .limit(1)
        .maybeSingle();
      note(`twin lookup for ${person.full_name}`, twinError);
      if (twin) {
        const { data: twinCandidates } = await supabase
          .from('nara_candidates')
          .select('na_id, series, score, match_reason')
          .eq('individual_id', twin.id);
        let cloned = 0;
        if (twinCandidates && twinCandidates.length > 0) {
          const usEvent = person.individual_events.find((e) => e.places && isUsPlace(e.places.raw));
          const { error: cloneError } = await supabase.from('nara_candidates').upsert(
            twinCandidates.map((c) => ({
              tree_id: person.tree_id,
              user_id: person.user_id,
              individual_id: person.id,
              place_id: usEvent?.place_id ?? null,
              na_id: c.na_id,
              series: c.series,
              score: c.score,
              match_reason: c.match_reason,
            })),
            { onConflict: 'individual_id,na_id', ignoreDuplicates: true },
          );
          if (!cloneError) cloned = twinCandidates.length;
        }
        reused++;
        candidates += cloned;
        const { error: reuseStateError } = await supabase.from('nara_enrichment_state').upsert(
          {
            individual_id: person.id,
            tree_id: person.tree_id,
            user_id: person.user_id,
            calls_used: 0,
            candidates_found: cloned,
          },
          { onConflict: 'individual_id', ignoreDuplicates: true },
        );
        note(`reuse state insert for ${person.full_name}`, reuseStateError);
        continue;
      }
    }

    let personCalls = 0;
    let personCandidates = 0;

    for (const query of seriesQueries(person)) {
      if (calls >= MAX_CALLS_PER_RUN || monthCalls >= MONTHLY_BUDGET) break;
      const url = new URL(NARA_URL);
      url.searchParams.set('q', query.q);
      url.searchParams.set('availableOnline', 'true');
      url.searchParams.set('limit', String(HITS_PER_QUERY));
      for (const [key, value] of Object.entries(query.params)) url.searchParams.set(key, value);

      calls++;
      personCalls++;
      monthCalls++;
      let hits: NaraHit[] = [];
      try {
        const response = await fetch(url, {
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        });
        if (response.ok) hits = parseHits(await response.json());
      } catch {
        // Network hiccup: the call is still spent; the person is still
        // marked examined below — a later import can re-trigger via reset.
      }

      // Precision floor: the person's surname must appear in the title,
      // or sort inside an alphabetical-range file unit ("Peters, Serene
      // Ann - Pfarr, Mildred R.") — how NARA titles digitized draft-card
      // files, naming only the endpoint surnames.
      const surname = person.surname!.toLowerCase();
      const plausible = hits
        .filter((h) => h.title.toLowerCase().includes(surname) || surnameInRange(h.title, surname))
        .slice(0, CANDIDATES_PER_QUERY);
      if (plausible.length === 0) continue;

      const { error: docsError } = await supabase.from('nara_documents').upsert(
        plausible.map((h) => ({
          na_id: h.naId,
          title: h.title,
          level_of_description: h.levelOfDescription,
          record_group: h.recordGroup,
          start_year: h.startYear,
          end_year: h.endYear,
          object_url: h.objectUrl,
          object_count: h.objectCount,
          use_restriction: h.useRestriction,
        })),
        { onConflict: 'na_id' },
      );
      note(`documents upsert for ${person.full_name}`, docsError);

      // Anchor the candidate to the person's busiest US place so the
      // place screen can show "papers of this place".
      const usEvent = person.individual_events.find((e) => e.places && isUsPlace(e.places.raw));
      const { error: candidateError } = await supabase.from('nara_candidates').upsert(
        plausible.map((h) => ({
          tree_id: person.tree_id,
          user_id: person.user_id,
          individual_id: person.id,
          place_id: usEvent?.place_id ?? null,
          na_id: h.naId,
          series: query.series,
          score: h.score,
          match_reason: query.reason,
        })),
        { onConflict: 'individual_id,na_id', ignoreDuplicates: true },
      );
      note(`candidates upsert for ${person.full_name}`, candidateError);
      if (!candidateError) personCandidates += plausible.length;
    }

    candidates += personCandidates;
    const { error: stateError } = await supabase.from('nara_enrichment_state').upsert(
      {
        individual_id: person.id,
        tree_id: person.tree_id,
        user_id: person.user_id,
        calls_used: personCalls,
        candidates_found: personCandidates,
      },
      { onConflict: 'individual_id', ignoreDuplicates: true },
    );
    note(`state insert for ${person.full_name}`, stateError);
  }

  const { error: ledgerError } = await supabase
    .from('nara_api_calls')
    .update({ calls: monthCalls })
    .eq('month', month);
  note('ledger update', ledgerError);

  if (errors.length > 0) console.error('nara-enrich errors:', errors);
  return Response.json({ examined, reused, calls, candidates, monthCalls, errors });
});
