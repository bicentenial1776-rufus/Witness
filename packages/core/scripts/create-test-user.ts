import './node-polyfills.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { loadEnv, requireEnv } from './env.js';

loadEnv();

const url = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
const anonKey = requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const email = requireEnv('WITNESS_TEST_USER_EMAIL');
const password = requireEnv('WITNESS_TEST_USER_PASSWORD');

const client = createWitnessClient(url, anonKey);

const { data, error } = await client.auth.signUp({ email, password });

if (error) {
  console.error('Sign up failed:', error.message);
  process.exit(1);
}

console.log('Sign up response:');
console.log('  user id:', data.user?.id ?? '(none)');
console.log('  email confirmed:', Boolean(data.user?.email_confirmed_at));
console.log('  session issued:', Boolean(data.session));

if (!data.session) {
  console.log('\nNo session yet — check the inbox for a confirmation email and click the link, then re-run this script (or scripts/live-import.ts, which will sign in instead of signing up again).');
}
