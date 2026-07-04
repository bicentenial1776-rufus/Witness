import './node-polyfills.js';
import { setHomePerson, suggestHomePerson } from '../src/family/index.js';
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
const tree = trees![0]!;

const suggested = await suggestHomePerson(client, tree.id);
console.log('suggested:', suggested?.full_name, suggested?.birth_year);

const { data: rufus } = await client
  .from('individuals')
  .select('id, full_name')
  .eq('tree_id', tree.id)
  .eq('gedcom_xref', 'I1264430923')
  .single();
console.log('setting home person:', rufus!.full_name);

const start = Date.now();
const { cachedAncestors } = await setHomePerson(client, tree.id, rufus!.id);
console.log(`cached ${cachedAncestors} direct ancestors in ${((Date.now() - start) / 1000).toFixed(1)}s`);

const { data: katherine } = await client
  .from('individuals')
  .select('id, full_name')
  .eq('tree_id', tree.id)
  .ilike('full_name', '%Marbury%')
  .single();
const { data: rel } = await client
  .from('relationships')
  .select('label, generation_distance, line, is_direct_ancestor')
  .eq('individual_id', katherine!.id)
  .single();
console.log(`${katherine!.full_name}:`, rel);
