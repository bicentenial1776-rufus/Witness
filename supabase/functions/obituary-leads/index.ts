// obituary-leads — the Chronicling America obituaries worker (register
// `obituaries`).
//
// None of the free federal sources hands over a parent–child link, but a
// death or funeral notice names survivors and parents outright, and the
// Library of Congress exposes every Chronicling America page's OCR. So,
// on a pg_cron cadence and within loc.gov's 20-requests-a-minute limit:
// take a bounded batch of the dead who died 1836–1963 with a known US
// town and state, search their name in that state around the death year,
// read the OCR of the best pages, keep only the passage where the surname
// sits beside the words of a notice (_shared/records/obituaries.ts), and
// let the model say — strictly from the passage — whether it is about
// this person and whom it names. The named relatives are held up against
// the tree: a match corroborates, a miss is a lead. Everything lands as a
// person_register_links candidate with the page, the excerpt, and the
// reading in saved_payload; the reader decides on the Portrait.
//
// Doctrine: candidates, never facts; the excerpt is the record and the
// extraction is a reading of it; a lead is a question for Tree Health,
// never a link written into the tree.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

import { requireCronSecret } from '../_shared/cron.ts';
import {
  findObituaryWindow,
  renderObituaryCandidate,
  type ObituaryExtraction,
  type ObituaryHit,
  type TreeRelatives,
} from '../_shared/records/obituaries.ts';
import { splitName } from '../_shared/records/passengers.ts';

const REGISTER_KEY = 'obituaries';
const MODEL = 'claude-sonnet-4-6';
const UA = 'Witness/0.1 (family history app; witnesslives.com)';
const MIN_DEATH_YEAR = 1836; // where Chronicling America's coverage thickens
const MAX_DEATH_YEAR = 1963; // where it ends
const MAX_SEARCHES_PER_RUN = 8; // loc.gov: 20 JSON requests a minute, then an hour's block
const MAX_INDIVIDUALS_PER_RUN = 60; // ineligible people cost nothing but should drain
const PAGES_PER_PERSON = 2;
const HITS_PER_SEARCH = 6;

const US_STATES: Record<string, string> = {
  alabama: 'alabama', alaska: 'alaska', arizona: 'arizona', arkansas: 'arkansas', california: 'california',
  colorado: 'colorado', connecticut: 'connecticut', delaware: 'delaware', florida: 'florida', georgia: 'georgia',
  hawaii: 'hawaii', idaho: 'idaho', illinois: 'illinois', indiana: 'indiana', iowa: 'iowa', kansas: 'kansas',
  kentucky: 'kentucky', louisiana: 'louisiana', maine: 'maine', maryland: 'maryland', massachusetts: 'massachusetts',
  michigan: 'michigan', minnesota: 'minnesota', mississippi: 'mississippi', missouri: 'missouri', montana: 'montana',
  nebraska: 'nebraska', nevada: 'nevada', 'new hampshire': 'new hampshire', 'new jersey': 'new jersey',
  'new mexico': 'new mexico', 'new york': 'new york', 'north carolina': 'north carolina', 'north dakota': 'north dakota',
  ohio: 'ohio', oklahoma: 'oklahoma', oregon: 'oregon', pennsylvania: 'pennsylvania', 'rhode island': 'rhode island',
  'south carolina': 'south carolina', 'south dakota': 'south dakota', tennessee: 'tennessee', texas: 'texas',
  utah: 'utah', vermont: 'vermont', virginia: 'virginia', washington: 'washington', 'west virginia': 'west virginia',
  wisconsin: 'wisconsin', wyoming: 'wyoming', 'district of columbia': 'district of columbia',
  ma: 'massachusetts', ny: 'new york', ct: 'connecticut', nh: 'new hampshire', vt: 'vermont', me: 'maine', ri: 'rhode island',
  pa: 'pennsylvania', nj: 'new jersey', oh: 'ohio', il: 'illinois', mi: 'michigan', wi: 'wisconsin', mn: 'minnesota',
  ia: 'iowa', mo: 'missouri', ks: 'kansas', ne: 'nebraska', ca: 'california', tx: 'texas', va: 'virginia', md: 'maryland',
  nc: 'north carolina', sc: 'south carolina', ga: 'georgia', fl: 'florida', tn: 'tennessee', ky: 'kentucky', in: 'indiana',
  wa: 'washington', or: 'oregon', co: 'colorado', az: 'arizona', ut: 'utah', nv: 'nevada', id: 'idaho', mt: 'montana',
  wy: 'wyoming', nd: 'north dakota', sd: 'south dakota', ok: 'oklahoma', ar: 'arkansas', la: 'louisiana', ms: 'mississippi',
  al: 'alabama', wv: 'west virginia', de: 'delaware', dc: 'district of columbia', ak: 'alaska', hi: 'hawaii', nm: 'new mexico',
};

