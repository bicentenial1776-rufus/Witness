import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './node-polyfills.js';
import { parseGedcom } from '../src/gedcom/index.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { importParsedGedcom } from '../src/supabase/import.js';
import { loadEnv, requireEnv } from './env.js';

loadEnv();

const url = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
const anonKey = requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const email = requireEnv('WITNESS_TEST_USER_EMAIL');
const password = requireEnv('WITNESS_TEST_USER_PASSWORD');

const filePath =
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../fixtures/Howe_Field Family Tree.ged');

const client = createWitnessClient(url, anonKey);

const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
if (signInError || !signInData.user) {
  console.error('Sign in failed:', signInError?.message ?? 'no user returned');
  console.error('If this is "Email not confirmed", click the confirmation link sent to your inbox first.');
  process.exit(1);
}
console.log('Signed in as', signInData.user.id);

console.log('Parsing', filePath);
const text = readFileSync(filePath, 'utf-8');
const parseStart = Date.now();
const parsed = parseGedcom(text, basename(filePath));
console.log(
  `Parsed ${parsed.metadata.individualCount} individuals, ${parsed.metadata.familyCount} families, ` +
    `${parsed.metadata.placeCount} places in ${Date.now() - parseStart}ms`,
);

console.log('Importing to Supabase...');
const importStart = Date.now();
const result = await importParsedGedcom(client, parsed, { userId: signInData.user.id });
console.log(`Import complete in ${Date.now() - importStart}ms. tree_id = ${result.treeId}`);
