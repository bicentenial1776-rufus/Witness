import './node-polyfills.js';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { extractGedcomText, parseGedcom } from '../src/gedcom/index.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { fetchAllPages, PAGE_SIZE } from '../src/supabase/paginate.js';
import { loadEnv, requireEnv } from './env.js';
loadEnv();

// Fills individuals.given_name / surname / suffix for a tree whose import
// predates the parser reading the NAME line's slashes (2026-09-17, parser/
// individual.ts parseName): PAF and AncestQuest exports carry no GIVN/SURN
// subtags, so every name part landed null. Re-parses the same file with the
// fixed parser and writes only the rows whose parts differ, matched by
// GEDCOM xref. Nothing else on the row changes; full_name is checked to be
// identical before a row is touched.
//
//   npx tsx scripts/backfill-name-parts.mts <treeId> <file.ged|.zip> [--dry-run]
//
// Afterwards, the tree's stored audit and any saved tree-index copies still
// carry the old (empty) surnames: nudge trees.imported_at forward by a second
// so the audit worker re-runs and browsers refetch (see the note printed).
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [treeId, filePath] = args.filter((a) => !a.startsWith('--'));
if (!treeId || !filePath) {
  throw new Error('usage: tsx backfill-name-parts.mts <treeId> <file.ged|.zip> [--dry-run]');
}

const supabase = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
);

const parsed = parseGedcom(extractGedcomText(new Uint8Array(readFileSync(filePath))), basename(filePath));
console.log(`${basename(filePath)}: ${parsed.individuals.size.toLocaleString()} people parsed`);

type Row = {
  id: string;
  gedcom_xref: string;
  tree_id: string;
  user_id: string;
  full_name: string;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  has_death_record: boolean;
  given_name: string | null;
  surname: string | null;
  suffix: string | null;
};

const started = Date.now();
const rows = await fetchAllPages<Row>((after) => {
  let q = supabase
    .from('individuals')
    .select('id, gedcom_xref, tree_id, user_id, full_name, sex, living, has_death_record, given_name, surname, suffix')
    .eq('tree_id', treeId)
    .order('id')
    .limit(PAGE_SIZE);
  if (after) q = q.gt('id', after.id);
  return q;
}, 'Fetching individuals failed');
console.log(`${rows.length.toLocaleString()} rows in the tree, fetched in ${((Date.now() - started) / 1000).toFixed(1)}s`);

let unmatched = 0;
let nameMismatch = 0;
let unchanged = 0;
const updates: Row[] = [];
for (const row of rows) {
  const person = parsed.individuals.get(row.gedcom_xref);
  if (!person) {
    unmatched += 1;
    continue;
  }
  if (person.name.full !== row.full_name) {
    nameMismatch += 1;
    continue;
  }
  const next = {
    given_name: person.name.given ?? null,
    surname: person.name.surname ?? null,
    suffix: person.name.suffix ?? null,
  };
  if (next.given_name === row.given_name && next.surname === row.surname && next.suffix === row.suffix) {
    unchanged += 1;
    continue;
  }
  updates.push({ ...row, ...next });
}
console.log(
  `${updates.length.toLocaleString()} to update, ${unchanged.toLocaleString()} already right, ${unmatched.toLocaleString()} not in the file, ${nameMismatch.toLocaleString()} with a different full name (skipped)`,
);
const sample = updates.slice(0, 3).map((u) => `${u.full_name} → given "${u.given_name}" surname "${u.surname}"${u.suffix ? ` suffix "${u.suffix}"` : ''}`);
for (const line of sample) console.log(`  e.g. ${line}`);

if (dryRun) {
  console.log('dry run — nothing written');
  process.exit(0);
}

const BATCH = 500;
for (let i = 0; i < updates.length; i += BATCH) {
  const { error } = await supabase.from('individuals').upsert(updates.slice(i, i + BATCH), { onConflict: 'id' });
  if (error) throw new Error(`Writing batch at ${i} failed: ${error.message}`);
  if ((i / BATCH) % 20 === 0) console.log(`  ${Math.min(i + BATCH, updates.length).toLocaleString()} / ${updates.length.toLocaleString()}`);
}
console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(
  `NOTE: run  update trees set imported_at = imported_at + interval '1 second' where id = '${treeId}';  so the audit worker re-runs with surnames and saved tree-index copies refetch.`,
);
