// va-enrich — the veterans' gravesites worker (register `va-burials`).
//
// The National Cemetery Administration's Nationwide Gravesite Locator is
// published as an open dataset on data.va.gov (3u66-fxug, CC0): 8.4M
// burials with the decedent's names and dates, the cemetery and its
// coordinates, branch, rank, war, and the relationship to the veteran.
// Too large to seed as a register CSV, so — the nara-enrich shape on the
// registers' tables — this worker runs every ten minutes from pg_cron,
// takes a bounded batch of unexamined people, asks the dataset for rows
// with the same surname and first given name, scores them
// (_shared/records/vaBurials.ts, mirrored from @witness/core), and writes
// the plausible ones as person_register_links candidates with the record
// snapshot in saved_payload. Strong ones land in the findings ledger.
//
// Doctrine: candidates, never facts. A row whose death year disagrees is
// not offered at all. The reader confirms on the Portrait; confirming
// writes a burial event and puts the cemetery on the map.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { requireCronSecret } from '../_shared/cron.ts';
import {
  matchVaRows,
  usStatesFromPlaceParts,
  vaSoqlWhere,
  type VaGraveRow,
  type VaPersonFacts,
} from '../_shared/records/vaBurials.ts';

const REGISTER_KEY = 'va-burials';
const SODA_URL = 'https://www.data.va.gov/resource/3u66-fxug.json';
const MIN_DEATH_YEAR = 1860; // national cemeteries begin with the Civil War
const MAX_CALLS_PER_RUN = 30; // 180/hour: well under Socrata's per-IP throttle even without a token
const MAX_INDIVIDUALS_PER_RUN = 80; // ineligible people cost no calls but should still drain
const ROWS_PER_QUERY = 25;
const MAX_CANDIDATES_PER_PERSON = 3;
const SELECT =
  'decedent_id,d_first_name,d_mid_name,d_last_name,d_suffix,d_birth_date,d_death_date,' +
  'section_id,row_num,site_num,cem_name,cem_addr_one,city,state,zip,cem_url,' +
  'relationship,v_first_name,v_mid_name,v_last_name,v_suffix,branch,rank,war,location_point';

interface QueueRow {
  id: string;
  tree_id: string;
  user_id: string;
  full_name: string;
  given_name: string | null;
  surname: string | null;
  sex: string;
  birth_year: number | null;
  death_year: number | null;
}

// deno-lint-ignore no-explicit-any
type Client = any;

