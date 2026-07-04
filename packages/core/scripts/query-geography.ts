import './node-polyfills.js';
import { fetchGeographyIndex, nearbyAncestors, regionRollups } from '../src/query/geography.js';
import { migrationPaths } from '../src/query/migrations.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { loadEnv, requireEnv } from './env.js';

loadEnv();

const client = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
);
const { error: signInError } = await client.auth.signInWithPassword({
  email: requireEnv('WITNESS_TEST_USER_EMAIL'),
  password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
});
if (signInError) throw signInError;

const { data: trees } = await client
  .from('trees')
  .select('id, name')
  .order('individual_count', { ascending: false })
  .limit(1);
if (!trees?.length) throw new Error('No tree');

const start = Date.now();
const index = await fetchGeographyIndex(client, trees[0]!.id);
console.log(
  `Index: ${index.places.size} places, ${index.events.length} events, ${index.individuals.size} individuals in ${Date.now() - start}ms`,
);

console.log('\n--- top 15 regions ---');
for (const rollup of regionRollups(index).slice(0, 15)) {
  console.log(`  ${String(rollup.individualCount).padStart(5)} people, ${String(rollup.placeCount).padStart(4)} places  ${rollup.region}`);
}

console.log('\n--- top 12 migration paths ---');
for (const path of migrationPaths(index).slice(0, 12)) {
  const era = path.medianYear ? ` (around ${path.medianYear})` : '';
  console.log(`  ${String(path.count).padStart(4)}  ${path.from} → ${path.to}${era}`);
  const example = path.examples[0];
  if (example) console.log(`        e.g. ${example.name}, ${example.fromYear ?? '?'} → ${example.toYear ?? '?'}`);
}

const geocoded = [...index.places.values()].filter((p) => p.latitude !== null).length;
console.log(`\n--- radius search (geocoded places: ${geocoded}/${index.places.size}) ---`);
// Sudbury, Massachusetts town center.
const near = nearbyAncestors(index, { latitude: 42.3834, longitude: -71.4162, radiusKm: 15 });
console.log(`Places within 15km of Sudbury MA: ${near.length}`);
for (const hit of near.slice(0, 8)) {
  console.log(`  ${hit.distanceKm.toFixed(1)}km  ${hit.place.raw} — ${hit.residents.length} ancestors`);
}
