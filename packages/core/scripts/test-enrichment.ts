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

const fn = process.argv[2] ?? 'generate-historical-context';
const name = process.argv[3] ?? 'James Field';

const { data: person } = await client
  .from('individuals')
  .select('id, full_name, birth_year, death_year')
  .ilike('full_name', name)
  .order('birth_year')
  .limit(1)
  .maybeSingle();
if (!person) throw new Error(`No individual matching "${name}"`);
console.log(`${fn} → ${person.full_name} (${person.birth_year}–${person.death_year})\n`);

const start = Date.now();
const { data, error } = await client.functions.invoke(fn, {
  body: { individualId: person.id },
});
if (error) {
  const detail = await (error as { context?: Response }).context?.text?.();
  throw new Error(`Function error: ${error.message} ${detail ?? ''}`);
}
console.log(`(${((Date.now() - start) / 1000).toFixed(1)}s, cached=${data.cached ?? false})\n`);
console.log(data.context ?? data.biography ?? `# ${data.title}\n\n${data.content}`);