async function fetchRows(where: string, token: string | undefined): Promise<VaGraveRow[] | null> {
  const url = new URL(SODA_URL);
  url.searchParams.set('$select', SELECT);
  url.searchParams.set('$where', where);
  url.searchParams.set('$limit', String(ROWS_PER_QUERY));
  const headers: Record<string, string> = {
    'User-Agent': 'Witness/0.1 (family history app; witnesslives.com)',
  };
  if (token) headers['X-App-Token'] = token;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.error(`va-enrich: HTTP ${res.status} from data.va.gov for ${where}`);
      return null;
    }
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? (body as VaGraveRow[]) : [];
  } catch (error) {
    console.error('va-enrich: data.va.gov request failed:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const errors: string[] = [];
  const note = (label: string, error: { message?: string } | null) => {
    if (error) errors.push(`${label}: ${error.message ?? JSON.stringify(error)}`);
  };

  let force = false;
  let onlyTree: string | null = null;
  try {
    const body = (await req.json()) as { force?: boolean; treeId?: string };
    force = body?.force === true;
    onlyTree = typeof body?.treeId === 'string' ? body.treeId : null;
  } catch {
    // empty body — the normal cron case
  }

  const supabase: Client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const token = Deno.env.get('VA_APP_TOKEN') ?? undefined;

  // One worker per ten-minute bucket; `force` is for manual runs.
  if (!force) {
    const bucket = new Date().toISOString().slice(0, 15);
    const { error: tickError } = await supabase
      .from('register_ticks')
      .insert({ register_key: REGISTER_KEY, bucket });
    if (tickError) return Response.json({ skipped: 'another worker owns this bucket' });
  }

  // The register must be seeded and active, or there is nothing to link to.
  const { data: register } = await supabase
    .from('registers')
    .select('register_key, display_name, status')
    .eq('register_key', REGISTER_KEY)
    .maybeSingle();
  if (!register || register.status !== 'active') {
    return Response.json({ skipped: `register ${REGISTER_KEY} is not seeded or not active` });
  }

  const { data: queue, error: queueError } = await supabase.rpc('register_enrichment_queue', {
    p_register_key: REGISTER_KEY,
    p_limit: MAX_INDIVIDUALS_PER_RUN,
    p_min_death_year: MIN_DEATH_YEAR,
    p_tree_id: onlyTree,
  });
  if (queueError) return Response.json({ error: queueError.message }, { status: 500 });
  const batch = (queue ?? []) as QueueRow[];
  if (batch.length === 0) return Response.json({ done: 'queue empty' });

  // Places and spouses for the whole batch in two queries, not two per person.
  const ids = batch.map((p) => p.id);
  const { data: eventRows, error: eventsError } = await supabase
    .from('individual_events')
    .select('individual_id, places (parts)')
    .in('individual_id', ids);
  note('events load', eventsError);
  const partsByPerson = new Map<string, (string[] | null)[]>();
  for (const row of (eventRows ?? []) as { individual_id: string; places: { parts: string[] } | null }[]) {
    const list = partsByPerson.get(row.individual_id) ?? [];
    list.push(row.places?.parts ?? null);
    partsByPerson.set(row.individual_id, list);
  }
  const { data: familyRows, error: familiesError } = await supabase
    .from('families')
    .select('husband_id, wife_id, husband:individuals!families_husband_id_fkey(full_name), wife:individuals!families_wife_id_fkey(full_name)')
    .or(`husband_id.in.(${ids.join(',')}),wife_id.in.(${ids.join(',')})`);
  note('families load', familiesError);
  const spousesByPerson = new Map<string, string[]>();
  for (const row of (familyRows ?? []) as {
    husband_id: string | null;
    wife_id: string | null;
    husband: { full_name: string } | null;
    wife: { full_name: string } | null;
  }[]) {
    if (row.husband_id && row.wife?.full_name) {
      spousesByPerson.set(row.husband_id, [...(spousesByPerson.get(row.husband_id) ?? []), row.wife.full_name]);
    }
    if (row.wife_id && row.husband?.full_name) {
      spousesByPerson.set(row.wife_id, [...(spousesByPerson.get(row.wife_id) ?? []), row.husband.full_name]);
    }
  }

  let calls = 0;
  let examined = 0;
  let candidates = 0;
  let strong = 0;
  const findingRows: Record<string, unknown>[] = [];

  for (const row of batch) {
    if (calls >= MAX_CALLS_PER_RUN) break;
    examined++;

    const person: VaPersonFacts = {
      id: row.id,
      fullName: row.full_name,
      givenName: row.given_name,
      surname: row.surname,
      birthYear: row.birth_year,
      deathYear: row.death_year,
      usStates: usStatesFromPlaceParts(partsByPerson.get(row.id) ?? []),
      spouseNames: spousesByPerson.get(row.id) ?? [],
    };

    // A person with no United States place at all is not asked about —
    // the locator is American ground. (Costs no call; still marked
    // examined so the queue drains.) Names come off full_name when the
    // given/surname columns are empty (vaBurials.withNameParts).
    const where = vaSoqlWhere(person);
    const hasUsPlace = person.usStates.length > 0 ||
      (partsByPerson.get(row.id) ?? []).some((parts) =>
        (parts ?? []).some((p) => /united states|^usa$|^u\.s\.a?\.?$/i.test(p.trim())),
      );
    let personCalls = 0;
    let personCandidates = 0;

    if (where && hasUsPlace) {
      calls++;
      personCalls++;
      const rows = await fetchRows(where, token);
      if (rows === null) {
        // A failed request is not an examination: leave the person for a
        // later run rather than marking them done with nothing looked at.
        continue;
      }
      const matches = matchVaRows(person, rows, MAX_CANDIDATES_PER_PERSON);
      if (matches.length > 0) {
        // Never offer a grave the reader has already decided on, and never
        // duplicate an open candidate (Variant C rows have no record_id to
        // be unique on — the decedent id in the payload is the key).
        const { data: held } = await supabase
          .from('person_register_links')
          .select('saved_payload')
          .eq('individual_id', row.id)
          .eq('register_key', REGISTER_KEY);
        const heldIds = new Set(
          ((held ?? []) as { saved_payload: { decedent_id?: string } | null }[])
            .map((h) => h.saved_payload?.decedent_id)
            .filter((id): id is string => typeof id === 'string'),
        );
        const fresh = matches.filter((m) => !heldIds.has(String(m.row.decedent_id)));
        if (fresh.length > 0) {
          const { error: insertError } = await supabase.from('person_register_links').insert(
            fresh.map((m) => ({
              tree_id: row.tree_id,
              user_id: row.user_id,
              individual_id: row.id,
              register_key: REGISTER_KEY,
              record_id: null,
              status: 'candidate',
              match_score: m.score,
              match_reasons: m.reasons,
              record_name: m.recordName,
              record_summary: m.recordSummary,
              source_citation: m.sourceCitation,
              finding_aid_url: 'https://gravelocator.cem.va.gov/',
              saved_payload: m.savedPayload,
            })),
          );
          note(`link insert for ${row.full_name}`, insertError);
          if (!insertError) {
            personCandidates = fresh.length;
            for (const m of fresh) {
              if (m.confidence !== 'strong') continue;
              strong++;
              // Same id shape as @witness/core/findings fromRegisterCandidate,
              // with the decedent id standing in for the record id.
              findingRows.push({
                tree_id: row.tree_id,
                user_id: row.user_id,
                finding_id: `register:${REGISTER_KEY}:${row.id}:${m.row.decedent_id}`,
                source: 'register',
                subject_ids: [row.id],
                sentence: `${row.full_name} may lie in ${m.savedPayload['cemetery']} — a veterans’ gravesite record worth checking.`,
              });
            }
          }
        }
      }
    }

    candidates += personCandidates;
    const { error: stateError } = await supabase.from('register_enrichment_state').upsert(
      {
        register_key: REGISTER_KEY,
        individual_id: row.id,
        tree_id: row.tree_id,
        user_id: row.user_id,
        calls_used: personCalls,
        candidates_found: personCandidates,
      },
      { onConflict: 'register_key,individual_id', ignoreDuplicates: true },
    );
    note(`state insert for ${row.full_name}`, stateError);
  }

  if (findingRows.length > 0) {
    const { error: findingsError } = await supabase.from('findings').upsert(findingRows, {
      onConflict: 'tree_id,finding_id',
      ignoreDuplicates: true,
    });
    note('findings upsert', findingsError);
  }

  if (errors.length > 0) console.error('va-enrich errors:', errors);
  return Response.json({ examined, calls, candidates, strong, errors });
});