interface QueueRow {
  id: string;
  tree_id: string;
  user_id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
}

interface EventRow {
  individual_id: string;
  event_type: string;
  date_year: number | null;
  places: { parts: string[] } | null;
}

// deno-lint-ignore no-explicit-any
type Client = any;

/** The town and state to search: the death place, else the latest placed event. */
function placeFor(events: EventRow[]): { town: string; state: string } | null {
  const placed = events.filter((e) => e.places?.parts?.length);
  const death = placed.find((e) => e.event_type === 'death' || e.event_type === 'burial');
  const latest = [...placed].sort((a, b) => (b.date_year ?? 0) - (a.date_year ?? 0))[0];
  for (const candidate of [death, latest]) {
    if (!candidate) continue;
    const parts = candidate.places!.parts;
    const state = parts.map((p) => US_STATES[p.trim().toLowerCase()]).find(Boolean);
    if (!state) continue;
    const town = parts[0]?.trim();
    if (!town || US_STATES[town.toLowerCase()]) continue;
    return { town, state };
  }
  return null;
}

async function fetchJson(url: string, ms: number): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ms) });
    if (res.status === 429) {
      console.error('obituary-leads: loc.gov rate limit hit — stopping this run');
      return 'rate-limited';
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** The page's OCR, from its word-coordinates URL with the query stripped. */
function fullTextUrl(wordCoordinatesUrl: string): string {
  const u = new URL(wordCoordinatesUrl);
  u.searchParams.delete('q');
  u.searchParams.delete('relevant_snippet');
  u.searchParams.set('full_text', '1');
  return u.toString();
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'about_person', 'kind', 'confidence', 'deceased_name', 'death_date', 'age_at_death', 'residence',
    'birthplace', 'occupation', 'spouse', 'parents', 'children', 'siblings', 'others', 'burial_place', 'quote',
  ],
  properties: {
    about_person: { type: 'boolean' },
    kind: { type: 'string', enum: ['obituary', 'death notice', 'funeral notice', 'marriage notice', 'other'] },
    confidence: { type: 'string', enum: ['strong', 'probable', 'weak'] },
    deceased_name: { type: ['string', 'null'] },
    death_date: { type: ['string', 'null'] },
    age_at_death: { type: ['string', 'null'] },
    residence: { type: ['string', 'null'] },
    birthplace: { type: ['string', 'null'] },
    occupation: { type: ['string', 'null'] },
    spouse: { type: ['string', 'null'] },
    parents: { type: 'array', items: { type: 'string' } },
    children: { type: 'array', items: { type: 'string' } },
    siblings: { type: 'array', items: { type: 'string' } },
    others: { type: 'array', items: { type: 'string' } },
    burial_place: { type: ['string', 'null'] },
    quote: { type: ['string', 'null'] },
  },
};

