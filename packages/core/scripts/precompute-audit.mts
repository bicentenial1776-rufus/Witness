import './node-polyfills.js';
import { createWitnessClient } from '../src/supabase/client.js';
import {
  fetchOrphanBundle,
  findingKey,
  findingXrefKey,
  legacyFindingXrefKey,
  runTreeHealth,
  type HealthFinding,
  type OrphanReport,
} from '../src/query/index.js';
import { loadEnv, requireEnv } from './env.js';
loadEnv();

// Tree Health findings and Orphan Records, computed once per import and
// stored (migration 20260917210000) so screens read a few hundred rows
// instead of paging the whole tree. Service-role because it runs with no
// session, from .github/workflows/precompute-audit.yml every ten minutes.
//
// Upsert-then-prune: rows land stamped with this run's start time, then
// anything for the tree carrying an older stamp is removed, so a reader
// never sees an empty table mid-run. trees.audit_computed_at is written
// last; the app treats a tree as precomputed only when that stamp is at or
// after imported_at.
//
//   npx tsx scripts/precompute-audit.mts --pending      every tree whose audit is missing or older than its import
//   npx tsx scripts/precompute-audit.mts <treeId> [...]   specific trees, unconditionally
const args = process.argv.slice(2);
const pendingOnly = args.includes('--pending');
const explicit = args.filter((a) => !a.startsWith('--'));
if (!pendingOnly && explicit.length === 0) {
  throw new Error('usage: precompute-audit.mts --pending | <treeId> [...]');
}

const supabase = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
);
const BATCH = 500;

type TreeRow = { id: string; name: string; user_id: string; individual_count: number };

async function pendingTrees(): Promise<TreeRow[]> {
  const { data, error } = await supabase
    .from('trees')
    .select('id, name, user_id, individual_count, imported_at, audit_computed_at')
    .eq('import_status', 'complete')
    .order('imported_at', { ascending: true });
  if (error) throw new Error(`Listing trees failed: ${error.message}`);
  return (data ?? [])
    .filter((t) => !t.audit_computed_at || new Date(t.audit_computed_at) < new Date(t.imported_at))
    .map(({ id, name, user_id, individual_count }) => ({ id, name, user_id, individual_count }));
}

async function explicitTrees(ids: string[]): Promise<TreeRow[]> {
  const { data, error } = await supabase
    .from('trees')
    .select('id, name, user_id, individual_count')
    .in('id', ids);
  if (error) throw new Error(`Reading trees failed: ${error.message}`);
  return data ?? [];
}

function orphanRows(tree: TreeRow, report: OrphanReport, stamp: string) {
  return [
    ...report.islands.map((island) => ({
      tree_id: tree.id,
      user_id: tree.user_id,
      kind: 'island' as const,
      primary_id: island.anchorId,
      member_ids: island.memberIds,
      deletion_candidate: false,
      suggestion: island.suggestion,
      computed_at: stamp,
    })),
    ...report.solos.map((solo) => ({
      tree_id: tree.id,
      user_id: tree.user_id,
      kind: 'solo' as const,
      primary_id: solo.individualId,
      member_ids: [solo.individualId],
      deletion_candidate: solo.deletionCandidate,
      suggestion: solo.suggestion,
      computed_at: stamp,
    })),
  ];
}

async function auditTree(tree: TreeRow): Promise<void> {
  const started = Date.now();
  const stamp = new Date(started).toISOString();
  console.log(`\n${tree.name} (${tree.individual_count.toLocaleString()} people, ${tree.id})`);

  // One fetch feeds both reports: the orphan bundle already carries the
  // TreeHealthData the health checks run on.
  const bundle = await fetchOrphanBundle(supabase, tree.id);
  console.log(`  fetched in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  const health = runTreeHealth(bundle.data, { currentYear: new Date().getFullYear() });
  const people = new Map(
    bundle.data.individuals.map((i) => [
      i.id,
      { gedcom_xref: i.gedcom_xref, full_name: i.full_name, surname: i.surname },
    ]),
  );

  const findingRows = health.findings.map((f: HealthFinding) => ({
    tree_id: tree.id,
    user_id: tree.user_id,
    check_id: f.check,
    severity: f.severity,
    individual_ids: f.individualIds,
    family_id: f.familyId ?? null,
    detail: f.detail,
    finding_key: findingKey(f),
    xref_key: findingXrefKey(f, people),
    legacy_xref_key: legacyFindingXrefKey(f, people),
    primary_surname: people.get(f.individualIds[0]!)?.surname ?? null,
    computed_at: stamp,
  }));
  // The same finding key can be produced twice by different checks' inputs
  // only if the checks agree on ids; the key includes the check, so dedupe is
  // a no-op safety net against a batch containing duplicates.
  const seen = new Set<string>();
  const uniqueFindings = findingRows.filter((r) => (seen.has(r.finding_key) ? false : (seen.add(r.finding_key), true)));

  for (let i = 0; i < uniqueFindings.length; i += BATCH) {
    const { error } = await supabase
      .from('tree_health_findings')
      .upsert(uniqueFindings.slice(i, i + BATCH), { onConflict: 'tree_id,finding_key' });
    if (error) throw new Error(`Writing findings failed: ${error.message}`);
  }
  const orphans = orphanRows(tree, bundle.report, stamp);
  for (let i = 0; i < orphans.length; i += BATCH) {
    const { error } = await supabase
      .from('orphan_records')
      .upsert(orphans.slice(i, i + BATCH), { onConflict: 'tree_id,primary_id' });
    if (error) throw new Error(`Writing orphan records failed: ${error.message}`);
  }

  // Prune whatever this run did not touch.
  const pruneFindings = await supabase.from('tree_health_findings').delete().eq('tree_id', tree.id).lt('computed_at', stamp);
  if (pruneFindings.error) throw new Error(`Pruning findings failed: ${pruneFindings.error.message}`);
  const pruneOrphans = await supabase.from('orphan_records').delete().eq('tree_id', tree.id).lt('computed_at', stamp);
  if (pruneOrphans.error) throw new Error(`Pruning orphan records failed: ${pruneOrphans.error.message}`);

  const { error: stampError } = await supabase
    .from('trees')
    .update({
      audit_computed_at: stamp,
      audit_summary: {
        individualsChecked: health.individualsChecked,
        familiesChecked: health.familiesChecked,
        mainTreeSize: bundle.report.mainTreeSize,
        totalDisconnected: bundle.report.totalDisconnected,
      },
    })
    .eq('id', tree.id);
  if (stampError) throw new Error(`Stamping tree failed: ${stampError.message}`);

  console.log(
    `  ${uniqueFindings.length.toLocaleString()} findings, ${orphans.length.toLocaleString()} orphan records, done in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

const trees = pendingOnly ? await pendingTrees() : await explicitTrees(explicit);
console.log(`${trees.length} tree(s) to audit`);
let failed = 0;
for (const tree of trees) {
  try {
    await auditTree(tree);
  } catch (error) {
    failed += 1;
    console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\nDONE — ${trees.length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
