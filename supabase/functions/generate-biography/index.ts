// Generates a ~300-word AI biography for one ancestor and caches it in
// enrichment_cache. Runs server-side so the Anthropic key never reaches
// the client. Reads use the caller's JWT (RLS proves ownership); the
// cache insert uses the service role. Living persons are refused here,
// not just hidden in the UI.

import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  DAILY_LIMIT,
  corsHeaders,
  json,
  renderEventLine,
  type EventRow,
} from '../_shared/enrich.ts';

const MODEL = 'claude-sonnet-4-6';

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
  const { data: cached } = await db
    .from('enrichment_cache')
    .select('content, model, created_at')
    .eq('individual_id', individualId)
    .eq('enrichment_type', 'biography')
    .maybeSingle();
  if (cached) return json(200, { biography: cached.content, cached: true });

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
    ? await db.from('individuals').select('full_name, birth_year, living').in('id', childIds)
    : { data: [] };

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
        'Do not use headers, lists, or preamble. Begin directly with the person.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: `Write the biography of this ancestor.\n\nDocumented facts:\n${facts.join('\n')}${relativesSection}`,
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

  const { error: insertError } = await admin.from('enrichment_cache').insert({
    individual_id: individualId,
    tree_id: person.tree_id,
    user_id: userId,
    enrichment_type: 'biography',
    content: biography,
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });
  // A concurrent request may have won the unique constraint race; the
  // content we just generated is still a fine response.
  if (insertError && !insertError.message.includes('duplicate')) {
    console.error('Cache insert failed:', insertError.message);
  }

  return json(200, { biography, cached: false });
});
