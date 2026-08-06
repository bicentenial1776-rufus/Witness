/**
 * End-to-end check for GEDCOM Refresh against a real database.
 *
 * Imports one GEDCOM twice — the second copy edited to look like a research
 * session happened — then runs previewRefresh/applyRefresh and asserts on
 * what actually landed. Signs in as WITNESS_TEST_USER_*, never a real account,
 * and cleans up both trees on the way out.
 *
 *   npx tsx scripts/test-refresh.ts
 */
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './node-polyfills.js';
import { parseGedcom } from '../src/gedcom/index.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { importParsedGedcom } from '../src/supabase/import.js';
import { applyRefresh, previewRefresh, pulseSummary } from '../src/pulse/index.js';
import { loadEnv, requireEnv } from './env.js';

loadEnv();

const client = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
);

const { data: auth, error: authError } = await client.auth.signInWithPassword({
  email: requireEnv('WITNESS_TEST_USER_EMAIL'),
  password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
});
if (authError || !auth.user) {
  console.error('Sign in failed:', authError?.message);
  process.exit(1);
}
const userId = auth.user.id;
console.log('Signed in as test user', userId);

const fixture =
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../fixtures/sample.ged');
const original = readFileSync(fixture, 'utf-8');

/**
 * Simulate a research session: fill in a missing death year, break a brick
 * wall by giving someone parents, and add a person. Done as text edits so the
 * second import goes through the real parser, not a hand-built payload.
 */
function editedCopy(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let addedPerson = false;
  for (const line of lines) {
    if (!addedPerson && line.startsWith('0 @') && line.includes('INDI')) {
      out.push('0 @ZZNEW@ INDI', '1 NAME Newly/Discovered/', '1 SEX F', '1 BIRT', '2 DATE 1901');
      addedPerson = true;
    }
    out.push(line);
  }
  return out.join('\n');
}

const trees: string[] = [];
async function cleanup() {
  for (const id of trees) {
    await client.from('trees').delete().eq('id', id);
  }
  console.log('Cleaned up', trees.length, 'scratch tree(s)');
}

