// generate-synthesis: the whole-ancestry essay on the Explore tab — every
// direct ancestor's facts aggregated deterministically, then one model pass
// writes the connective essay. All numbers shown to the reader come from
// the aggregation, never the model; the model writes prose sections only.
// Cached per tree; the cached row remembers the tree's individual_count,
// so when the tree grows the essay regenerates — it morphs with the record.
// Version 2: the events read used to stop at one page per chunk, so every
// essay written under version 1 counted short — and individual_count could
// not detect that, since the tree never changed. The bump retells them.
//
// POST { treeId: string } → { synthesis: SynthesisContent, cached: boolean }

import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

import {
  authenticate,
  checkDailyLimit,
  checkEntitlement,
  corsHeaders,
  json,
} from '../_shared/enrich.ts';
import { fetchAllPages } from '../_shared/family/paginate.ts';

const MODEL = 'claude-opus-5';
const PROMPT_VERSION = 2;

const ESSAY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'dek', 'sections'],
  properties: {
    title: { type: 'string', description: 'A short, specific name for this ancestry, e.g. "The Fifty-Mile Inheritance"' },
    dek: { type: 'string', description: 'One-sentence standfirst' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'body'],
        properties: {
          heading: { type: 'string' },
          body: { type: 'string', description: '1–3 paragraphs separated by \\n\\n' },
        },
      },
    },
  },
} as const;

/**
 * An `.in(...)` fetch that is safe at tree scale in both directions: the id
 * list is chunked so the URL stays short, and every chunk is range-drained
 * so a chunk whose answer runs past one page is not silently truncated.
 * Events are the reason — a hundred well-sourced ancestors carry far more
 * than one page of them, and a short read quietly undercounts the essay.
 */
