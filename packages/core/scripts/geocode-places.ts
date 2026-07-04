import './node-polyfills.js';
import { geocodeTreePlaces } from '../src/geocode/nominatim.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { loadEnv, requireEnv } from './env.js';

loadEnv();

const limitArg = process.argv[2];
const limit = limitArg ? Number(limitArg) : undefined;

const client = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
);
const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
  email: requireEnv('WITNESS_TEST_USER_EMAIL'),
  password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
});
if (signInError || !signInData.user) {
  console.error('Sign in failed:', signInError?.message);
  process.exit(1);
}

const { data: trees, error: treesError } = await client
  .from('trees')
  .select('id, name, place_count')
  .order('individual_count', { ascending: false })
  .limit(1);
if (treesError || !trees?.length) {
  console.error('No tree found:', treesError?.message ?? 'import one first');
  process.exit(1);
}

console.log(`Geocoding places for "${trees[0].name}"${limit ? ` (limit ${limit})` : ''}...`);
const start = Date.now();
const result = await geocodeTreePlaces(client, trees[0].id, {
  limit,
  onProgress: ({ processed, total, succeeded, failed, current }) => {
    if (processed % 25 === 0 || processed === total) {
      const elapsedMin = ((Date.now() - start) / 60000).toFixed(1);
      console.log(`  ${processed}/${total} (${succeeded} ok, ${failed} miss) ${elapsedMin}min — ${current}`);
    }
  },
});
console.log(
  `Done in ${((Date.now() - start) / 60000).toFixed(1)}min: ${result.succeeded} geocoded, ${result.failed} unresolved of ${result.attempted} attempted.`,
);
