// "The world they lived in": a ~250-word historical context narrative for
// one ancestor, grounded in Wikidata events and Chronicling America
// newspaper snippets from their time and place. Cached like biographies
// and drawing on the same daily AI budget.

import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';
import {
  authenticate,
  checkDailyLimit,
  checkEntitlement,
  corsHeaders,
  json,
  loadPersonFacts,
  profilePlaces,
} from '../_shared/enrich.ts';
import { fetchChroniclingAmerica, fetchWikidataEvents } from '../_shared/history-sources.ts';

const MODEL = 'claude-sonnet-4-6';

// Bumped whenever the writer's inputs or instructions materially improve;
// read and written at this version, so stale contexts quietly expire and
// regenerate on the next view (the biography's pattern). v2 (2026-08-29):
// the world text renders directly beneath the story in one panel, so the
// writer is told the life is already told — but it still opened with the
// birth. v3 (same day): the opening is constrained structurally — first
// sentence may not carry the name or the birth; open with the place or
// the era. v1 texts opened as a second biography.
const PROMPT_VERSION = 3;

/**
 * Cache rows carry either legacy plain prose (pre-2026-08-18) or a v2 JSON
 * envelope: { v: 2, sourced, sources, general }. `sourced` is the narrative
 * grounded in archive/Wikidata data (attributable by name, spec §7.5);
 * `general` is the model's own well-documented history for the place and
 * period — a distinct, generically-labeled tier, null when the model
 * declined rather than guess (spec §7.6: silence over confident error).
 */
function parseWorldContent(content: string): {
  context: string;
  general: string | null;
  sources: string[];
} {
  try {
    const parsed = JSON.parse(content);
    if (parsed && parsed.v === 2 && typeof parsed.sourced === 'string') {
      return {
        context: parsed.sourced,
        general: typeof parsed.general === 'string' && parsed.general.trim() ? parsed.general : null,
        sources: Array.isArray(parsed.sources) ? parsed.sources.filter((s: unknown) => typeof s === 'string') : [],
      };
    }
  } catch {
    // Legacy prose falls through.
  }
  return { context: content, general: null, sources: [] };
}