try {
  console.log('\n── Importing the "before" tree ──');
  const before = parseGedcom(original, 'refresh-before.ged');
  const beforeImport = await importParsedGedcom(client, before, {
    userId,
    fileName: 'refresh-before.ged',
  });
  trees.push(beforeImport.treeId);
  console.log('  tree', beforeImport.treeId, '·', before.metadata.individualCount, 'individuals');

  console.log('\n── Importing the "after" tree (edited) ──');
  const after = parseGedcom(editedCopy(original), 'refresh-after.ged');
  const afterImport = await importParsedGedcom(client, after, {
    userId,
    fileName: 'refresh-after.ged',
  });
  trees.push(afterImport.treeId);
  console.log('  tree', afterImport.treeId, '·', after.metadata.individualCount, 'individuals');

  // Attach a research brief to someone in the old tree. Carrying these is the
  // entire reason the swap exists, so the check has to prove one survives.
  //
  // research_briefs has no INSERT policy for users by design — briefs always
  // pass through the generator on the service role — so seeding one needs the
  // secret key. Without it the rest of the run still means something, so the
  // check degrades rather than aborts.
  const serviceKey = process.env.WITNESS_SERVICE_ROLE_KEY;
  const admin = serviceKey
    ? createWitnessClient(requireEnv('EXPO_PUBLIC_SUPABASE_URL'), serviceKey)
    : null;

  const { data: subject } = await client
    .from('individuals')
    .select('id, gedcom_xref, full_name')
    .eq('tree_id', beforeImport.treeId)
    .not('gedcom_xref', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!subject) throw new Error('No individual with an xref in the before tree.');

  let brief: { id: string } | null = null;
  if (admin) {
    const { data, error: briefError } = await admin
      .from('research_briefs')
      .insert({
        individual_id: subject.id,
        tree_id: beforeImport.treeId,
        user_id: userId,
        title: 'Scratch brief for refresh test',
        content: 'Body.',
        model: 'test',
      })
      .select('id')
      .maybeSingle();
    if (briefError || !data) throw new Error(`Could not seed a brief: ${briefError?.message}`);
    brief = data;
    console.log(`\n  Seeded a research brief on ${subject.full_name} (${subject.gedcom_xref})`);
  } else {
    console.log('\n  WITNESS_SERVICE_ROLE_KEY unset — skipping the brief carry-forward check.');
  }

  console.log('\n── previewRefresh ──');
  const preview = await previewRefresh(client, beforeImport.treeId, afterImport.treeId);
  console.log('  summary   :', preview.summary);
  console.log('  added     :', preview.pulse.added.length);
  console.log('  removed   :', preview.pulse.removed.length);
  console.log('  dates     :', preview.pulse.datesFilled.length);
  console.log('  walls     :', preview.pulse.brickWallsBroken.length);
  console.log('  untracked :', JSON.stringify(preview.pulse.untracked));
  console.log('  remapped  :', preview.remap.map.size, 'people; stranded', preview.remap.orphaned.size);
  console.log('  cost      :', preview.costWarning ?? '(nothing lost)');

  if (preview.remap.map.size === 0) {
    throw new Error('Nothing remapped — xrefs are not surviving import, refresh would be unsafe.');
  }

  console.log('\n── applyRefresh ──');
  const result = await applyRefresh(client, beforeImport.treeId, afterImport.treeId, preview);
  console.log('  ', JSON.stringify(result));

  console.log('\n── verifying ──');
  const { data: newTree } = await client
    .from('trees')
    .select('id, last_pulse, last_pulse_at, refreshed_from')
    .eq('id', afterImport.treeId)
    .maybeSingle();
  console.log('  last_pulse stored :', newTree?.last_pulse ? 'yes' : 'NO');
  // The Research card re-summarises the stored jsonb rather than the live
  // object, so the round trip has to produce the same sentence the reader
  // agreed to when they applied.
  const rehydrated = newTree?.last_pulse
    ? pulseSummary(newTree.last_pulse as unknown as Parameters<typeof pulseSummary>[0])
    : null;
  const summaryStable = rehydrated === preview.summary;
  console.log('  summary round-trip:', summaryStable ? 'stable' : `DRIFTED → ${rehydrated}`);
  console.log('  last_pulse_at     :', newTree?.last_pulse_at ?? 'null');
  console.log('  refreshed_from    :', newTree?.refreshed_from ?? 'null');

  const { data: oldTree } = await client
    .from('trees')
    .select('id')
    .eq('id', beforeImport.treeId)
    .maybeSingle();
  console.log('  old tree gone     :', oldTree ? 'NO — still present' : 'yes');
  if (!oldTree) trees.splice(trees.indexOf(beforeImport.treeId), 1);

  const { data: movedBrief } = brief
    ? await client
        .from('research_briefs')
        .select('id, tree_id, individual_id')
        .eq('id', brief.id)
        .maybeSingle()
    : { data: null };
  // Skipped means "not disproven", so it must not fail the run on its own.
  const briefSurvived = brief ? movedBrief?.tree_id === afterImport.treeId : true;
  console.log(
    '  brief survived    :',
    !brief ? 'skipped' : briefSurvived ? 'yes' : 'NO — it was lost',
  );
  if (movedBrief) {
    const { data: landedOn } = await client
      .from('individuals')
      .select('gedcom_xref, tree_id')
      .eq('id', movedBrief.individual_id)
      .maybeSingle();
    const rightPerson = landedOn?.gedcom_xref === subject.gedcom_xref;
    console.log(
      '  re-pointed to     :',
      landedOn?.gedcom_xref,
      rightPerson ? '(correct person)' : '(WRONG PERSON)',
    );
    if (!rightPerson) throw new Error('Brief landed on the wrong individual.');
  }
  if (movedBrief && brief) await client.from("research_briefs").delete().eq("id", brief.id);

  const ok =
    Boolean(newTree?.last_pulse) &&
    newTree?.refreshed_from === beforeImport.treeId &&
    briefSurvived &&
    summaryStable &&
    !oldTree &&
    result.oldTreeDeleted;
  console.log(ok ? '\nPASS' : '\nFAIL — see above');
  await cleanup();
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error('\nFAILED:', error instanceof Error ? error.message : error);
  await cleanup();
  process.exit(1);
}
