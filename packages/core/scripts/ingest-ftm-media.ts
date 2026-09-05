import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, normalize, relative, resolve, sep } from 'node:path';
import './node-polyfills.js';
import { parseGedcom } from '../src/gedcom/index.js';
import { buildImportPayload } from '../src/supabase/transform.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { importParsedGedcom } from '../src/supabase/import.js';
import { loadEnv, requireEnv } from './env.js';

interface Options {
  gedcomPath: string;
  mediaDir: string;
  upload: boolean;
  treeId?: string;
  profile: 'primary' | 'images' | 'all';
}

function usage(): never {
  console.error(
    'Usage: npm run ingest:ftm -- <tree.ged> <media-directory> [options]\n\n' +
      'Options:\n' +
      '  --upload             import metadata and upload selected files\n' +
      '  --tree-id <id>       resume an existing imported tree\n' +
      '  --images             include all referenced image files\n' +
      '  --all                include every referenced file type\n\n' +
      'The default upload profile is primary portraits only.',
  );
  process.exit(2);
}

function optionsFromArgs(): Options {
  const args = process.argv.slice(2);
  const uploadIndex = args.indexOf('--upload');
  const imagesIndex = args.indexOf('--images');
  const allIndex = args.indexOf('--all');
  const treeIndex = args.indexOf('--tree-id');
  const treeId = treeIndex >= 0 ? args[treeIndex + 1] : undefined;
  if (uploadIndex >= 0) args.splice(uploadIndex, 1);
  if (imagesIndex >= 0) args.splice(imagesIndex, 1);
  if (allIndex >= 0) args.splice(allIndex, 1);
  if (treeIndex >= 0) {
    const adjustedTreeIndex = args.indexOf('--tree-id');
    args.splice(adjustedTreeIndex, 2);
  }
  if (args.length !== 2 || !args[0] || !args[1]) usage();
  if (treeIndex >= 0 && !treeId) usage();
  return {
    gedcomPath: resolve(args[0]),
    mediaDir: resolve(args[1]),
    upload: uploadIndex >= 0,
    treeId,
    profile: allIndex >= 0 ? 'all' : imagesIndex >= 0 ? 'images' : 'primary',
  };
}

/**
 * Every file under the Media folder, keyed two ways: by the path relative
 * to the folder (exact) and by bare basename (fallback for GEDCOMs whose
 * FILE lines point at a machine that isn't this one). FTM folders are
 * flat in practice, but a basename shared across subfolders is ambiguous,
 * so the basename key is dropped rather than guessed — the exact key
 * still resolves it.
 */
interface MediaFiles {
  byRelative: Map<string, string>;
  byBasename: Map<string, string>;
  ambiguousBasenames: number;
}

function filesUnder(root: string): MediaFiles {
  const byRelative = new Map<string, string>();
  const byBasename = new Map<string, string>();
  const ambiguous = new Set<string>();
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        byRelative.set(relative(root, path).normalize('NFC'), path);
        const key = entry.name.normalize('NFC');
        if (byBasename.has(key)) ambiguous.add(key);
        else byBasename.set(key, path);
      }
    }
  };
  visit(root);
  for (const key of ambiguous) byBasename.delete(key);
  return { byRelative, byBasename, ambiguousBasenames: ambiguous.size };
}

function basenameOf(filePath: string | undefined): string | undefined {
  return filePath ? basename(normalize(filePath)).normalize('NFC') : undefined;
}

/**
 * The GEDCOM's FILE path, re-rooted onto the Media folder we were given:
 * FTM writes absolute paths, and the folder may have moved since export.
 */
function locate(filePath: string | null | undefined, mediaDir: string, files: MediaFiles): string | undefined {
  if (!filePath) return undefined;
  const normalized = normalize(filePath).normalize('NFC');
  const marker = basename(mediaDir).normalize('NFC') + sep;
  const at = normalized.lastIndexOf(marker);
  if (at >= 0) {
    const rel = normalized.slice(at + marker.length);
    const exact = files.byRelative.get(rel);
    if (exact) return exact;
  }
  return files.byBasename.get(basenameOf(normalized) ?? '');
}

function isImage(filePath: string | null | undefined): boolean {
  return /\.(jpe?g|png|gif|webp)$/i.test(filePath ?? '');
}

function printScan(
  mediaRows: ReturnType<typeof buildImportPayload>['media'],
  files: MediaFiles,
  mediaDir: string,
  profile: Options['profile'],
  primaryMediaIds: Set<string>,
): Map<string, string> {
  let matched = 0;
  let missing = 0;
  let bytes = 0;
  const matchedPaths = new Map<string, string>();
  for (const row of mediaRows) {
    const source = locate(row.file_path, mediaDir, files);
    if (!source) {
      missing += 1;
      continue;
    }
    const selected = profile === 'all' || (profile === 'images' && isImage(row.file_path)) || (profile === 'primary' && primaryMediaIds.has(row.id!));
    if (selected) {
      matched += 1;
      bytes += statSync(source).size;
      matchedPaths.set(row.gedcom_xref, source);
    }
  }
  const referenced = new Set(
    mediaRows.map((row) => locate(row.file_path, mediaDir, files)).filter((path): path is string => Boolean(path)),
  );
  const unreferenced = [...files.byRelative.values()].filter((path) => !referenced.has(path)).length;
  console.log(`Media rows: ${mediaRows.length}`);
  console.log(`Selected files: ${matched}`);
  console.log(`Missing files: ${missing}`);
  console.log(`Unreferenced files: ${unreferenced}`);
  if (files.ambiguousBasenames > 0) {
    console.log(`Ambiguous basenames (matched by exact path only): ${files.ambiguousBasenames}`);
  }
  console.log(`Matched bytes: ${(bytes / 1_000_000_000).toFixed(2)} GB`);
  return matchedPaths;
}