const WORLD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sourced', 'general'],
  properties: {
    sourced: {
      type: 'string',
      description: 'The ~250-word "world they lived in" narrative, grounded in the supplied facts and sources.',
    },
    general: {
      type: ['string', 'null'],
      description:
        'Additional well-documented history for this place and period from your own knowledge, 60-150 words — or null to decline.',
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let individualId: string;
  try {
    ({ individualId } = await req.json());
    if (typeof individualId !== 'string') throw new Error();
  } catch {
    return json(400, { error: 'Body must be JSON with an individualId string' });
  }

  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  const facts = await loadPersonFacts(ctx, individualId);
  if (facts instanceof Response) return facts;
  const { person, events, factLines } = facts;

  if (person.living) {
    return json(403, {
      error: 'Historical context is not generated for living persons.',
      code: 'living_person',
    });
  }
  if (!person.birth_year && !person.death_year) {
    return json(422, {
      error: 'This ancestor has no dated events to anchor historical context to.',
      code: 'undatable',
    });
  }

  const { data: cached } = await ctx.db
    .from('enrichment_cache')
    .select('content')
    .eq('individual_id', individualId)
    .eq('enrichment_type', 'historical_context')
    .eq('prompt_version', PROMPT_VERSION)
    .maybeSingle();
  if (cached) return json(200, { ...parseWorldContent(cached.content), cached: true });

  const gated = await checkEntitlement(ctx);
  if (gated) return gated;
  const limited = await checkDailyLimit(ctx);
  if (limited) return limited;

  const startYear = person.birth_year ?? person.death_year! - 70;
  const endYear = person.death_year ?? person.birth_year! + 70;
  const places = profilePlaces(events);

  const [wikidataEvents, newspapers] = await Promise.all([
    fetchWikidataEvents(places.country, startYear, endYear),
    places.isAmerican
      ? fetchChroniclingAmerica(places.town, places.usState, startYear, endYear)
      : Promise.resolve([]),
  ]);

  const sources: string[] = [];
  if (wikidataEvents.length) {
    sources.push(
      'Historical events in their country during their lifetime (from Wikidata):\n' +
        wikidataEvents.map((e) => `- ${e.year}: ${e.label}`).join('\n'),
    );
  }
  if (newspapers.length) {
    sources.push(
      'Excerpts from local newspapers of their time and place (OCR text, noisy — treat as texture, quote only when clearly legible):\n' +
        newspapers.map((n) => `- ${n.title} (${n.date}): "${n.snippet}"`).join('\n'),
    );
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: WORLD_SCHEMA } },
      system: [
        'You write "the world they lived in" — historical context for one ancestor in Witness, a family history app.',
        'Your text renders directly beneath an AI-written biography of the same person, in the same panel, as the second half of one continuous read. That biography has already told the life itself — birth, marriage, children, death, moves.',
        'So: never retell the life. Do not restate their milestones or dates, do not narrate their family. Write what surrounded the life — the town, the region, the era and its upheavals — so the piece reads as a natural continuation of the story above it.',
        'HARD RULE for the opening: the first sentence must not contain the person\'s name and must not mention their birth. Open with the place or the era, the way a second paragraph would — "The Gloucester she grew up in was…", "Essex County in those years…", "The harbor that governed the town\'s fortunes…".',
        'You produce TWO tiers, returned as JSON.',
        'Tier 1, "sourced": roughly 250 words of warm, readable prose on the history unfolding around this life.',
        'Anchor everything to the documented facts and supplied sources. Never invent specifics about the person.',
        'Make the arithmetic of history felt: how old they were when events happened near them — the age as an anchor is welcome; the milestone itself is already told.',
        'Tier 2, "general": 60–150 words on significant, well-documented history of their specific place and period that the supplied sources do not cover — drawn from your own knowledge. Any event you are genuinely confident of qualifies, from national upheavals to well-recorded regional ones (deportations, famines, migrations, epidemics, wars).',
        'The general tier has one hard rule: if you are not certain enough that a careful historian would state it flatly, return null for the tier. Decline entirely rather than hedge or guess — silence is the correct failure mode, never a confidently-stated wrong claim. Do not pad it with vague generalities to avoid returning null.',
        'Do not repeat the sourced tier\'s material in the general tier.',
        'Both tiers: no headers, no lists, no preamble. Begin directly.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content:
            `The ancestor:\n${factLines.join('\n')}\n\n` +
            (sources.length ? sources.join('\n\n') : 'No external sources were found; the sourced tier should rely on the documented facts of the life alone.') +
            '\n\nRemember: the life above is already told. Open with the world — the place or the era — never with the person\'s name or birth.',
        },
      ],
    });
  } catch (error) {
    console.error('Anthropic call failed:', error);
    return json(502, { error: 'Context generation failed. Please try again.' });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (response.stop_reason === 'refusal' || !textBlock) {
    return json(502, { error: 'Context generation was declined. Please try again.' });
  }
  let sourced: string;
  let general: string | null;
  try {
    const wire = JSON.parse(textBlock.text);
    sourced = String(wire.sourced ?? '').trim();
    general = typeof wire.general === 'string' && wire.general.trim() ? wire.general.trim() : null;
    if (!sourced) throw new Error('empty sourced tier');
  } catch (error) {
    console.error('Malformed generation:', error);
    return json(502, { error: 'Context generation failed. Please try again.' });
  }

  const sourceNames = [
    ...(wikidataEvents.length ? ['Wikidata'] : []),
    ...(newspapers.length ? ['Chronicling America'] : []),
  ];

  const { error: insertError } = await ctx.admin.from('enrichment_cache').upsert(
    {
      individual_id: individualId,
      tree_id: person.tree_id,
      user_id: ctx.userId,
      enrichment_type: 'historical_context',
      content: JSON.stringify({ v: 2, sourced, sources: sourceNames, general }),
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

  // QA log (spec §7.7): a declined general tier is recorded — person, place,
  // period — so tier silence is measurable without the reader ever seeing
  // the signal. Lives in the cache table under its own type; the UI never
  // queries it, and the unique constraint makes re-logging a no-op.
  if (general === null) {
    const { error: declineError } = await ctx.admin.from('enrichment_cache').insert({
      individual_id: individualId,
      tree_id: person.tree_id,
      user_id: ctx.userId,
      enrichment_type: 'historical_context_decline',
      content: JSON.stringify({
        town: places.town ?? null,
        country: places.country ?? null,
        startYear,
        endYear,
      }),
      model: response.model,
      input_tokens: 0,
      output_tokens: 0,
    });
    if (declineError && !declineError.message.includes('duplicate')) {
      console.error('Decline log failed:', declineError.message);
    }
  }

  return json(200, { context: sourced, general, sources: sourceNames, cached: false });
});
