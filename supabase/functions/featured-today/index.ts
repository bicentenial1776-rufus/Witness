// Featured Today warmer: the phone Home feed's hero is record-grounded and
// cached — never a live call (docs/phone-ia-design-brief.md, decision 6).
// Every day this worker walks all trees, picks the ancestors the client's
// hero logic will pick over the next day (the digest engine's featured
// entry plus the top of the day list, window shifts included), and makes
// sure each has a digest_note in enrichment_cache. Cache hits cost
// nothing; a quiet tree costs one query. Invoked daily by pg_cron
// (migration 20260726120000); idempotent by construction.
//
// The note prompt is IDENTICAL to generate-digest-note's, so entries
// written here and entries written on demand are interchangeable.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

import { requireCronSecret } from '../_shared/cron.ts';
import { weeklyDigest } from '../_shared/digest.ts';
import { loadPersonFacts, type EnrichContext } from '../_shared/enrich.ts';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM = [
  'You write the short note under one entry in "This Week in Your Family," a weekly digest in Witness, a family history app.',
  'Write EXACTLY two sentences that place this ancestor in their historical moment — what the world around them was like, what their dates and places say about the life they led.',
  'Work ONLY from the facts provided plus broad, well-established historical context for that time and place. Never invent personal names, dates, places, or events.',
  'Be specific, never generic. "Lived through interesting times" is a failure; name the times.',
  "Make no claims about the person's character, feelings, or experiences beyond what the facts document; frame historical events as context around them, not as things they witnessed or felt. Plain, concrete language — no dramatic or sentimental adjectives.",
  'No headers, no preamble, no third sentence. Begin directly.',
].join(' ');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

  const { data: trees, error } = await supabase.from('trees').select('id, user_id');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const now = new Date();
  let warmed = 0;
  let alreadyCached = 0;
  let quiet = 0;
  const errors: string[] = [];

  for (const tree of trees ?? []) {
    try {
      const digest = await weeklyDigest(supabase, tree.id, now);
      // The client picks entries[0] ?? days[0]; days[1] covers the pick a
      // timezone behind or ahead of the server's date.
      const picks = [...new Set(
        [digest.entries[0], digest.days[0], digest.days[1]]
          .filter((entry) => entry !== undefined)
          .map((entry) => entry.individualId),
      )];
      if (picks.length === 0) {
        quiet++;
        continue;
      }

      for (const individualId of picks) {
        const { data: cached } = await supabase
          .from('enrichment_cache')
          .select('id')
          .eq('individual_id', individualId)
          .eq('enrichment_type', 'digest_note')
          .maybeSingle();
        if (cached) {
          alreadyCached++;
          continue;
        }

        const facts = await loadPersonFacts({ db: supabase } as EnrichContext, individualId);
        if (facts instanceof Response) {
          errors.push(`${tree.id}/${individualId}: facts ${facts.status}`);
          continue;
        }
        if (facts.person.living) continue; // engine already excludes; belt and braces

        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 300,
          thinking: { type: 'disabled' },
          output_config: { effort: 'low' },
          system: SYSTEM,
          messages: [
            {
              role: 'user',
              content: `Write the two-sentence note for this ancestor.\n\nDocumented facts:\n${facts.factLines.join('\n')}`,
            },
          ],
        });
        const textBlock = response.content.find((b) => b.type === 'text');
        if (response.stop_reason === 'refusal' || !textBlock) {
          errors.push(`${tree.id}/${individualId}: declined`);
          continue;
        }

        const { error: insertError } = await supabase.from('enrichment_cache').insert({
          individual_id: individualId,
          tree_id: tree.id,
          user_id: tree.user_id,
          enrichment_type: 'digest_note',
          content: textBlock.text.trim(),
          model: response.model,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        });
        if (insertError && !insertError.message.includes('duplicate')) {
          errors.push(`${tree.id}/${individualId}: insert ${insertError.message}`);
          continue;
        }
        warmed++;
      }
    } catch (err) {
      errors.push(`${tree.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length) console.error('featured-today errors:', errors);
  return Response.json({ trees: trees?.length ?? 0, warmed, alreadyCached, quiet, errors });
});
