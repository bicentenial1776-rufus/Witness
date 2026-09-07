/**
 * Phase 1 of reading the media (docs/media-reading-design-brief.md): the
 * text we already have. Clippings (.htm), PDFs, Word and text files in a
 * tree's Media folder carry their words outright — no model needed — so
 * this extracts them on the desktop (pdftotext, macOS textutil) and
 * writes each as a reading with high confidence. Idempotent: a media row
 * that already has a reading is skipped.
 *
 *   npm run read:media-text -- <media-directory> --tree-id <id> [--write]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import './node-polyfills.js';
import { createWitnessClient } from '../src/supabase/client.js';
import type { Database } from '../src/supabase/database.types.js';
import { loadEnv, requireEnv } from './env.js';
import { filesUnder, locate } from './lib/ftm-media.js';

const TEXT_FORMATS: Record<string, 'clipping' | 'document'> = {
  htm: 'clipping',
  html: 'clipping',
  pdf: 'document',
  txt: 'document',
  doc: 'document',
  docx: 'document',
  rtf: 'document',
};

function usage(): never {
  console.error('Usage: npm run read:media-text -- <media-directory> --tree-id <id> [--write]');
  process.exit(2);
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const treeAt = args.indexOf('--tree-id');
const treeId = treeAt >= 0 ? args[treeAt + 1] : undefined;
const positional = args.filter((a, i) => !a.startsWith('--') && i !== treeAt + 1);
const mediaDir = positional[0] ? resolve(positional[0]) : undefined;
if (!mediaDir || !treeId || !existsSync(mediaDir) || !statSync(mediaDir).isDirectory()) usage();

/** Plain text out of a file, by its extension; empty when nothing usable. */
function extractText(path: string): string {
  const ext = extname(path).toLowerCase().replace('.', '');
  try {
    if (ext === 'txt') return readFileSync(path, 'utf8');
    if (ext === 'pdf') return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', path, '-'], { encoding: 'utf8', maxBuffer: 50_000_000 });
    // textutil reads html, rtf, doc, and docx alike and hands back plain text.
    return execFileSync('textutil', ['-convert', 'txt', '-stdout', path], { encoding: 'utf8', maxBuffer: 50_000_000 });
  } catch (error) {
    console.warn(`  could not extract ${path}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    return '';
  }
}

function tidy(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The first two sentences, or the first 240 characters, in plain words. */
function summarize(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const sentences = flat.match(/[^.!?]+[.!?]+/g);
  const lead = sentences ? sentences.slice(0, 2).join(' ').trim() : flat;
  return lead.length > 300 ? `${lead.slice(0, 297).trimEnd()}…` : lead;
}

/** Years and capitalised name-like pairs, as a first pass at mentions. */
function mentions(text: string): { kind: string; text: string }[] {
  const out: { kind: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const year of text.match(/\b1[6-9]\d\d\b/g) ?? []) {
    if (!seen.has(`date:${year}`)) { seen.add(`date:${year}`); out.push({ kind: 'date', text: year }); }
    if (out.length > 40) break;
  }
  for (const name of text.match(/\b[A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+\b/g) ?? []) {
    if (/^(The|This|That|New|North|South|East|West|United|Find|Family|Born|Died|Married) /.test(name)) continue;
    if (!seen.has(`name:${name}`)) { seen.add(`name:${name}`); out.push({ kind: 'name', text: name }); }
    if (out.length > 80) break;
  }
  return out;
}

loadEnv();
const client = createWitnessClient(requireEnv('EXPO_PUBLIC_SUPABASE_URL'), requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'));
const { data: auth, error: authError } = await client.auth.signInWithPassword({
  email: requireEnv('WITNESS_TEST_USER_EMAIL'),
  password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
});
if (authError || !auth.user) throw new Error(`Sign in failed: ${authError?.message ?? 'no user returned'}`);

const media: { id: string; file_path: string | null; format: string | null; title: string | null; content_hash: string | null }[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await client
    .from('media')
    .select('id, file_path, format, title, content_hash')
    .eq('tree_id', treeId!)
    .in('format', Object.keys(TEXT_FORMATS))
    .order('id')
    .range(from, from + 999);
  if (error) throw new Error(`media: ${error.message}`);
  media.push(...(data ?? []));
  if (!data || data.length < 1000) break;
}
const { data: already } = await client.from('media_readings').select('media_id').eq('tree_id', treeId!);
const done = new Set((already ?? []).map((r) => r.media_id));
const files = filesUnder(mediaDir!);
console.log(`${media.length} text-bearing media rows · ${done.size} readings already on the tree`);

let read = 0;
let skipped = 0;
let missing = 0;
let empty = 0;
const byKind: Record<string, number> = {};
type ReadingInsert = Database['public']['Tables']['media_readings']['Insert'];
const rows: ReadingInsert[] = [];
for (const row of media) {
  if (done.has(row.id)) { skipped += 1; continue; }
  const path = locate(row.file_path, mediaDir!, files);
  if (!path) { missing += 1; continue; }
  const text = tidy(extractText(path));
  if (text.length < 40) { empty += 1; continue; }
  // A scanned page run through a text converter comes out as symbol
  // noise ("^ O t ^ ^ -Ui^d^^"): the share of letters says whether the
  // words are really there. Below half, there is no text to keep; between
  // half and three quarters, keep it but say the reading is shaky.
  const letters = (text.match(/[A-Za-z]/g) ?? []).length / text.length;
  if (letters < 0.5) { empty += 1; continue; }
  const confidence = letters < 0.75 ? 'medium' : 'high';
  const kind = TEXT_FORMATS[(row.format ?? '').toLowerCase()] ?? 'document';
  byKind[kind] = (byKind[kind] ?? 0) + 1;
  rows.push({
    media_id: row.id,
    tree_id: treeId,
    user_id: auth.user.id,
    content_hash: row.content_hash,
    kind,
    description: row.title ? `${kind === 'clipping' ? 'A clipping' : 'A document'}: ${row.title}` : kind === 'clipping' ? 'A clipping' : 'A document',
    transcript: text.slice(0, 60_000),
    summary: summarize(text),
    mentions: mentions(text),
    confidence,
    status: 'read',
    model: 'text-extraction',
    prompt_version: 'read-media-text-v1',
  });
  read += 1;
}
console.log(`ready: ${read} (by kind: ${JSON.stringify(byKind)}) · skipped: ${skipped} · missing on disk: ${missing} · no usable text: ${empty}`);
if (!write) {
  for (const r of rows.slice(0, 5)) console.log(`\n— ${r.description} · ${r.confidence}\n  ${String(r.summary).slice(0, 200)}`);
  console.log('\nDry run. Add --write to store the readings.');
  process.exit(0);
}
for (let i = 0; i < rows.length; i += 200) {
  const { error } = await client.from('media_readings').upsert(rows.slice(i, i + 200), { onConflict: 'media_id' });
  if (error) throw new Error(`Writing readings failed: ${error.message}`);
}
// Stories that predate their documents regenerate on next open.
const { data: links } = await client.from('media_links').select('individual_id').in('media_id', rows.map((r) => r.media_id)).not('individual_id', 'is', null);
const ids = [...new Set((links ?? []).map((l) => l.individual_id as string))];
if (ids.length > 0) {
  await client.from('enrichment_cache').delete().in('individual_id', ids).in('enrichment_type', ['biography', 'historical_context']);
}
console.log(`wrote ${rows.length} readings; cleared cached stories for ${ids.length} people.`);
