/**
 * Overlay: attach a Family Tree Maker export's photos to a tree that
 * ALREADY lives in Witness, without re-importing it. The FTM GEDCOM has
 * no _UID, so people are matched by name and years (personMatch.ts);
 * media rows and person-level links are written onto the existing tree,
 * then the selected files are uploaded. Idempotent: rows key on
 * (tree_id, gedcom_xref), links are skipped when the pair exists, and
 * completed uploads are left alone.
 *
 * v1 attaches person-level media only (portraits and photos on the
 * person). Fact- and citation-level record images need event/citation
 * matching and stay for a later pass.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import './node-polyfills.js';
import { parseGedcom } from '../src/gedcom/index.js';
import { matchPeople, type PersonKey } from '../src/gedcom/personMatch.js';
import { buildImportPayload } from '../src/supabase/transform.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { loadEnv, requireEnv } from './env.js';
import { filesUnder, printScan, uploadMedia, type MediaRow, type UploadProfile } from './lib/ftm-media.js';

interface Options {
  gedcomPath: string;
  mediaDir: string;
  treeId: string;
  write: boolean;
  profile: UploadProfile;
  reportPath?: string;
}

function usage(): never {
  console.error(
    'Usage: npm run overlay:ftm -- <tree.ged> <media-directory> --tree-id <existing tree> [options]\n\n' +
      'Options:\n' +
      '  --write              write media rows + links onto the tree and upload selected files\n' +
      '  --images             include all referenced image files (default: primary portraits)\n' +
      '  --all                include every referenced file type\n' +
      '  --report <path>      write the unmatched people to a text file\n\n' +
      'Without --write this only reports how the two exports line up.',
  );
  process.exit(2);
}

function optionsFromArgs(): Options {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const at = args.indexOf(name);
    if (at < 0) return false;
    args.splice(at, 1);
    return true;
  };
  const valued = (name: string) => {
    const at = args.indexOf(name);
    if (at < 0) return undefined;
    const value = args[at + 1];
    args.splice(at, 2);
    return value;
  };
  const write = flag('--write');
  const all = flag('--all');
  const images = flag('--images');
  const treeId = valued('--tree-id');
  const reportPath = valued('--report');
  if (args.length !== 2 || !args[0] || !args[1] || !treeId) usage();
  return {
    gedcomPath: resolve(args[0]),
    mediaDir: resolve(args[1]),
    treeId,
    write,
    profile: all ? 'all' : images ? 'images' : 'primary',
    reportPath: reportPath ? resolve(reportPath) : undefined,
  };
}

const options = optionsFromArgs();
if (!existsSync(options.gedcomPath)) throw new Error(`GEDCOM file not found: ${options.gedcomPath}`);
if (!existsSync(options.mediaDir) || !statSync(options.mediaDir).isDirectory()) {
  throw new Error(`Media directory not found: ${options.mediaDir}`);
}

loadEnv();
const client = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
);
const { data: auth, error: authError } = await client.auth.signInWithPassword({
  email: requireEnv('WITNESS_TEST_USER_EMAIL'),
  password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
});
if (authError || !auth.user) throw new Error(`Sign in failed: ${authError?.message ?? 'no user returned'}`);
const userId = auth.user.id;

// ---- the two sides -------------------------------------------------------

console.log(`Parsing ${options.gedcomPath}`);
const parsed = parseGedcom(readFileSync(options.gedcomPath, 'utf8'), basename(options.gedcomPath));
const payload = buildImportPayload(parsed, { userId, generateId: randomUUID });

const { data: tree, error: treeError } = await client
  .from('trees')
  .select('id, name, individual_count, user_id')
  .eq('id', options.treeId)
  .single();
if (treeError || !tree) throw new Error(`Tree ${options.treeId} not readable: ${treeError?.message}`);
if (tree.user_id !== userId) throw new Error('Only the tree owner can attach media to it.');
console.log(`Target tree: "${tree.name}" (${tree.individual_count} people)`);

const targetPeople: PersonKey[] = [];
for (let offset = 0; ; offset += 1000) {
  const { data: page, error } = await client
    .from('individuals')
    .select('id, full_name, birth_year, death_year, sex')
    .eq('tree_id', options.treeId)
    .range(offset, offset + 999);
  if (error) throw new Error(`Could not read people: ${error.message}`);
  for (const row of page ?? []) {
    targetPeople.push({ id: row.id, fullName: row.full_name, birthYear: row.birth_year, deathYear: row.death_year, sex: row.sex });
  }
  if (!page || page.length < 1000) break;
}

const sourcePeople: PersonKey[] = payload.individuals.map((row) => ({
  id: row.id!,
  fullName: row.full_name,
  birthYear: row.birth_year ?? null,
  deathYear: row.death_year ?? null,
  sex: row.sex,
}));

// ---- matching ------------------------------------------------------------

const report = matchPeople(sourcePeople, targetPeople);
const targetBySource = new Map(report.matches.map((m) => [m.sourceId, m.targetId]));
console.log(`People: ${sourcePeople.length} in the FTM file, ${targetPeople.length} in Witness`);
console.log(`Matched: ${report.matches.length}`, report.byTier);
console.log(`Unmatched: ${report.unmatchedSource.length} FTM people, ${report.unmatchedTarget.length} Witness people`);

// Person-level links only (see header). A media object is carried over
// when at least one of its people matched.
const personLinks = payload.mediaLinks.filter((link) => link.individual_id);
const carriedLinks = personLinks.filter((link) => targetBySource.has(link.individual_id!));
const droppedPeople = new Set(personLinks.filter((l) => !targetBySource.has(l.individual_id!)).map((l) => l.individual_id!));
const carriedMediaIds = new Set(carriedLinks.map((link) => link.media_id));
const carriedMedia: MediaRow[] = payload.media.filter((row) => carriedMediaIds.has(row.id!));
const primaryCarried = new Set(carriedLinks.filter((l) => l.is_primary).map((l) => l.media_id));
console.log(
  `Person-level attachments: ${personLinks.length} in the file, ${carriedLinks.length} land on matched people ` +
    `(${primaryCarried.size} portraits); ${droppedPeople.size} FTM people with photos have no match.`,
);

if (options.reportPath) {
  const nameOf = new Map(sourcePeople.map((p) => [p.id, p]));
  const lines = ['# FTM people with photos and no match in Witness', ''];
  for (const id of droppedPeople) {
    const p = nameOf.get(id)!;
    lines.push(`${p.fullName}  ${p.birthYear ?? '?'}–${p.deathYear ?? '?'}`);
  }
  lines.push('', '# All unmatched FTM people', '');
  for (const id of report.unmatchedSource) {
    const p = nameOf.get(id)!;
    lines.push(`${p.fullName}  ${p.birthYear ?? '?'}–${p.deathYear ?? '?'}`);
  }
  writeFileSync(options.reportPath, lines.join('\n') + '\n');
  console.log(`Unmatched report written to ${options.reportPath}`);
}

const files = filesUnder(options.mediaDir);
console.log(`Upload profile: ${options.profile}`);
const matchedPaths = printScan(carriedMedia, files, options.mediaDir, options.profile, primaryCarried);

if (!options.write) {
  console.log('Dry run only. Add --write to attach the media to the tree and upload the selected files.');
  process.exit(0);
}

// ---- writing -------------------------------------------------------------

// Media rows: key on (tree_id, gedcom_xref) so a re-run reuses the row
// (and its uploaded bytes) rather than duplicating it.
const existingMedia = new Map<string, string>();
for (let offset = 0; ; offset += 1000) {
  const { data: page, error } = await client
    .from('media')
    .select('id, gedcom_xref')
    .eq('tree_id', options.treeId)
    .range(offset, offset + 999);
  if (error) throw new Error(`Could not read media rows: ${error.message}`);
  for (const row of page ?? []) existingMedia.set(row.gedcom_xref, row.id);
  if (!page || page.length < 1000) break;
}
const newMedia = carriedMedia
  .filter((row) => !existingMedia.has(row.gedcom_xref))
  .map((row) => ({ ...row, tree_id: options.treeId, user_id: userId }));
for (let i = 0; i < newMedia.length; i += 500) {
  const batch = newMedia.slice(i, i + 500);
  const { error } = await client.from('media').insert(batch);
  if (error) throw new Error(`Failed inserting media (batch at ${i}): ${error.message}`);
}
for (const row of newMedia) existingMedia.set(row.gedcom_xref, row.id!);
console.log(`Media rows: ${newMedia.length} added, ${carriedMedia.length - newMedia.length} already present`);

// Links: (media_id, individual_id) pairs already on the tree are skipped.
const mediaIdByPayloadId = new Map(carriedMedia.map((row) => [row.id!, existingMedia.get(row.gedcom_xref)!]));
const existingPairs = new Set<string>();
for (let offset = 0; ; offset += 1000) {
  const { data: page, error } = await client
    .from('media_links')
    .select('media_id, individual_id')
    .eq('tree_id', options.treeId)
    .not('individual_id', 'is', null)
    .range(offset, offset + 999);
  if (error) throw new Error(`Could not read media links: ${error.message}`);
  for (const row of page ?? []) existingPairs.add(`${row.media_id}|${row.individual_id}`);
  if (!page || page.length < 1000) break;
}
const newLinks: { tree_id: string; user_id: string; media_id: string; individual_id: string; is_primary: boolean }[] = [];
const seenPairs = new Set<string>();
for (const link of carriedLinks) {
  const mediaId = mediaIdByPayloadId.get(link.media_id)!;
  const individualId = targetBySource.get(link.individual_id!)!;
  const pair = `${mediaId}|${individualId}`;
  if (existingPairs.has(pair) || seenPairs.has(pair)) continue;
  seenPairs.add(pair);
  newLinks.push({ tree_id: options.treeId, user_id: userId, media_id: mediaId, individual_id: individualId, is_primary: link.is_primary ?? false });
}
for (let i = 0; i < newLinks.length; i += 500) {
  const batch = newLinks.slice(i, i + 500);
  const { error } = await client.from('media_links').insert(batch);
  if (error) throw new Error(`Failed inserting media links (batch at ${i}): ${error.message}`);
}
console.log(`Media links: ${newLinks.length} added, ${carriedLinks.length - newLinks.length} already present or folded`);

await uploadMedia(client, userId, options.treeId, matchedPaths);
