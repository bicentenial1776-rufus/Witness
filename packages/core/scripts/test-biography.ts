import './node-polyfills.js';
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

const name = process.argv[2] ?? 'James Field';
const { data: person, error } = await client
  .from('individuals')
  .select('id, full_name, birth_year, death_year, living')
  .ilike('full_name', name)
  .order('birth_year')
  .limit(1)
  .maybeSingle();
if (error || !person) throw new Error(`No individual matching "${name}": ${error?.message ?? ''}`);
console.log(`Subject: ${person.full_name} (${person.birth_year}–${person.death_year}), living=${person.living}\n`);

for (const attempt of [1, 2]) {
  const start = Date.now();
  const { data, error: fnError } = await client.functions.invoke('generate-biography', {
    body: { individualId: person.id },
  });
  if (fnError) {
    const detail = await (fnError as { context?: Response }).context?.text?.();
    throw new Error(`Function error: ${fnError.message} ${detail ?? ''}`);
  }
  console.log(`--- attempt ${attempt}: ${Date.now() - start}ms, cached=${data.cached} ---`);
  if (attempt === 1) console.log(`\n${data.biography}\n`);
}
