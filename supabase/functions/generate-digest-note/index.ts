// Generates the 2-sentence historical-context note for one weekly-digest
// entry and caches it as enrichment_type 'digest_note'. The note is written
// about the ancestor's moment in history — not the anniversary — so a cache
// hit stays correct every year the ancestor resurfaces. Living persons are
// refused server-side, same as every enrichment.

import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

import {
  authenticate,
  checkDailyLimit,
  json,
  corsHeaders,
  loadPersonFacts,
} from '../_shared/enrich.ts';

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
  const { person, factLines } = facts;

  if (person.living) {
    return json(403, {
      error: 'Digest notes are never generated for living persons.',
      code: 'living_person',
    });
  }

  const { data: cached } = await ctx.db
    .from('enrichment_cache')
    .select('content')
    .eq('individual_id', individualId)
    .eq('enrichment_type', 'digest_note')
    .maybeSingle();
  if (cached) return json(200, { note: cached.content, cached: true });

  const limited = await checkDailyLimit(ctx);
  if (limited) return limited;

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: [
        'You write the short note under one entry in "This Week in Your Family," a weekly digest in Witness, a family history app.',
        'Write EXACTLY two sentences that place this ancestor in their historical moment — what the world around them was like, what their dates and places say about the life they led.',
        'Work ONLY from the facts provided plus broad, well-established historical context for that time and place. Never invent personal names, dates, places, or events.',
        'Be specific, never generic. "Lived through interesting times" is a failure; name the times.',
        'Make no claims about the person\'s character, feelings, or experiences beyond what the facts document; frame historical events as context around them, not as things they witnessed or felt. Plain, concrete language — no dramatic or sentimental adjectives.',
        'No headers, no preamble, no third sentence. Begin directly.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: `Write the two-sentence note for this ancestor.\n\nDocumented facts:\n${factLines.join('\n')}`,
        },
      ],
    });
  } catch (error) {
    console.error('Anthropic call failed:', error);
    return json(502, { error: 'Note generation failed. Please try again.' });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (response.stop_reason === 'refusal' || !textBlock) {
    return json(502, { error: 'Note generation was declined. Please try again.' });
  }
  const note = textBlock.text.trim();

  const { error: insertError } = await ctx.admin.from('enrichment_cache').insert({
    individual_id: individualId,
    tree_id: person.tree_id,
    user_id: ctx.userId,
    enrichment_type: 'digest_note',
    content: note,
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });
  if (insertError && !insertError.message.includes('duplicate')) {
    console.error('Cache insert failed:', insertError.message);
  }

  return json(200, { note, cached: false });
});