async function chunkedIn<T>(
  buildQuery: (
    ids: string[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ids: string[],
  errorPrefix: string,
  size = 150,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    out.push(...(await fetchAllPages<T>((from, to) => buildQuery(chunk, from, to), errorPrefix)));
  }
  return out;
}

/** The record rows the essay is aggregated from, named so the drains stay typed. */
interface SynthRelRow {
  individual_id: string;
  generation_distance: number;
  label: string | null;
}

interface SynthPersonRow {
  id: string;
  full_name: string;
  surname: string | null;
  birth_year: number | null;
  death_year: number | null;
  living: boolean | null;
}

interface SynthEventRow {
  individual_id: string;
  event_type: string;
  date_year: number | null;
  places: { raw: string } | null;
}

const US_HINTS = /usa|united states|america/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  let body: { treeId?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  if (!body.treeId) return json(400, { error: 'treeId is required' });

  const { data: tree } = await ctx.db
    .from('trees')
    .select('id, name, individual_count, family_count')
    .eq('id', body.treeId)
    .maybeSingle();
  if (!tree) return json(404, { error: 'Tree not found' });

  // Cache: fresh while the tree hasn't grown.
  const { data: cachedRow } = await ctx.db
    .from('tree_syntheses')
    .select('content, individual_count')
    .eq('tree_id', tree.id)
    .eq('prompt_version', PROMPT_VERSION)
    .maybeSingle();
  if (cachedRow && cachedRow.individual_count === tree.individual_count) {
    return json(200, { synthesis: cachedRow.content, cached: true });
  }

  const gate = (await checkEntitlement(ctx)) ?? (await checkDailyLimit(ctx));
  if (gate) return gate;

  // ---- Deterministic aggregation over every direct ancestor ----
  // Every read here is range-drained. The essay's numbers are the reader's
  // record of their own ancestry, so a short read is not a smaller essay —
  // it is a wrong one, stated with the same confidence as a right one.
  let rels: SynthRelRow[];
  let people: SynthPersonRow[];
  let events: SynthEventRow[];
  let parentRows: { individual_id: string }[];
  try {
    rels = await fetchAllPages<SynthRelRow>(
      (from, to) =>
        ctx.db
          .from('relationships')
          .select('individual_id, generation_distance, label')
          .eq('tree_id', tree.id)
          .eq('is_direct_ancestor', true)
          .order('individual_id')
          .range(from, to),
      'Fetching relationships failed',
    );
  } catch (error) {
    console.error('Synthesis ancestor fetch failed:', error);
    return json(500, { error: 'Reading your ancestry failed. Please try again.' });
  }
  if (!rels.length) {
    return json(422, { error: 'No computed relationships yet — open the tree first.' });
  }
  const relByPerson = new Map(rels.map((r) => [r.individual_id, r]));
  const ids = [...relByPerson.keys()];

  try {
    [people, events, parentRows] = await Promise.all([
      chunkedIn<SynthPersonRow>(
        (chunk, from, to) =>
          ctx.db
            .from('individuals')
            .select('id, full_name, surname, birth_year, death_year, living')
            .in('id', chunk)
            .order('id')
            .range(from, to),
        ids,
        'Fetching ancestors failed',
      ),
      chunkedIn<SynthEventRow>(
        (chunk, from, to) =>
          ctx.db
            .from('individual_events')
            .select('individual_id, event_type, date_year, places(raw)')
            .in('individual_id', chunk)
            .order('individual_id')
            .order('id')
            .range(from, to),
        ids,
        'Fetching ancestor events failed',
        100,
      ),
      chunkedIn<{ individual_id: string }>(
        (chunk, from, to) =>
          ctx.db
            .from('family_children')
            .select('individual_id')
            .in('individual_id', chunk)
            .order('individual_id')
            .order('family_id')
            .range(from, to),
        ids,
        'Fetching parent links failed',
      ),
    ]);
  } catch (error) {
    console.error('Synthesis aggregation failed:', error);
    return json(500, { error: 'Reading your ancestry failed. Please try again.' });
  }
  const personById = new Map(people.map((p) => [p.id, p]));
  const hasParent = new Set(parentRows.map((r) => r.individual_id));
  const founders = ids.filter((id) => !hasParent.has(id));

  // Birthplace origins (country, or US state).
  const origins = new Map<string, number>();
  const towns = new Map<string, number>();
  for (const e of events) {
    const raw = (e as { places: { raw: string } | null }).places?.raw;
    if (!raw) continue;
    const parts = raw.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (e.event_type === 'birth' && parts.length) {
      let origin = parts[parts.length - 1];
      if (US_HINTS.test(origin) && parts.length >= 2) origin = parts[parts.length - 2];
      origins.set(origin, (origins.get(origin) ?? 0) + 1);
    }
    if (parts[0]) towns.set(parts[0], (towns.get(parts[0]) ?? 0) + 1);
  }

  // Lifespans by birth century (survivor-biased by construction; the essay
  // is instructed to say so).
  const spanByCentury = new Map<number, number[]>();
  let oldestBirth: number | null = null;
  for (const p of people) {
    if (p.birth_year && (oldestBirth === null || p.birth_year < oldestBirth)) {
      oldestBirth = p.birth_year;
    }
    if (p.birth_year && p.death_year && p.death_year > p.birth_year && p.death_year - p.birth_year < 110) {
      const c = Math.floor(p.birth_year / 100) * 100;
      if (!spanByCentury.has(c)) spanByCentury.set(c, []);
      spanByCentury.get(c)!.push(p.death_year - p.birth_year);
    }
  }
  const avgSpan = (c: number) => {
    const a = spanByCentury.get(c);
    return a?.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  };

  const surnames = new Set(people.map((p: { surname: string | null }) => p.surname).filter(Boolean));
  const deepestGen = Math.max(...rels.map((r) => r.generation_distance as number));
  const factCount = events.length;
  const topEntries = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  // ---- The model's raw material: aggregates + a named sample ----
  const birthYearOf = (id: string) => personById.get(id)?.birth_year ?? null;
  const founderSample = founders
    .filter((id) => !personById.get(id)?.living)
    .sort(
      (a, b) =>
        (relByPerson.get(b)!.generation_distance as number) -
        (relByPerson.get(a)!.generation_distance as number),
    )
    .slice(0, 30);
  const eventsByPerson = new Map<string, number>();
  for (const e of events) {
    eventsByPerson.set(e.individual_id, (eventsByPerson.get(e.individual_id) ?? 0) + 1);
  }
  const richestSample = ids
    .filter((id) => !personById.get(id)?.living && !founderSample.includes(id))
    .sort((a, b) => (eventsByPerson.get(b) ?? 0) - (eventsByPerson.get(a) ?? 0))
    .slice(0, 40);

  const describe = (id: string) => {
    const p = personById.get(id);
    const rel = relByPerson.get(id);
    const birth = (events as { individual_id: string; event_type: string; places: { raw: string } | null }[]).find(
      (e) => e.individual_id === id && e.event_type === 'birth' && e.places?.raw,
    );
    const place = birth?.places?.raw?.split(',').slice(0, 3).join(',').trim();
    return `${p?.full_name} (${p?.birth_year ?? '?'}–${p?.death_year ?? '?'}) · ${rel?.label}${place ? ` · b. ${place}` : ''}`;
  };

  const aggregates = [
    `Direct ancestors on record: ${ids.length} · recorded facts on them: ${factCount}`,
    `Line-founders (deepest recorded person per branch): ${founders.length} · deepest generation: ${deepestGen}`,
    `Distinct surnames in the bloodline: ${surnames.size} · oldest recorded birth: ${oldestBirth ?? 'unknown'}`,
    `Birthplaces (top): ${topEntries(origins, 14).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    `Most-recorded towns: ${topEntries(towns, 12).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    `Average lifespan by birth century: ${[1500, 1600, 1700, 1800, 1900]
      .map((c) => (avgSpan(c) !== null ? `${c}s: ${avgSpan(c)}` : null))
      .filter(Boolean)
      .join(' · ')}`,
  ].join('\n');

  const sample = [
    'DEEPEST LINE-FOUNDERS (one story arc each):',
    ...founderSample.map(describe),
    '',
    'MOST-DOCUMENTED ANCESTORS:',
    ...richestSample.map(describe),
  ].join('\n');

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESSAY_SCHEMA } },
      system: [
        'You write the whole-ancestry synthesis for Witness, a family history app: a 1–2 page essay reading ALL of one person\'s recorded direct ancestors at once, addressed to "you", the reader whose ancestry this is.',
        'Find the true shape in the aggregates — one migration or many, concentration or confluence, persistence or reinvention — and make that the thesis. 3–5 sections with short headings; the last section reflects on what these circumstances handed the reader.',
        'Work ONLY from the supplied aggregates and named ancestors for record claims. Never invent names, dates, or places.',
        'You may add well-documented historical context (wars, migrations, epidemics, famous connections of named ancestors) from your own knowledge under one hard rule: if you are not certain enough that a careful historian would state it flatly, leave it out entirely. Silence over a confident wrong claim, always.',
        'Where lineages claim medieval nobility or royalty at extreme depth, say honestly that such links are the record\'s least certain reach — genealogists distrust them.',
        'Lifespan averages are survivor-biased (ancestors by definition raised children); say so when citing them.',
        'The record speaks to circumstances, never character: geography, durability, work, wars. No horoscope claims.',
        'Warm, factual, humble. No lists in bodies; paragraphs separated by \\n\\n. Begin directly.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: `AGGREGATES over every recorded direct ancestor:\n${aggregates}\n\nNAMED ANCESTORS (record lines):\n${sample}`,
        },
      ],
    });
  } catch (error) {
    console.error('Anthropic call failed:', error);
    return json(502, { error: 'Synthesis generation failed. Please try again.' });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (response.stop_reason === 'refusal' || !textBlock) {
    return json(502, { error: 'Synthesis generation was declined. Please try again.' });
  }

  let wire: { title: string; dek: string; sections: { heading: string; body: string }[] };
  try {
    wire = JSON.parse(textBlock.text);
    if (!wire.title || !Array.isArray(wire.sections) || !wire.sections.length) {
      throw new Error('malformed');
    }
  } catch (error) {
    console.error('Malformed generation:', error);
    return json(502, { error: 'Synthesis generation failed. Please try again.' });
  }

  // The credibility block: every number deterministic, none model-written.
  const stats = [
    { label: 'PEOPLE IN THE TREE', value: (tree.individual_count ?? 0).toLocaleString('en-US') },
    { label: 'DIRECT ANCESTORS ON RECORD', value: ids.length.toLocaleString('en-US') },
    { label: 'RECORDED FACTS ON THEM', value: factCount.toLocaleString('en-US') },
    { label: 'RECORDED LINES', value: founders.length.toLocaleString('en-US') },
    { label: 'DISTINCT SURNAMES', value: surnames.size.toLocaleString('en-US') },
    { label: 'DEEPEST GENERATION', value: String(deepestGen) },
    ...(oldestBirth ? [{ label: 'OLDEST RECORDED BIRTH', value: String(oldestBirth) }] : []),
    ...(topEntries(towns, 1).length
      ? [{ label: 'MOST-RECORDED TOWN', value: topEntries(towns, 1)[0][0].toUpperCase() }]
      : []),
    ...(avgSpan(1700) !== null
      ? [{ label: 'AVG LIFESPAN, 1700s-BORN', value: `${avgSpan(1700)} YEARS` }]
      : []),
    ...(avgSpan(1800) !== null
      ? [{ label: 'AVG LIFESPAN, 1800s-BORN', value: `${avgSpan(1800)} YEARS` }]
      : []),
  ];

  const content = {
    v: 1,
    title: wire.title,
    dek: wire.dek,
    stats,
    sections: wire.sections,
    ancestorCount: ids.length,
    factCount,
    generatedAt: new Date().toISOString(),
  };

  const { error: upsertError } = await ctx.admin.from('tree_syntheses').upsert(
    {
      tree_id: tree.id,
      user_id: ctx.userId,
      content,
      individual_count: tree.individual_count ?? 0,
      ancestor_count: ids.length,
      fact_count: factCount,
      model: response.model,
      prompt_version: PROMPT_VERSION,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    { onConflict: 'tree_id,prompt_version' },
  );
  if (upsertError) console.error('Synthesis cache upsert failed:', upsertError.message);

  return json(200, { synthesis: content, cached: false });
});
