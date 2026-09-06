/**
 * Proving-vehicle import: a Family Tree Maker GEDCOM + Media folder as a
 * NEW tree, with the selected files uploaded. For a tree that already
 * lives in Witness use overlay-ftm-media.ts instead — a re-import orphans
 * verdicts, notes, stones, and family shares.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import './node-polyfills.js';
import { parseGedcom } from '../src/gedcom/index.js';
import { buildImportPayload } from '../src/supabase/transform.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { importParsedGedcom } from '../src/supabase/import.js';
import { loadEnv, requireEnv } from './env.js';
import { filesUnder, printScan, uploadMedia, type UploadProfile } from './lib/ftm-media.js';

interface Options {
  gedcomPath: string;
  mediaDir: string;
  upload: boolean;
  treeId?: string;
  profile: UploadProfile;
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
await uploadMedia(client, data.user.id, treeId, matchedPaths);
