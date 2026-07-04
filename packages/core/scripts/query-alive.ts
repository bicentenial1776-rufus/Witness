import './node-polyfills.js';
import { getHistoricalEvent, HISTORICAL_EVENTS } from '../src/history/events.js';
import { aliveDuring } from '../src/query/aliveDuring.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { loadEnv, requireEnv } from './env.js';

loadEnv();

const eventId = process.argv[2] ?? 'king-philips-war';
const event = getHistoricalEvent(eventId);
if (!event) {
  console.error(`Unknown event "${eventId}". Known ids:\n  ${HISTORICAL_EVENTS.map((e) => e.id).join('\n  ')}`);
  process.exit(1);
}

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

const { data: trees, error: treesError } = await client.from('trees').select('id, name').limit(1);
if (treesError || !trees?.length) {
  console.error('No tree found:', treesError?.message ?? 'import one first');
  process.exit(1);
}

console.log(`${event.name} (${event.startYear}–${event.endYear}) against "${trees[0].name}"`);
const start = Date.now();
const result = await aliveDuring(client, trees[0].id, event);
const durationMs = Date.now() - start;

console.log(`\n${result.matches.length} people alive (${result.documentedCount} documented, ${result.probableCount} probable)`);
console.log(`Query time: ${durationMs}ms ${durationMs < 2000 ? '— milestone met (<2s)' : '— OVER the 2s milestone'}`);

console.log('\nOldest ten:');
for (const match of result.matches.slice(0, 10)) {
  const { full_name, birth_year, death_year } = match.individual;
  const age = match.bornDuring ? 'born during' : match.ageAtStart !== null ? `age ${match.ageAtStart}` : 'age unknown';
  console.log(`  ${full_name} (${birth_year ?? '?'}–${death_year ?? '?'}) — ${age}, ${match.confidence}`);
}
