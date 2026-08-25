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
const PROMPT_VERSION = 1;
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
        required: ['personId', 'story', 'world'],
        properties: {
          personId: { type: 'string' },
          story: { type: 'string', description: '2–6 sentences connecting this life to the line' },
          world: {
            type: 'array',
            items: { type: 'string' },
            description: '0–2 short world-event chips, e.g. "King Philip\'s War · 1675–76"',
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

  // The prompt: living members appear only as anonymous closing generations.
  const promptLines = chain.map((c, i) => {
    if (c.living) {
      return `GENERATION ${i + 1} (id ${c.id}): [a living member of the family — do not name or describe; if this is the last generation, close the arc addressed to "you", the reader]`;
    }
    return [
      `GENERATION ${i + 1} (id ${c.id}): ${c.name} (${c.birth ?? '?'}–${c.death ?? '?'})`,
      ...c.facts.map((f) => `  - ${f}`),
    ].join('\n');
  });

  // Everything up to here is quick queries; only the model call is long.
  // In warm mode that call runs past the response via EdgeRuntime.waitUntil
  // so the featured-today fan-out never holds N generations on its own
  // wall clock (it did once, and died of WORKER_RESOURCE_LIMIT for it).
  const finish = async (): Promise<Response> => {
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 6000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ARC_SCHEMA } },
      system: [
        'You write generational story arcs for Witness, a family history app: one bloodline, founder to reader, told as a flowing descent.',
        'For each generation write 2–6 sentences (JSON "story"): lead with what the record shows, connect each life to the one before it, and let places and moves carry the narrative. Where the record is rich, use it — more record, more sentences. Where it is thin, be honestly brief; never pad.',
        'Work ONLY from the facts provided for names, dates, places, marriages, and moves. Never invent record specifics. No claims about personality, feelings, or motivations.',
        'World events (JSON "world", 0–2 per generation, format "Name · years"): well-documented history that genuinely intersects this life\'s time and place, from your own knowledge. Hard rule: if you are not certain enough that a careful historian would state it flatly, omit it — an empty list is the correct failure mode. You may weave a world event into the story prose only under the same certainty rule.',
        'A living generation gets one or two graceful closing sentences addressed to "you" — never a name, never facts.',
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

  let wire: { title: string; dek: string; generations: { personId: string; story: string; world: string[] }[] };
  try {
    wire = JSON.parse(textBlock.text);
    if (!wire.title || !Array.isArray(wire.generations)) throw new Error('malformed');
  } catch (error) {
    console.error('Malformed generation:', error);
    return json(502, { error: 'Story generation failed. Please try again.' });
  }
  const storyById = new Map(wire.generations.map((g) => [g.personId, g]));

  // Content = record data (server-assembled) + model prose, zipped by id.
  const content = {
    v: 1,
    title: wire.title,
    dek: wire.dek,
    founderId,
    generations: chain.map((c) => ({
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
