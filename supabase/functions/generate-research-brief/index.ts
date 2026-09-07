// Research Brief Generator: a structured, expert starting point for one
// brick wall in the tree. The function works out what's actually missing
// from the record (parents, dates, places), then asks Claude for specific
// research questions and named sources — a beginning, not a solution.

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
      error: 'Research briefs are not generated for living persons.',
      code: 'living_person',
    });
  }

  const gated = await checkEntitlement(ctx);
  if (gated) return gated;
  const limited = await checkDailyLimit(ctx);
  if (limited) return limited;

  // Identify the wall: what does the record not know about this person?
  const gaps: string[] = [];
  const { data: childLink } = await ctx.db
    .from('family_children')
    .select('family_id')
    .eq('individual_id', individualId)
    .maybeSingle();
  if (!childLink) gaps.push('No parents are recorded — the line ends here.');
  if (!person.birth_year) gaps.push('No birth date is recorded.');
  if (!events.some((e) => e.event_type === 'birth' && e.places)) {
    gaps.push('No birthplace is recorded.');
  }
  if (!person.death_year) gaps.push('No death date is recorded.');
  if (!events.some((e) => (e.event_type === 'death' || e.event_type === 'burial') && e.places)) {
    gaps.push('No death or burial place is recorded.');
  }
  if (!gaps.length) gaps.push('The vital record looks complete; the wall is contextual (occupation, migration reasons, records between the known events).');

  const places = profilePlaces(events);
  const era = person.birth_year ?? person.death_year ?? null;

  const { data: tree } = await ctx.db.from('trees').select('name').eq('id', person.tree_id).single();

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'medium',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Short brief title naming the wall, e.g. "Finding the parents of John Howe (b. 1576)"',
              },
              framing: { type: 'string', description: 'One sentence framing the nature of this wall.' },
              content: {
                type: 'string',
                description: 'The full brief body in markdown: ## Research questions (ordered by likelihood of yielding results), ## Suggested sources (named archives, databases, record types — never generic advice), ## Why records may be missing (war, fire, pre-registration era, denomination gaps for this era and region), ## What breaking through looks like (the specific record that would open the next generation).',
              },
            },
            required: ['title', 'framing', 'content'],
            additionalProperties: false,
          },
        },
      },
      system: [
        'You are an expert genealogist writing a research brief for Witness, a family history app.',
        'A research brief is an expert starting point, not a conclusion: specific, actionable research questions and named sources for one brick wall.',
        'Name real archives, databases, and record types appropriate to the era, region, and denomination (e.g. Massachusetts town vital records, NEHGS, FamilySearch film collections, county probate, land deeds, church registers). Never give generic advice like "search online databases".',
        'Order research questions by likelihood of yielding results. Frame everything as a beginning; guarantee nothing.',
        'Work only from the supplied facts; never invent details about the person.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content:
            `The ancestor:\n${factLines.join('\n')}\n\n` +
            `The wall:\n${gaps.map((g) => `- ${g}`).join('\n')}\n\n` +
            `Dominant region: ${places.usState ?? places.country ?? 'unknown'}. Era: ${era ?? 'unknown'}.`,
        },
      ],
    });
  } catch (error) {
    console.error('Anthropic call failed:', error);
    return json(502, { error: 'Brief generation failed. Please try again.' });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (response.stop_reason === 'refusal' || !textBlock) {
    return json(502, { error: 'Brief generation was declined. Please try again.' });
  }

  let parsed: { title: string; framing: string; content: string };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return json(502, { error: 'Brief generation returned an unexpected format. Please try again.' });
  }

  const generatedAt = new Date().toISOString().slice(0, 10);
  const content =
    `*${parsed.framing}*\n\n${parsed.content}\n\n---\n` +
    `Generated ${generatedAt} · ${tree?.name ?? 'your tree'} · witnesslives.com`;

  const { data: inserted, error: insertError } = await ctx.admin
    .from('research_briefs')
    .insert({
      individual_id: individualId,
      tree_id: person.tree_id,
      user_id: ctx.userId,
      title: parsed.title,
      content,
      model: response.model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })
    .select('id')
    .single();
  if (insertError) return json(500, { error: insertError.message });

  return json(200, { id: inserted.id, title: parsed.title, content });
});
