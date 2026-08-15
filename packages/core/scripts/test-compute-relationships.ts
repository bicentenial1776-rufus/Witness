// Live smoke test for the compute-relationships edge function: signs in as
// the test user (who owns the real Howe/Field tree), invokes the function,
// and checks row count, a known relationship, convergence under concurrent
// invokes, and the compute time (the CPU-budget telemetry). Point it at a
// local `supabase functions serve` with FUNCTIONS_URL, otherwise it hits
// the deployed function.
import './node-polyfills.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { loadEnv, requireEnv } from './env.js';

loadEnv();
const supabaseUrl = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
const anonKey = requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const functionsUrl = process.env.FUNCTIONS_URL ?? `${supabaseUrl}/functions/v1`;

const client = createWitnessClient(supabaseUrl, anonKey);
const { data: auth, error: signInError } = await client.auth.signInWithPassword({
  email: requireEnv('WITNESS_TEST_USER_EMAIL'),
  password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
});
if (signInError) throw signInError;
const token = auth.session!.access_token;

const { data: trees } = await client
  .from('trees')
  .select('id, name, home_person_id')
  .order('individual_count', { ascending: false })
  .limit(1);
const tree = trees![0]!;
console.log('tree:', tree.name, tree.id);

async function invoke(body: Record<string, unknown>) {
  const response = await fetch(`${functionsUrl}/compute-relationships`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

// Run 1: treeId only (the self-heal shape — function reads the pointer).
const run1 = await invoke({ treeId: tree.id });
console.log('run 1 (treeId only):', run1.status, JSON.stringify(run1.payload));
if (run1.status !== 200) throw new Error('run 1 failed');

// Run 2: with explicit homePersonId (the home-person-picker shape).
const run2 = await invoke({ treeId: tree.id, homePersonId: tree.home_person_id });
console.log('run 2 (homePersonId):', run2.status, JSON.stringify(run2.payload));
if (run2.status !== 200) throw new Error('run 2 failed');

// Concurrency: two overlapping invokes must converge to a single run's count.
const [runA, runB] = await Promise.all([invoke({ treeId: tree.id }), invoke({ treeId: tree.id })]);
console.log('concurrent:', runA.status, runB.status);
const { count } = await client
  .from('relationships')
  .select('id', { count: 'exact', head: true })
  .eq('tree_id', tree.id);
console.log(`rows in DB: ${count} (single run reported ${run1.payload.cachedAncestors})`);
if (count !== run1.payload.cachedAncestors) throw new Error('concurrent runs did not converge');

// Known-relationship spot check: Katherine Marbury from Rufus.
const { data: katherine } = await client
  .from('individuals')
  .select('id, full_name')
  .eq('tree_id', tree.id)
  .ilike('full_name', '%Marbury%')
  .single();
const { data: rel } = await client
  .from('relationships')
  .select('label, generation_distance, line')
  .eq('tree_id', tree.id)
  .eq('individual_id', katherine!.id)
  .single();
console.log('Katherine Marbury:', JSON.stringify(rel));
if (rel!.label !== '7th great-grandmother' || rel!.generation_distance !== 9 || rel!.line !== 'paternal') {
  throw new Error('Katherine Marbury spot check failed');
}

console.log(`OK — compute ${run1.payload.ms}ms for ${run1.payload.people} people`);
await client.auth.signOut();
