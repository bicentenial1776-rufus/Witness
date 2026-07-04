// "The world they lived in": a ~250-word historical context narrative for
// one ancestor, grounded in Wikidata events and Chronicling America
// newspaper snippets from their time and place. Cached like biographies
// and drawing on the same daily AI budget.

import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';
import {
  authenticate,
  checkDailyLimit,
  corsHeaders,
  json,
  loadPersonFacts,
  profilePlaces,
} from '../_shared/enrich.ts';
import { fetchChroniclingAmerica, fetchWikidataEvents } from '../_shared/history-sources.ts';

const MODEL = 'claude-sonnet-4-6';

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
    .maybeSingle();
  if (cached) return json(200, { context: cached.content, cached: true });

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
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: [
        'You write "the world they lived in" — historical context for one ancestor in Witness, a family history app.',
        'Write roughly 250 words of warm, readable prose connecting this specific life to the history unfolding around it.',
        'Anchor everything to the documented facts and supplied sources. You may add well-established general history of their era and region, but never invent specifics about the person.',
        'Make the arithmetic of history felt: how old they were when events happened near them.',
        'Do not use headers, lists, or preamble. Begin directly.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content:
            `The ancestor:\n${factLines.join('\n')}\n\n` +
            (sources.length ? sources.join('\n\n') : 'No external sources were found; rely on well-established general history of the era and region.'),
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
  const context = textBlock.text.trim();

  const { error: insertError } = await ctx.admin.from('enrichment_cache').insert({
    individual_id: individualId,
    tree_id: person.tree_id,
    user_id: ctx.userId,
    enrichment_type: 'historical_context',
    content: context,
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });
  if (insertError && !insertError.message.includes('duplicate')) {
    console.error('Cache insert failed:', insertError.message);
  }

  return json(200, { context, cached: false });
});