async function uploadMedia(
  client: ReturnType<typeof createWitnessClient>,
  userId: string,
  treeId: string,
  mediaRows: ReturnType<typeof buildImportPayload>['media'],
  matchedPaths: Map<string, string>,
): Promise<void> {
  const rows: { id: string; gedcom_xref: string; file_path: string | null; upload_status: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error: selectError } = await client
      .from('media')
      .select('id, gedcom_xref, file_path, upload_status')
      .eq('tree_id', treeId)
      .range(offset, offset + 999);
    if (selectError) throw new Error(`Could not read imported media rows: ${selectError.message}`);
    rows.push(...(page ?? []));
    if (!page || page.length < 1000) break;
  }

  const rowByXref = new Map((rows ?? []).map((row) => [row.gedcom_xref, row]));
  let uploaded = 0;
  let skipped = 0;
  let missingSource = 0;
  let missingRow = 0;
  let alreadyComplete = 0;
  let failed = 0;
  for (const metadata of mediaRows) {
    const source = matchedPaths.get(metadata.gedcom_xref);
    const row = rowByXref.get(metadata.gedcom_xref);
    if (!source || !row) {
      skipped += 1;
      if (!source) missingSource += 1;
      if (!row) missingRow += 1;
      continue;
    }
    if (row.upload_status === 'complete') {
      skipped += 1;
      alreadyComplete += 1;
      continue;
    }
    const bytes = readFileSync(source);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const storagePath = `${userId}/${treeId}/${row.id}${extname(source).toLowerCase()}`;
    const { error: uploadError } = await client.storage
      .from('tree-media')
      .upload(storagePath, bytes, { contentType: contentType(source), upsert: false });
    if (uploadError && !/already exists/i.test(uploadError.message)) {
      // One bad file must not abandon the other six hundred; the row stays
      // pending and the next --tree-id run picks it up.
      failed += 1;
      console.warn(`Upload failed for ${source}: ${uploadError.message}`);
      continue;
    }
    const { error: updateError } = await client
      .from('media')
      .update({
        storage_path: storagePath,
        byte_size: bytes.byteLength,
        content_hash: hash,
        upload_status: 'complete',
      })
      .eq('id', row.id)
      .eq('tree_id', treeId);
    if (updateError) throw new Error(`Metadata update failed for ${source}: ${updateError.message}`);
    uploaded += 1;
    if (uploaded % 25 === 0) console.log(`Uploaded ${uploaded}/${mediaRows.length}`);
  }
  console.log(
    `Upload complete: ${uploaded} uploaded, ${failed} failed, ${skipped} skipped ` +
      `(missing source ${missingSource}, missing row ${missingRow}, already complete ${alreadyComplete}).`,
  );
}

function contentType(path: string): string {
  const extension = extname(path).toLowerCase();
  return (
    {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.txt': 'text/plain',
    }[extension] ?? 'application/octet-stream'
  );
}

const options = optionsFromArgs();
if (!existsSync(options.gedcomPath)) throw new Error(`GEDCOM file not found: ${options.gedcomPath}`);
if (!existsSync(options.mediaDir) || !statSync(options.mediaDir).isDirectory()) {
  throw new Error(`Media directory not found: ${options.mediaDir}`);
}

console.log(`Parsing ${options.gedcomPath}`);
const parsed = parseGedcom(readFileSync(options.gedcomPath, 'utf8'), basename(options.gedcomPath));
const payload = buildImportPayload(parsed, { userId: 'dry-run', generateId: randomUUID });
const files = filesUnder(options.mediaDir);
const primaryMediaIds = new Set(payload.mediaLinks.filter((link) => link.is_primary).map((link) => link.media_id));
console.log(`Upload profile: ${options.profile}`);
const matchedPaths = printScan(payload.media, files, options.mediaDir, options.profile, primaryMediaIds);

if (!options.upload) {
  console.log('Dry run only. Add --upload to import metadata and upload matched files.');
  process.exit(0);
}

loadEnv();
const client = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
);
const email = requireEnv('WITNESS_TEST_USER_EMAIL');
const password = requireEnv('WITNESS_TEST_USER_PASSWORD');
const { data, error } = await client.auth.signInWithPassword({ email, password });
if (error || !data.user) throw new Error(`Sign in failed: ${error?.message ?? 'no user returned'}`);

const treeId = options.treeId ?? (await importParsedGedcom(client, parsed, { userId: data.user.id })).treeId;
console.log(options.treeId ? `Resuming tree ${treeId}` : `GEDCOM metadata imported as tree ${treeId}`);
await uploadMedia(client, data.user.id, treeId, payload.media, matchedPaths);
