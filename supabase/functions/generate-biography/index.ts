// Generates a ~300-word AI biography for one ancestor and caches it in
// enrichment_cache. Runs server-side so the Anthropic key never reaches
// the client. Reads use the caller's JWT (RLS proves ownership); the
// cache insert uses the service role. Living persons are refused here,
// not just hidden in the UI.

import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  DAILY_LIMIT,
  checkEntitlement,
  corsHeaders,
  json,
  renderEventLine,
  type EnrichContext,
  type EventRow,
} from '../_shared/enrich.ts';

const MODEL = 'claude-sonnet-4-6';

// Bumped whenever the writer's inputs or instructions materially improve;
// the cache is read and written at this version, so every story told by an
// older writer quietly expires and retells corrected on the next tap
// (Betsey's twins report, 2026-08-19). v2: twin awareness + the AI-
// authorship disclosure shipping alongside.
// 3 (2026-09-17): the family file's own notes (individual_notes) reach the
// writer as reference material. Every stale story retells on next view.
const PROMPT_VERSION = 3;

// Same window Tree Health uses: births within two days of each other in
// one family are a multiple birth, not a data problem.
const TWIN_WINDOW_DAYS = 2;

type TwinCandidate = {
  id: string;
  full_name: string;
  birth_year: number | null;
  living: boolean;
};
type BirthDate = { year: number; month: number | null; day: number | null };

/**
 * The twins the record can prove or suggest, said out loud so the story
 * writer never mistakes them for an anomaly. Full dates within the twin
 * window are stated as fact; bare shared years are hedged as likely.
 * Living members are counted but never named (the standing doctrine).
 */
