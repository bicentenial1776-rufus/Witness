import './node-polyfills.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { loadEnv, requireEnv } from './env.js';

loadEnv();

const url = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
const anonKey = requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const email = requireEnv('WITNESS_TEST_USER_EMAIL');
const password = requireEnv('WITNESS_TEST_USER_PASSWORD');

const client = createWitnessClient(url, anonKey);
const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
if (signInError || !signInData.user) {
  console.error('Sign in failed:', signInError?.message);
  process.exit(1);
}

const tables = [
  'trees',
  'places',
  'individuals',
  'individual_events',
  'families',
  'family_children',
  'curiosities',
  'curiosity_individuals',
] as const;

console.log('--- row counts ---');
for (const table of tables) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.log(`${table}: ERROR ${error.message}`);
  } else {
    console.log(`${table}: ${count}`);
  }
}

console.log('\n--- spot check: Rufus Scott Howe ---');
const { data: rufus, error: rufusError } = await client
  .from('individuals')
  .select('id, full_name, sex, birth_year, death_year, living, has_death_record')
  .eq('gedcom_xref', 'I1264430923')
  .single();
if (rufusError) {
  console.log('ERROR:', rufusError.message);
} else {
  console.log(rufus);
  const { data: events } = await client
    .from('individual_events')
    .select('event_type, sort_order, date_year, date_raw')
    .eq('individual_id', rufus.id)
    .order('event_type')
    .order('sort_order');
  console.log('events:', events);
}

console.log('\n--- spot check: a curiosity with its linked individual(s) ---');
const { data: curiosity } = await client
  .from('curiosities')
  .select('id, type, message')
  .eq('type', 'child_born_before_parent')
  .limit(1)
  .single();
console.log(curiosity);
if (curiosity) {
  const { data: links } = await client
    .from('curiosity_individuals')
    .select('individuals(full_name, birth_year)')
    .eq('curiosity_id', curiosity.id);
  console.log('linked individuals:', links);
}
