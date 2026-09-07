// Reading the media (docs/media-reading-design-brief.md): a small batch of
// complete uploads with no reading yet, each sent to the vision model
// once — classify the picture, transcribe it when it carries text, name
// what it mentions — and stored as a reading with its confidence. A
// reading is evidence, never a fact; the reader confirms or rejects in
// the app. The queue is the absence of a reading, so nothing is read
// twice and new media after a refresh is picked up on the next tick.
//
// Two doors, the match-records shape: the cron secret (service role, every
// tree, a small batch) and a caller's JWT ({ treeId, limit }) for the
// owner who wants their backlog read now.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

import { requireCronSecret } from '../_shared/cron.ts';
import { authenticate, corsHeaders, json } from '../_shared/enrich.ts';

const MODEL = 'claude-sonnet-4-6';
const PROMPT_VERSION = 'read-media-v1';
const MAX_BYTES = 4_500_000; // the model's per-image ceiling, with margin
const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const MEDIA_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

const READING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'description', 'transcript', 'summary', 'mentions', 'confidence'],
  properties: {
    kind: { type: 'string', enum: ['portrait', 'group', 'house', 'headstone', 'document', 'letter', 'clipping', 'record', 'map', 'other'] },
    description: { type: 'string', description: 'One plain sentence saying what the picture is.' },
    transcript: { type: ['string', 'null'], description: 'Every word legible in the picture, verbatim and in reading order; null when the picture carries no text worth transcribing.' },
    summary: { type: ['string', 'null'], description: 'Two or three sentences in plain words on what the text says; null when there is no transcript.' },
    mentions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text'],
        properties: { kind: { type: 'string', enum: ['name', 'date', 'place'] }, text: { type: 'string' } },
      },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
} as const;

interface Reading {
  kind: string;
  description: string;
  transcript: string | null;
  summary: string | null;
  mentions: { kind: string; text: string }[];
  confidence: 'high' | 'medium' | 'low';
}

interface MediaRow {
  id: string;
  tree_id: string;
  user_id: string;
  format: string | null;
  storage_path: string | null;
  byte_size: number | null;
  content_hash: string | null;
  title: string | null;
}

type Client = ReturnType<typeof createClient>;

