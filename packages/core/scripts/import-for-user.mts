import './node-polyfills.js';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { extractGedcomText, parseGedcom } from '../src/gedcom/index.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { importParsedGedcom } from '../src/supabase/import.js';
import { loadEnv, requireEnv } from './env.js';
loadEnv();

// Import a GEDCOM into a real account on the reader's behalf (support for
// someone who can't run a 25-minute browser import themselves). Service-role
// because there is no session; user_id is supplied explicitly and stamped on
// every row, exactly as the in-app import does.
//
// The in-app import ends by calling reuse_geocodes, which checks auth.uid()
// and so no-ops here — copy coordinates afterwards with the same UPDATE the
// function runs, or let the geocode worker fill the map in.
//
//   npx tsx scripts/import-for-user.mts <userId> <file.ged|.zip> [homePersonXref] [--dry-run]
//
// --dry-run parses and reports (people, families, person-level notes) and
// writes nothing.
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const [userId, filePath, homeXref] = argv.filter((a) => a !== '--dry-run');
if (!userId || !filePath) {
  throw new Error('usage: tsx import-for-user.mts <userId> <file.ged|.zip> [homePersonXref] [--dry-run]');
}

const bytes = new Uint8Array(readFileSync(filePath));
const text = extractGedcomText(bytes);
const parsed = parseGedcom(text, basename(filePath));

let notes = 0;
let peopleWithNotes = 0;
for (const person of parsed.individuals.values()) {
  if (person.notes.length > 0) peopleWithNotes++;
  notes += person.notes.length;
}
console.log(`file     : ${basename(filePath)} (${bytes.byteLength.toLocaleString()} bytes)`);
console.log(`people   : ${parsed.individuals.size.toLocaleString()}`);
console.log(`families : ${parsed.families.size.toLocaleString()}`);
console.log(`notes    : ${notes.toLocaleString()} person-level notes on ${peopleWithNotes.toLocaleString()} people`);
console.log(`warnings : ${parsed.metadata.parseWarnings.length}`);
if (homeXref) {
  const home = [...parsed.individuals.values()].find((p) => p.id === homeXref);
  console.log(`home     : ${homeXref} → ${home ? home.name.full : 'NOT IN FILE'}`);
}
if (dryRun) {
  console.log('dry run — nothing written');
  process.exit(0);
}

const supabase = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
);

let lastLogged = 0;
const { treeId } = await importParsedGedcom(supabase, parsed, {
  userId,
  onProgress: (p) => {
    if (p.insertedRows - lastLogged >= 25_000 || p.insertedRows === p.totalRows) {
      lastLogged = p.insertedRows;
      console.log(`  ${p.table}: ${p.insertedRows.toLocaleString()} / ${p.totalRows.toLocaleString()}`);
    }
  },
});
console.log(`tree     : ${treeId}`);

if (homeXref) {
  const { data: person, error } = await supabase
    .from('individuals')
    .select('id, full_name')
    .eq('tree_id', treeId)
    .eq('gedcom_xref', homeXref)
    .maybeSingle();
  if (error || !person) throw error ?? new Error(`home person ${homeXref} not found in the new tree`);
  const { error: updateError } = await supabase
    .from('trees')
    .update({ home_person_id: person.id })
    .eq('id', treeId);
  if (updateError) throw updateError;
  console.log(`home     : ${person.full_name} (${homeXref}) set`);
}

console.log('DONE', treeId);