async function readPassage(
  anthropic: Anthropic,
  person: QueueRow,
  place: { town: string; state: string },
  excerpt: string,
): Promise<{ extraction: ObituaryExtraction; usage: { input: number; output: number } } | null> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 900,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
      system: [
        'You read one passage of OCR text from a historical American newspaper page for Witness, a family history app, and report ONLY what the passage itself says. The OCR is noisy: letters are misread and lines run together; read through the noise but never past it.',
        'The question: is this passage a death, funeral, or obituary notice (or a marriage notice) about the specific person named, who died in about the year given, in or near the town given? Set about_person true only when the name, the year, and the place are all consistent with the passage; a namesake elsewhere, or a different decade, is about_person false.',
        'Confidence: strong when the full name is legible in a notice that fits the year and place; probable when the name is partly garbled or the place is only implied; weak when you would be guessing.',
        'Relatives: list each named spouse, parent, child, sibling, and other relative the passage names, as written (keep "Mrs. Sarah Haynes"). Empty arrays when none are named. Never infer a relative the text does not name.',
        'quote: one verbatim sentence or clause from the passage, at most 300 characters, the one that best shows what the notice says — corrected only for obvious OCR letter errors.',
        'Every other field is null unless the passage states it.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content:
            `The person: ${person.full_name}` +
            (person.birth_year ? `, born ${person.birth_year}` : '') +
            (person.death_year ? `, died ${person.death_year}` : '') +
            `, of ${place.town}, ${place.state.replace(/\b\w/g, (c) => c.toUpperCase())}.\n\nThe passage:\n${excerpt}`,
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (response.stop_reason === 'refusal' || !textBlock || textBlock.type !== 'text') return null;
    const extraction = JSON.parse(textBlock.text) as ObituaryExtraction;
    return { extraction, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } };
  } catch (error) {
    console.error('obituary-leads: model call failed:', error);
    return null;
  }
}