async function pending(admin: Client, treeId: string | null, limit: number): Promise<MediaRow[]> {
  // Complete image uploads without a reading. PostgREST can't express
  // "no row in the other table" directly, so page through the candidates
  // in id order, subtracting the ones already read, until the batch is
  // full or the media runs out — the first page alone is exhausted after
  // a few runs and would stop the queue with thousands unread.
  const PAGE = 200;
  const out: MediaRow[] = [];
  for (let from = 0; out.length < limit; from += PAGE) {
    let q = admin
      .from('media')
      .select('id, tree_id, user_id, format, storage_path, byte_size, content_hash, title')
      .eq('upload_status', 'complete')
      .in('format', [...IMAGE_FORMATS])
      .order('id')
      .range(from, from + PAGE - 1);
    if (treeId) q = q.eq('tree_id', treeId);
    const { data, error } = await q;
    if (error) throw new Error(`media: ${error.message}`);
    const rows = (data ?? []) as MediaRow[];
    if (rows.length === 0) break;
    const { data: done, error: doneError } = await admin
      .from('media_readings')
      .select('media_id')
      .in('media_id', rows.map((r) => r.id));
    if (doneError) throw new Error(`readings: ${doneError.message}`);
    const read = new Set((done ?? []).map((r: { media_id: string }) => r.media_id));
    for (const r of rows) {
      if (!read.has(r.id)) out.push(r);
      if (out.length >= limit) break;
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

async function readOne(admin: Client, anthropic: Anthropic, row: MediaRow): Promise<'read' | 'failed'> {
  const fail = async (failure: string) => {
    await admin.from('media_readings').upsert(
      {
        media_id: row.id,
        tree_id: row.tree_id,
        user_id: row.user_id,
        content_hash: row.content_hash,
        kind: 'other',
        status: 'failed',
        failure,
        confidence: 'low',
        model: MODEL,
        prompt_version: PROMPT_VERSION,
      },
      { onConflict: 'media_id' },
    );
    return 'failed' as const;
  };

  if (!row.storage_path) return fail('No file behind this row');
  if ((row.byte_size ?? 0) > MAX_BYTES) return fail(`Too large to read as one image (${Math.round((row.byte_size ?? 0) / 1e6)} MB)`);

  const { data: blob, error } = await admin.storage.from('tree-media').download(row.storage_path);
  if (error || !blob) return fail(`Download failed: ${error?.message ?? 'no data'}`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  const format = (row.format ?? 'jpg').toLowerCase();

  let reading: Reading;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { format: { type: 'json_schema', schema: READING_SCHEMA } },
      system: [
        'You read the photographs and papers in a family history file for Witness, a family history app.',
        'First say what the picture IS (kind): a portrait of one person, a group photograph, a house or place, a headstone, a document (a certificate, record page, census sheet, form), a letter or handwritten note, a newspaper or book clipping, a map, or other.',
        'If the picture carries text — a letter, a note, a clipping, a record page, a caption — transcribe every legible word verbatim, in reading order, line breaks as " · ". Mark runs you cannot read as [illegible]. Never guess a word you cannot see and never complete a sentence from context.',
        'A portrait, group photograph, or house has no transcript unless words are written on it (a caption, a studio stamp, a name on the back): transcribe those and nothing else.',
        'The summary says in two or three plain sentences what the text is about — who wrote to whom, what a record certifies, what a clipping reports. No interpretation, no adjectives the text does not earn.',
        'Mentions are the names of people, the dates, and the places that appear in the text, each exactly as written.',
        'Confidence is your own estimate of the transcript: high for clean print, medium for good handwriting or a worn clipping, low for hard script or a poor photograph.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: MEDIA_TYPES[format] ?? 'image/jpeg', data: btoa(chunks.join('')) } },
            { type: 'text', text: row.title ? `The file is titled “${row.title}”. Read it.` : 'Read this.' },
          ],
        },
      ],
    });
    const block = response.content.find((b) => b.type === 'text');
    if (response.stop_reason === 'refusal' || !block) return fail('The reading was declined');
    reading = JSON.parse(block.text);
  } catch (error) {
    return fail(`Reading failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const { error: upsertError } = await admin.from('media_readings').upsert(
    {
      media_id: row.id,
      tree_id: row.tree_id,
      user_id: row.user_id,
      content_hash: row.content_hash,
      kind: reading.kind,
      description: reading.description,
      transcript: reading.transcript,
      summary: reading.summary,
      mentions: reading.mentions,
      confidence: reading.confidence,
      status: 'read',
      model: MODEL,
      prompt_version: PROMPT_VERSION,
    },
    { onConflict: 'media_id' },
  );
  if (upsertError) return fail(`Saving the reading failed: ${upsertError.message}`);

  // A person whose file just gained a document has a story that predates
  // it — clear the cached stories so the next open regenerates with the
  // document woven in (the register-confirm rule).
  if (reading.transcript) {
    const { data: links } = await admin.from('media_links').select('individual_id').eq('media_id', row.id).not('individual_id', 'is', null);
    const ids = (links ?? []).map((l: { individual_id: string }) => l.individual_id);
    if (ids.length > 0) {
      await admin.from('enrichment_cache').delete().in('individual_id', ids).in('enrichment_type', ['biography', 'historical_context']);
    }
  }
  return 'read';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: { treeId?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const limit = Math.max(1, Math.min(Number(body.limit ?? 8), 12));

  let admin: Client;
  let treeId: string | null = null;
  if (req.headers.get('x-cron-secret')) {
    const gate = requireCronSecret(req);
    if (gate) return gate;
    admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  } else {
    const ctx = await authenticate(req);
    if (ctx instanceof Response) return ctx;
    if (!body.treeId) return json(400, { error: 'treeId is required' });
    // The caller must own the tree — the readings are written under the owner.
    const { data: tree } = await ctx.db.from('trees').select('id, user_id').eq('id', body.treeId).maybeSingle();
    if (!tree || tree.user_id !== ctx.userId) return json(403, { error: 'Only the tree owner can read its media' });
    admin = ctx.admin;
    treeId = body.treeId;
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  const rows = await pending(admin, treeId, limit);
  let read = 0;
  let failed = 0;
  for (const row of rows) {
    const outcome = await readOne(admin, anthropic, row);
    if (outcome === 'read') read += 1;
    else failed += 1;
  }
  return json(200, { treeId, batch: rows.length, read, failed, remainingHint: rows.length === limit ? 'more' : 'none' });
});