function twinFactLines(
  label: 'children' | 'siblings',
  people: TwinCandidate[],
  births: Map<string, BirthDate>,
): string[] {
  const byYear = new Map<number, TwinCandidate[]>();
  for (const person of people) {
    const year = births.get(person.id)?.year ?? person.birth_year;
    if (year === null || year === undefined) continue;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(person);
  }

  // Near-identical names sharing a year are far likelier a duplicated
  // record than twins ("marguerite Beliveau" + "Marguerite Béliveau",
  // found in the first live scan) — assert nothing for those.
  const normalize = (name: string) =>
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const lines: string[] = [];
  for (const [year, rawGroup] of byYear) {
    const seen = new Set<string>();
    const group = rawGroup.filter((p) => {
      const key = normalize(p.full_name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (group.length < 2) continue;
    const dates = group.map((p) => births.get(p.id));
    const fullDates = dates.filter(
      (d): d is Required<BirthDate> => !!d && d.month !== null && d.day !== null,
    );
    let confirmed = false;
    if (fullDates.length === group.length) {
      const stamps = fullDates.map((d) => Date.UTC(d.year, d.month - 1, d.day));
      const gapDays = (Math.max(...stamps) - Math.min(...stamps)) / 86_400_000;
      // Well-separated full dates in one year are simply two births —
      // nothing to say, and nothing to flag.
      if (gapDays > TWIN_WINDOW_DAYS) continue;
      confirmed = true;
    }
    const word = group.length === 2 ? 'twins' : group.length === 3 ? 'triplets' : 'a multiple birth';
    const relation = label === 'children' ? "the subject's children" : "the subject's siblings";
    const names = group.filter((p) => !p.living).map((p) => p.full_name);
    const who =
      names.length === group.length ? names.join(' and ') : `${group.length} of ${relation}`;
    lines.push(
      confirmed
        ? `Twins among ${relation}: ${who}, born within days of each other in ${year} — ${word}.`
        : `Likely twins among ${relation}: ${who}, born in the same year, ${year} — with only years recorded, most likely ${word}.`,
    );
  }
  return lines;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing authorization' });

  let individualId: string;
  let relativesInput: unknown;
  try {
    const body = await req.json();
    individualId = body.individualId;
    relativesInput = body.relatives;
    if (typeof individualId !== 'string') throw new Error();
  } catch {
    return json(400, { error: 'Body must be JSON with an individualId string' });
  }

  // The family-context brief (witness-family-context-spec.md §4): assembled
  // client-side by the same RelativeFact query that draws the pedigree
  // chart — one source of truth. Client-asserted, so it is re-validated to
  // exactly the expected shape and clamped; it can only ever describe the
  // caller's own tree, and living relatives never arrive (the client brief
  // excludes them by doctrine).
  const BUCKETS = new Set(['same_town', 'same_county', 'within_100mi', 'elsewhere', 'unknown']);
  const RELATIONSHIPS = new Set(['sibling', 'aunt', 'uncle']);
  const ACTIVITY_KINDS = new Set(['marriage', 'death', 'immigration', 'naturalization']);
  const relatives = (Array.isArray(relativesInput) ? relativesInput : [])
    .filter(
      (r): r is Record<string, unknown> =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as Record<string, unknown>).name === 'string' &&
        RELATIONSHIPS.has((r as Record<string, unknown>).relationship as string),
    )
    .slice(0, 24)
    .map((r) => ({
      name: String(r.name).slice(0, 120),
      relationship: r.relationship as string,
      birth_year: typeof r.birth_year === 'number' ? r.birth_year : null,
      death_year: typeof r.death_year === 'number' ? r.death_year : null,
      proximity_bucket: BUCKETS.has(r.proximity_bucket as string)
        ? (r.proximity_bucket as string)
        : 'unknown',
      ...(Array.isArray(r.activities)
        ? {
            activities: (r.activities as unknown[])
              .filter(
                (a): a is Record<string, unknown> =>
                  !!a &&
                  typeof a === 'object' &&
                  ACTIVITY_KINDS.has((a as Record<string, unknown>).kind as string),
              )
              .slice(0, 4)
              .map((a) => ({
                kind: a.kind as string,
                year: typeof a.year === 'number' ? a.year : null,
                place: typeof a.place === 'string' ? a.place.slice(0, 160) : null,
                proximity_bucket: BUCKETS.has(a.proximity_bucket as string)
                  ? (a.proximity_bucket as string)
                  : 'unknown',
              })),
          }
        : {}),
    }));

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // RLS-scoped client: acts as the calling user.
  const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'Invalid token' });
  const userId = userData.user.id;

  // Ownership is enforced by RLS: a foreign individual simply isn't found.
  const { data: person, error: personError } = await db
    .from('individuals')
    .select('id, tree_id, full_name, given_name, surname, sex, birth_year, death_year, living')
    .eq('id', individualId)
    .maybeSingle();
  if (personError) return json(500, { error: personError.message });
  if (!person) return json(404, { error: 'Ancestor not found' });

  if (person.living) {
    return json(403, {
      error: 'Biographies are never generated for living persons.',
      code: 'living_person',
    });
  }

  // Cache first — a hit costs nothing and doesn't touch the daily limit.
  // Version-scoped: a story told by an older writer is not a hit, so a
  // bump makes every stale story retellable (and the write below upserts
  // over the old row).
  const { data: cached } = await db
    .from('enrichment_cache')
    .select('content, model, created_at')
    .eq('individual_id', individualId)
    .eq('enrichment_type', 'biography')
    .eq('prompt_version', PROMPT_VERSION)
    .maybeSingle();
  if (cached) return json(200, { biography: cached.content, cached: true });

  const gated = await checkEntitlement({ db, admin, userId } as EnrichContext);
  if (gated) return gated;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: usedToday } = await db
    .from('enrichment_cache')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString());
  if ((usedToday ?? 0) >= DAILY_LIMIT) {
    return json(429, {
      error: `Daily limit of ${DAILY_LIMIT} AI generations reached. It resets at midnight UTC.`,
      code: 'rate_limited',
    });
  }

  // Gather the documented facts of this life.
  const { data: events } = await db
    .from('individual_events')
    .select('event_type, date_year, date_raw, label, detail, places(raw, parts)')
    .eq('individual_id', individualId)
    .order('date_year', { ascending: true, nullsFirst: false })
    .returns<EventRow[]>();

  const { data: familiesAsSpouse } = await db
    .from('families')
    .select('id, husband_id, wife_id, marriage_date_year, marriage_place:places(raw)')
    .or(`husband_id.eq.${individualId},wife_id.eq.${individualId}`);

  const spouseIds = (familiesAsSpouse ?? [])
    .map((f) => (f.husband_id === individualId ? f.wife_id : f.husband_id))
    .filter((id): id is string => Boolean(id));
  const familyIds = (familiesAsSpouse ?? []).map((f) => f.id);

  const { data: spouses } = spouseIds.length
    ? await db.from('individuals').select('id, full_name, birth_year, death_year, living').in('id', spouseIds)
    : { data: [] };

  const { data: childLinks } = familyIds.length
    ? await db
        .from('family_children')
        .select('individual_id, family_id')
        .in('family_id', familyIds)
    : { data: [] };
  const childIds = (childLinks ?? []).map((c) => c.individual_id);
  const { data: children } = childIds.length
    ? await db.from('individuals').select('id, full_name, birth_year, living').in('id', childIds)
    : { data: [] };

  // The subject's own siblings — fetched here rather than trusted from
  // the client brief, because twin detection needs identities and dates
  // (Betsey's grandmother's twin siblings reached the writer as two bare
  // same-year births, and the story called them unexplained).
  const { data: ownChildFamilies } = await db
    .from('family_children')
    .select('family_id')
    .eq('individual_id', individualId);
  const parentFamilyIds = (ownChildFamilies ?? []).map((f) => f.family_id);
  const { data: siblingLinks } = parentFamilyIds.length
    ? await db.from('family_children').select('individual_id').in('family_id', parentFamilyIds)
    : { data: [] };
  const siblingIds = [...new Set((siblingLinks ?? []).map((s) => s.individual_id))].filter(
    (id) => id !== individualId,
  );
  const { data: siblings } = siblingIds.length
    ? await db.from('individuals').select('id, full_name, birth_year, living').in('id', siblingIds)
    : { data: [] };

  // Birth events (with day precision where the record has it) for
  // everyone the twin scan covers.
  const twinScanIds = [...childIds, ...siblingIds];
  const { data: birthEvents } = twinScanIds.length
    ? await db
        .from('individual_events')
        .select('individual_id, date_year, date_month, date_day')
        .in('individual_id', twinScanIds)
        .eq('event_type', 'birth')
    : { data: [] };
  const birthByPerson = new Map<string, BirthDate>();
  for (const event of birthEvents ?? []) {
    if (typeof event.date_year !== 'number') continue;
    birthByPerson.set(event.individual_id, {
      year: event.date_year,
      month: typeof event.date_month === 'number' ? event.date_month : null,
      day: typeof event.date_day === 'number' ? event.date_day : null,
    });
  }

  const facts: string[] = [];
  facts.push(
    `Name: ${person.full_name}` +
      (person.sex === 'M' ? ' (male)' : person.sex === 'F' ? ' (female)' : ''),
  );
  if (person.birth_year || person.death_year) {
    facts.push(`Lived: ${person.birth_year ?? 'unknown'} – ${person.death_year ?? 'unknown'}`);
  }
  for (const event of events ?? []) {
    const line = renderEventLine(event);
    if (line) facts.push(line);
  }
  for (const family of familiesAsSpouse ?? []) {
    const spouseId = family.husband_id === individualId ? family.wife_id : family.husband_id;
    const spouse = (spouses ?? []).find((s) => s.id === spouseId);
    if (spouse) {
      const when = family.marriage_date_year ? ` in ${family.marriage_date_year}` : '';
      const where = family.marriage_place?.raw ? ` at ${family.marriage_place.raw}` : '';
      // Living spouses stay out of prompts and cached output — the same
      // doctrine the children lines below already honor.
      facts.push(
        spouse.living
          ? `Married${when}${where}`
          : `Married ${spouse.full_name} (${spouse.birth_year ?? '?'}–${spouse.death_year ?? '?'})${when}${where}`,
      );
    }
  }
  const nonLivingChildren = (children ?? []).filter((c) => !c.living);
  if (children?.length) {
    facts.push(
      `Children: ${children.length}` +
        (nonLivingChildren.length
          ? ` — including ${nonLivingChildren
              .map((c) => `${c.full_name}${c.birth_year ? ` (b. ${c.birth_year})` : ''}`)
              .join(', ')}`
          : ''),
    );
  }
  // Twins are stated as facts, never left for the writer to puzzle over.
  facts.push(...twinFactLines('children', children ?? [], birthByPerson));
  facts.push(...twinFactLines('siblings', siblings ?? [], birthByPerson));

  // Family-context weaving (spec §4.3, locked wording): relatives add
  // texture, never a roll call, and proximity is only ever claimed when the
  // bucket is known. Same voice as the rest of the biography — no separate
  // register for family content.
  const relativesSection = relatives.length
    ? `\n\nRELATIVES:\n${JSON.stringify(relatives, null, 2)}\n\n` +
      [
        'You have access to a RELATIVES list — siblings and aunts/uncles of the subject, with proximity data where available.',
        'Use these guidelines:',
        '- Weave relatives into the narrative only where they add genuine texture. Do not list them mechanically or mention every relative in every story.',
        '- Only make a proximity claim (nearby, same town, etc.) when proximity_bucket is not "unknown". Never infer or guess closeness.',
        '- proximity_bucket meanings: "same_town"/"same_county" = lived close by during overlapping years; "within_100mi" = lived in the same general region; "elsewhere" = lived far apart; "unknown" = no location data, mention the relationship only, not distance.',
        '- If a relative has no birth/death years and no proximity data, it\'s fine to omit them from the narrative entirely — sparse facts don\'t need forced inclusion.',
        '- Prefer specific, human phrasing over relationship labels: "her younger brother Thomas" rather than "sibling Thomas Howe (b. 1847)."',
        '- Some relatives carry an "activities" list — documented moments in their lives (a marriage, a death, an arrival in the country) with year, place, and how near that place was to the subject\'s own whereabouts around that time. These are the family happenings worth weaving in where they touch the subject\'s life ("the year his brother married two towns over"). The same rules apply: mention nearness only when the activity\'s proximity_bucket is known, and let uninteresting ones go unmentioned.',
        '- Do not fabricate occupations, relationships, or events involving relatives that aren\'t in the provided data.',
        '- Never conjecture causes behind events, even hedged: that several deaths cluster in one year and place is a fact worth noting; naming a probable illness or reason is invention.',
      ].join('\n')
    : '';

  // The family file's own documents (docs/media-reading-design-brief.md):
  // readings of letters, clippings, and record pages linked to this
  // person — confirmed first, then high- and medium-confidence machine
  // readings. Evidence to draw on, never facts to assert; the prompt says
  // how far to trust them.
  const { data: readingLinks } = await admin
    .from('media_links')
    .select('media_id')
    .eq('individual_id', individualId);
  const mediaIds = (readingLinks ?? []).map((l: { media_id: string }) => l.media_id);
  let documentsSection = '';
  if (mediaIds.length > 0) {
    const { data: readings } = await admin
      .from('media_readings')
      .select('kind, description, transcript, summary, confidence, status')
      .in('media_id', mediaIds)
      .in('status', ['read', 'confirmed'])
      .in('kind', ['document', 'letter', 'clipping', 'record'])
      .not('transcript', 'is', null);
    const usable = (readings ?? [])
      .filter((r: { status: string; confidence: string }) => r.status === 'confirmed' || r.confidence !== 'low')
      .sort((a: { status: string }, b: { status: string }) => (a.status === 'confirmed' ? -1 : 0) - (b.status === 'confirmed' ? -1 : 0))
      .slice(0, 6);
    if (usable.length > 0) {
      const lines = usable.map((r: { kind: string; description: string | null; transcript: string | null; summary: string | null; confidence: string; status: string }) => {
        const trust = r.status === 'confirmed' ? 'confirmed by the family' : `machine-read, ${r.confidence} confidence`;
        const body = (r.transcript ?? '').slice(0, 1800);
        return `— ${r.kind}${r.description ? ` (${r.description})` : ''} · ${trust}\n${r.summary ? `Summary: ${r.summary}\n` : ''}Text: ${body}`;
      });
      documentsSection =
        `\n\nDOCUMENTS IN THE FAMILY FILE:\n${lines.join('\n\n')}\n\n` +
        [
          'These are letters, clippings, and record pages kept in the family\'s own file and read from the page — evidence, not the record.',
          '- Draw on them where they add something the facts alone do not: what a clipping reports, what a letter was about, what a record certifies.',
          '- Say where it comes from, in plain words: "a clipping in the family file reports…", "a letter of 1911 says…". Never present a document\'s claim as an established fact of the record.',
          '- Quote sparingly — a phrase, not a paragraph — and only words that appear in the text.',
          '- Where a document contradicts the documented facts, keep the facts and note the document\'s version as the document\'s.',
          '- A machine-read document may be misread: prefer confirmed ones, and do not build a claim on a low-confidence word.',
          '- Never name a person from a document who is not in the documented facts or relatives; refer to them by role ("a cousin", "the writer") if at all.',
        ].join('\n');
    }
  }

  // The family file's own notes on this person — the NOTE records carried
  // in from the GEDCOM (Rufus, 2026-09-17: "feed them to the story writer
  // for additional material"). Reference, in the file's own words: the
  // compiler's research, transcribed records, family lore. Capped so a
  // note that runs to pages cannot crowd out the record.
  const { data: fileNotes } = await admin
    .from('individual_notes')
    .select('content, position')
    .eq('individual_id', individualId)
    .order('position');
  let notesSection = '';
  const noteTexts = (fileNotes ?? [])
    .map((n: { content: string }) => n.content.replace(/\s+/g, ' ').trim())
    .filter((t: string) => t.length > 0);
  if (noteTexts.length > 0) {
    let budget = 6000;
    const kept: string[] = [];
    for (const text of noteTexts) {
      if (budget <= 0) break;
      const slice = text.slice(0, budget);
      kept.push(slice);
      budget -= slice.length;
    }
    notesSection =
      `\n\nNOTES FROM THE FAMILY FILE:\n${kept.map((t, i) => `— note ${i + 1}: ${t}`).join('\n')}\n\n` +
      [
        'These notes were written by whoever compiled the family file — research findings, transcribed records, remembered stories. They are reference material, not the record.',
        '- Draw on them for texture the documented facts alone do not give: an occupation, a move, a church, how a marriage came about, what a family remembered.',
        '- Attribute in plain words when a note is the only source: "the family file notes that…", "according to a note in the file…". Never present a note\'s claim as a documented fact.',
        '- Where a note contradicts the documented facts, keep the facts and mention the note\'s version as the note\'s.',
        '- A note may quote a record verbatim; you may paraphrase it, and quote only words that appear in it.',
        '- Notes sometimes name people who are not in the documented facts; refer to them by role ("a neighbor", "an uncle") rather than by name.',
        '- Never invent beyond the notes, and never conjecture causes or feelings they do not state.',
      ].join('\n');
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: [
        'You write short biographies of ancestors for Witness, a family history app.',
        'Write roughly 300 words of warm, readable prose — a life story, not a data dump.',
        'Work ONLY from the facts provided. Never invent names, dates, places, occupations, or events.',
        'Make no claims about the person\'s character, feelings, beliefs, motivations, or personality — the record documents events, not inner lives. "She married in 1692" is a fact; "she was resilient" is not.',
        'Keep the language plain and concrete. No dramatic, sentimental, or florid adjectives; an adjective must be earned by a documented fact. Understatement over embellishment, always.',
        'General historical context for the time and place is welcome, but frame it clearly as context ("Salem in those years was…"), never as the person\'s own experience ("she watched in fear as…").',
        'Where the record is thin, say so honestly.',
        'If the facts contain an apparent inconsistency, treat it as a curiosity of the record, never as an error to correct.',
        'Two children of one family born in the same year are usually twins — an ordinary feature of family records, not an anomaly. Where the facts mark people as twins or likely twins, present them as such; never present same-year births as unexplained, inconsistent, or in need of explanation. When the facts say only "likely twins", keep that likelihood in your wording ("most likely twins", "probably twins") — the record supports the likelihood, not the certainty.',
        'Do not use headers, lists, or preamble. Begin directly with the person.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: `Write the biography of this ancestor.\n\nDocumented facts:\n${facts.join('\n')}${relativesSection}${documentsSection}${notesSection}`,
        },
      ],
    });
  } catch (error) {
    console.error('Anthropic call failed:', error);
    return json(502, { error: 'Biography generation failed. Please try again.' });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (response.stop_reason === 'refusal' || !textBlock) {
    return json(502, { error: 'Biography generation was declined. Please try again.' });
  }
  const biography = textBlock.text.trim();

  // Upsert on the (individual, type) key: a corrected story replaces the
  // stale-version row outright, and a concurrent-request race resolves to
  // whichever finished last — both fine responses.
  const { error: insertError } = await admin.from('enrichment_cache').upsert(
    {
      individual_id: individualId,
      tree_id: person.tree_id,
      user_id: userId,
      enrichment_type: 'biography',
      content: biography,
      model: response.model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      prompt_version: PROMPT_VERSION,
    },
    { onConflict: 'individual_id,enrichment_type' },
  );
  if (insertError) {
    console.error('Cache upsert failed:', insertError.message);
  }

  return json(200, { biography, cached: false });
});