async function relativesFor(supabase: Client, personId: string): Promise<TreeRelatives> {
  const out: TreeRelatives = { spouses: [], children: [], parents: [], siblings: [] };
  const { data: asSpouse } = await supabase
    .from('families')
    .select('id, husband_id, wife_id, husband:individuals!families_husband_id_fkey(full_name), wife:individuals!families_wife_id_fkey(full_name)')
    .or(`husband_id.eq.${personId},wife_id.eq.${personId}`);
  const familyIds: string[] = [];
  for (const f of (asSpouse ?? []) as { id: string; husband_id: string | null; wife_id: string | null; husband: { full_name: string } | null; wife: { full_name: string } | null }[]) {
    familyIds.push(f.id);
    const other = f.husband_id === personId ? f.wife?.full_name : f.husband?.full_name;
    if (other) (out.spouses as string[]).push(other);
  }
  if (familyIds.length > 0) {
    const { data: kids } = await supabase
      .from('family_children')
      .select('individual:individuals!family_children_individual_id_fkey(full_name)')
      .in('family_id', familyIds);
    for (const k of (kids ?? []) as { individual: { full_name: string } | null }[]) {
      if (k.individual?.full_name) (out.children as string[]).push(k.individual.full_name);
    }
  }
  const { data: asChild } = await supabase
    .from('family_children')
    .select('family:families!family_children_family_id_fkey(id, husband:individuals!families_husband_id_fkey(full_name), wife:individuals!families_wife_id_fkey(full_name))')
    .eq('individual_id', personId);
  const parentFamilies: string[] = [];
  for (const row of (asChild ?? []) as { family: { id: string; husband: { full_name: string } | null; wife: { full_name: string } | null } | null }[]) {
    if (!row.family) continue;
    parentFamilies.push(row.family.id);
    if (row.family.husband?.full_name) (out.parents as string[]).push(row.family.husband.full_name);
    if (row.family.wife?.full_name) (out.parents as string[]).push(row.family.wife.full_name);
  }
  if (parentFamilies.length > 0) {
    const { data: sibs } = await supabase
      .from('family_children')
      .select('individual_id, individual:individuals!family_children_individual_id_fkey(full_name)')
      .in('family_id', parentFamilies)
      .neq('individual_id', personId);
    for (const s of (sibs ?? []) as { individual: { full_name: string } | null }[]) {
      if (s.individual?.full_name) (out.siblings as string[]).push(s.individual.full_name);
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

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

  if (!force) {
    const bucket = new Date().toISOString().slice(0, 15);
    const { error: tickError } = await supabase
      .from('register_ticks')
      .insert({ register_key: REGISTER_KEY, bucket });
    if (tickError) return Response.json({ skipped: 'another worker owns this bucket' });
  }

  const { data: register } = await supabase
    .from('registers')
    .select('register_key, status')
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
    p_max_death_year: MAX_DEATH_YEAR,
  });
  if (queueError) return Response.json({ error: queueError.message }, { status: 500 });
  const batch = (queue ?? []) as QueueRow[];
  if (batch.length === 0) return Response.json({ done: 'queue empty' });

  const ids = batch.map((p) => p.id);
  const { data: eventRows, error: eventsError } = await supabase
    .from('individual_events')
    .select('individual_id, event_type, date_year, places (parts)')
    .in('individual_id', ids);
  note('events load', eventsError);
  const eventsByPerson = new Map<string, EventRow[]>();
  for (const row of (eventRows ?? []) as EventRow[]) {
    eventsByPerson.set(row.individual_id, [...(eventsByPerson.get(row.individual_id) ?? []), row]);
  }

  const anthropic = new Anthropic({ apiKey });
  let searches = 0;
  let pagesRead = 0;
  let examined = 0;
  let candidates = 0;
  let strong = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  const findingRows: Record<string, unknown>[] = [];
  let rateLimited = false;

  for (const person of batch) {
    if (searches >= MAX_SEARCHES_PER_RUN || rateLimited) break;
    if (person.death_year === null) continue;
    examined++;

    const place = placeFor(eventsByPerson.get(person.id) ?? []);
    let personCalls = 0;
    let personCandidates = 0;

    // First given name + surname, quoted: `Robert Francis "Bob" Girard`
    // would never be set in type that way, but "Robert Girard" was.
    const { givenNames, surname } = splitName(person.full_name.replace(/"[^"]*"/g, ' ').replace(/\s+/g, ' ').trim());
    const searchName = `${givenNames.split(/\s+/)[0] ?? ''} ${surname}`.trim();
    if (place && surname.length >= 3 && searchName.includes(' ')) {
      const params = new URLSearchParams({
        q: `"${searchName}"`,
        fa: `location_state:${place.state}`,
        dates: `${person.death_year}/${person.death_year + 1}`,
        dl: 'page',
        fo: 'json',
        c: String(HITS_PER_SEARCH),
        at: 'results,pagination',
      });
      searches++;
      personCalls++;
      const result = await fetchJson(`https://www.loc.gov/collections/chronicling-america/?${params}`, 45_000);
      if (result === 'rate-limited') {
        rateLimited = true;
        break;
      }
      if (result === null) {
        // A failed search is not an examination; the person waits for a later run.
        examined--;
        continue;
      }
      const hits = ((result as { results?: Record<string, unknown>[] }).results ?? []).filter(
        (r) => typeof r['word_coordinates_url'] === 'string' && typeof r['date'] === 'string' && typeof r['id'] === 'string',
      );

      // Which graves the reader has already decided on, and which pages
      // are already offered — the page URL is the key.
      const { data: held } = await supabase
        .from('person_register_links')
        .select('saved_payload')
        .eq('individual_id', person.id)
        .eq('register_key', REGISTER_KEY);
      const heldPages = new Set(
        ((held ?? []) as { saved_payload: { page_url?: string } | null }[])
          .map((h) => h.saved_payload?.page_url)
          .filter((u): u is string => typeof u === 'string'),
      );

      let relatives: TreeRelatives | null = null;
      let read = 0;
      for (const hit of hits) {
        if (read >= PAGES_PER_PERSON) break;
        const pageUrl = String(hit['id']).replace(/^http:/, 'https:');
        if (heldPages.has(pageUrl)) continue;
        const text = await fetchJson(fullTextUrl(String(hit['word_coordinates_url'])), 30_000);
        if (text === 'rate-limited') {
          rateLimited = true;
          break;
        }
        if (!text || typeof text !== 'object') continue;
        const segment = Object.values(text as Record<string, { full_text?: string }>)[0];
        const fullText = segment?.full_text;
        if (!fullText) continue;
        pagesRead++;
        const window = findObituaryWindow(fullText, person.full_name);
        if (!window) continue;
        read++;

        const reading = await readPassage(anthropic, person, place, window.excerpt);
        if (!reading) continue;
        tokensIn += reading.usage.input;
        tokensOut += reading.usage.output;
        relatives ??= await relativesFor(supabase, person.id);

        const obituaryHit: ObituaryHit = {
          paperTitle: (hit['partof_title'] as string[] | undefined)?.[0] ?? 'A period newspaper',
          date: String(hit['date']),
          pageUrl,
          imageUrl: (hit['image_url'] as string[] | undefined)?.[0]?.split('#')[0] ?? null,
        };
        const candidate = renderObituaryCandidate(
          { fullName: person.full_name, deathYear: person.death_year },
          obituaryHit,
          window,
          reading.extraction,
          relatives,
        );
        if (!candidate) continue;

        const { error: insertError } = await supabase.from('person_register_links').insert({
          tree_id: person.tree_id,
          user_id: person.user_id,
          individual_id: person.id,
          register_key: REGISTER_KEY,
          record_id: null,
          status: 'candidate',
          match_score: candidate.confidence === 'strong' ? 6 : 4,
          match_reasons: candidate.reasons,
          record_name: candidate.recordName,
          record_summary: candidate.recordSummary,
          source_citation: candidate.sourceCitation,
          finding_aid_url: candidate.findingAidUrl,
          saved_payload: {
            ...candidate.savedPayload,
            ai: { model: MODEL, input_tokens: reading.usage.input, output_tokens: reading.usage.output },
          },
        });
        note(`link insert for ${person.full_name}`, insertError);
        if (insertError) continue;
        personCandidates++;
        if (candidate.confidence === 'strong') {
          strong++;
          findingRows.push({
            tree_id: person.tree_id,
            user_id: person.user_id,
            finding_id: `register:${REGISTER_KEY}:${person.id}:${encodeURIComponent(pageUrl)}`,
            source: 'register',
            subject_ids: [person.id],
            sentence: `${person.full_name} may be the subject of a notice in ${candidate.savedPayload['paper']}, ${obituaryHit.date.slice(0, 4)} — it names relatives worth checking.`,
          });
        }
      }
    }

    candidates += personCandidates;
    if (rateLimited) break;
    const { error: stateError } = await supabase.from('register_enrichment_state').upsert(
      {
        register_key: REGISTER_KEY,
        individual_id: person.id,
        tree_id: person.tree_id,
        user_id: person.user_id,
        calls_used: personCalls,
        candidates_found: personCandidates,
      },
      { onConflict: 'register_key,individual_id', ignoreDuplicates: true },
    );
    note(`state insert for ${person.full_name}`, stateError);
  }

  if (findingRows.length > 0) {
    const { error: findingsError } = await supabase.from('findings').upsert(findingRows, {
      onConflict: 'tree_id,finding_id',
      ignoreDuplicates: true,
    });
    note('findings upsert', findingsError);
  }

  if (errors.length > 0) console.error('obituary-leads errors:', errors);
  return Response.json({ examined, searches, pagesRead, candidates, strong, tokensIn, tokensOut, rateLimited, errors });
});
