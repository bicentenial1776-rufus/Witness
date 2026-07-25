// Runs the Tree Health audit against a live tree and prints the findings.
// Usage: npx tsx scripts/tree-health-report.ts [treeId]
// Defaults to the signed-in user's most recently imported tree.
import './node-polyfills.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { fetchTreeHealthData, runTreeHealth } from '../src/query/treeHealth.js';
import { loadEnv, requireEnv } from './env.js';

loadEnv();

const client = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
);

const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
  email: requireEnv('WITNESS_TEST_USER_EMAIL'),
  password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
});
if (signInError || !signIn.user) {
  console.error('Sign in failed:', signInError?.message);
  process.exit(1);
}

let treeId = process.argv[2];
if (!treeId) {
  const { data: trees, error } = await client
    .from('trees')
    .select('id, name, imported_at')
    .order('imported_at', { ascending: false })
    .limit(1);
  if (error || !trees?.length) {
    console.error('No tree found:', error?.message);
    process.exit(1);
  }
  treeId = trees[0].id;
  console.log(`Auditing "${trees[0].name}" (${treeId})\n`);
}

const data = await fetchTreeHealthData(client, treeId);
const report = runTreeHealth(data, { currentYear: new Date().getFullYear() });

console.log(
  `Examined ${report.individualsChecked.toLocaleString()} people and ${report.familiesChecked.toLocaleString()} families.`,
);

const byCheck = new Map<string, typeof report.findings>();
for (const f of report.findings) {
  if (!byCheck.has(f.check)) byCheck.set(f.check, []);
  byCheck.get(f.check)!.push(f);
}

const fails = report.findings.filter((f) => f.severity === 'fail').length;
const cautions = report.findings.length - fails;
console.log(`Findings: ${fails} failures, ${cautions} cautions across ${byCheck.size} check types.\n`);

for (const [check, findings] of [...byCheck.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`■ ${check} (${findings.length})`);
  for (const f of findings.slice(0, 5)) console.log(`   ${f.severity === 'fail' ? '✗' : '⚠'} ${f.detail}`);
  if (findings.length > 5) console.log(`   … and ${findings.length - 5} more`);
  console.log();
}
