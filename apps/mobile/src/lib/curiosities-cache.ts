import {
  fetchOrphanBundle,
  findingKey,
  findingXrefKey,
  legacyFindingXrefKey,
  runTreeHealth,
  type ConnectionSuggestion,
  type HealthCheckId,
  type HealthFinding,
  type HealthSeverity,
  type OrphanReport,
  type TreeHealthData,
  type TreeHealthReport,
} from '@witness/core/query';

import { supabase } from '@/lib/supabase';

/**
 * Curiosities — the surface voice for Tree Health (docs/phone-ia-design-
 * brief.md): a curiosity is a prompt, not a problem. The forensic audit
 * is read once per tree per session; marks and rulings are re-read on
 * every call so a "Mark fixed" on the workbench is reflected the next
 * time Home or the Tree tab asks.
 *
 * Since 2026-09-17 the audit is computed once per import by a worker
 * (packages/core/scripts/precompute-audit.mts, migration 20260917210000)
 * and stored in tree_health_findings / orphan_records. When a tree's
 * stored audit is current — trees.audit_computed_at at or after
 * imported_at — the session reads those few hundred rows plus the people
 * they name. Until the worker has caught up with a fresh import the
 * session computes the audit itself, exactly as before, so nothing is
 * ever missing; screens say so (PROCESSING_NOTE).
 */

export interface Curiosity {
  key: string;
  /** The finding's editorial sentence — already gentle, names included. */
  prompt: string;
  /** Primary accused person, for tap-through. */
  individualId: string;
}

export interface CuriositySummary {
  /** Open findings — marked-fixed and ruled-not-an-error excluded. */
  total: number;
  /** The surname holding the most open findings, e.g. "Whitfield". */
  lineName: string | null;
  lineCount: number;
  /** Top prompts, severity-first, one per check for variety. */
  top: Curiosity[];
}

/** The people an audit names — everything the workbench screens print about a person. */
export interface AuditPerson {
  gedcom_xref: string | null;
  surname: string | null;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

export interface AuditRun {
  /** The raw tree bundle — null when the run was read from the precomputed tables. */
  data: TreeHealthData | null;
  report: TreeHealthReport;
  orphans: OrphanReport;
  people: Map<string, AuditPerson>;
  /** False when this session had to compute the audit itself (worker not caught up yet). */
  precomputed: boolean;
}

export const PROCESSING_NOTE =
  'Witness is still preparing this tree’s checks after the import, so this first look was worked out on your device. It opens instantly once preparation finishes — usually within ten minutes.';

const runs = new Map<string, Promise<AuditRun>>();
// A failed audit fetch can be ~30 paginated requests; without a backoff
// every Home/Tree focus on a flaky network re-fires the whole sweep.
const failedAt = new Map<string, number>();
const FAILURE_BACKOFF_MS = 60_000;

const PRECOMPUTED_PAGE = 5000;
// PK lookups for the named people, a few hundred ids per request so the
// URL stays short, a handful in flight at once.
const ID_BATCH = 250;
const ID_CONCURRENCY = 4;

interface AuditSummary {
  individualsChecked?: number;
  familiesChecked?: number;
  mainTreeSize?: number;
  totalDisconnected?: number;
}

async function pageAll<T extends { id: string }>(
  build: (after: string | null) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await build(after);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PRECOMPUTED_PAGE) return rows;
    after = page[page.length - 1]!.id;
  }
}

async function fetchPeople(ids: Iterable<string>): Promise<Map<string, AuditPerson>> {
  const people = new Map<string, AuditPerson>();
  const all = [...new Set(ids)];
  const batches: string[][] = [];
  for (let i = 0; i < all.length; i += ID_BATCH) batches.push(all.slice(i, i + ID_BATCH));
  for (let i = 0; i < batches.length; i += ID_CONCURRENCY) {
    const results = await Promise.all(
      batches.slice(i, i + ID_CONCURRENCY).map((batch) =>
        supabase
          .from('individuals')
          .select('id, gedcom_xref, full_name, surname, birth_year, death_year, living')
          .in('id', batch),
      ),
    );
    for (const { data, error } of results) {
      if (error) throw new Error(`Fetching audited people failed: ${error.message}`);
      for (const p of data ?? []) {
        people.set(p.id, {
          gedcom_xref: p.gedcom_xref,
          surname: p.surname,
          full_name: p.full_name,
          birth_year: p.birth_year,
          death_year: p.death_year,
          living: p.living ?? false,
        });
      }
    }
  }
  return people;
}

/** The stored audit, or null when the worker has not caught up with the latest import. */
async function readPrecomputed(treeId: string): Promise<AuditRun | null> {
  const { data: tree, error } = await supabase
    .from('trees')
    .select('imported_at, audit_computed_at, audit_summary')
    .eq('id', treeId)
    .maybeSingle();
  if (error) throw new Error(`Reading tree failed: ${error.message}`);
  if (!tree?.audit_computed_at || !tree.imported_at) return null;
  if (new Date(tree.audit_computed_at) < new Date(tree.imported_at)) return null;
  const summary = (tree.audit_summary ?? {}) as AuditSummary;

  const [findingRows, orphanRows] = await Promise.all([
    pageAll((after) => {
      let q = supabase
        .from('tree_health_findings')
        .select('id, check_id, severity, individual_ids, family_id, detail')
        .eq('tree_id', treeId)
        .order('id')
        .limit(PRECOMPUTED_PAGE);
      if (after) q = q.gt('id', after);
      return q;
    }),
    pageAll((after) => {
      let q = supabase
        .from('orphan_records')
        .select('id, kind, primary_id, member_ids, deletion_candidate, suggestion')
        .eq('tree_id', treeId)
        .order('id')
        .limit(PRECOMPUTED_PAGE);
      if (after) q = q.gt('id', after);
      return q;
    }),
  ]);

  const findings: HealthFinding[] = findingRows.map((r) => ({
    check: r.check_id as HealthCheckId,
    severity: r.severity as HealthSeverity,
    individualIds: r.individual_ids,
    ...(r.family_id ? { familyId: r.family_id } : {}),
    detail: r.detail,
  }));
  const report: TreeHealthReport = {
    findings,
    individualsChecked: summary.individualsChecked ?? 0,
    familiesChecked: summary.familiesChecked ?? 0,
  };
  const orphans: OrphanReport = {
    mainTreeSize: summary.mainTreeSize ?? 0,
    totalDisconnected: summary.totalDisconnected ?? 0,
    islands: orphanRows
      .filter((r) => r.kind === 'island')
      .map((r) => ({
        anchorId: r.primary_id,
        memberIds: r.member_ids,
        suggestion: r.suggestion as ConnectionSuggestion | null,
      }))
      .sort((a, b) => b.memberIds.length - a.memberIds.length),
    solos: orphanRows
      .filter((r) => r.kind === 'solo')
      .map((r) => ({
        individualId: r.primary_id,
        deletionCandidate: r.deletion_candidate,
        suggestion: r.suggestion as ConnectionSuggestion | null,
      })),
  };

  const named = new Set<string>();
  for (const f of findings) for (const id of f.individualIds) named.add(id);
  for (const row of [...orphans.islands, ...orphans.solos]) {
    named.add('anchorId' in row ? row.anchorId : row.individualId);
    if (row.suggestion) named.add(row.suggestion.candidateId);
  }
  return { data: null, report, orphans, people: await fetchPeople(named), precomputed: true };
}

/** Today's client-side audit: the whole tree paged down and checked here. */
async function computeLocally(treeId: string): Promise<AuditRun> {
  const bundle = await fetchOrphanBundle(supabase, treeId);
  return {
    data: bundle.data,
    report: runTreeHealth(bundle.data, { currentYear: new Date().getFullYear() }),
    orphans: bundle.report,
    people: new Map(
      bundle.data.individuals.map((i) => [
        i.id,
        {
          gedcom_xref: i.gedcom_xref,
          surname: i.surname,
          full_name: i.full_name,
          birth_year: i.birth_year,
          death_year: i.death_year,
          living: i.living,
        },
      ]),
    ),
    precomputed: false,
  };
}

function getAuditRun(treeId: string): Promise<AuditRun> {
  const lastFailure = failedAt.get(treeId);
  if (lastFailure && Date.now() - lastFailure < FAILURE_BACKOFF_MS) {
    return Promise.reject(new Error('curiosities fetch backing off'));
  }
  let pending = runs.get(treeId);
  if (!pending) {
    pending = readPrecomputed(treeId).then((run) => run ?? computeLocally(treeId));
    pending.catch(() => {
      runs.delete(treeId); // don't cache failures…
      failedAt.set(treeId, Date.now()); // …but don't storm retries either
    });
    pending.then(() => failedAt.delete(treeId)).catch(() => {});
    runs.set(treeId, pending);
  }
  return pending;
}

export async function getCuriosities(treeId: string, topCount = 3): Promise<CuriositySummary> {
  const [{ report, people }, marks, rulings] = await Promise.all([
    getAuditRun(treeId),
    supabase.from('tree_health_marks').select('finding_key').eq('tree_id', treeId),
    supabase.from('tree_health_rulings').select('xref_key'),
  ]);
  const marked = new Set((marks.data ?? []).map((m) => m.finding_key));
  const ruled = new Set((rulings.data ?? []).map((r) => r.xref_key));

  const open = report.findings.filter(
    (f) =>
      !marked.has(findingKey(f)) &&
      !ruled.has(findingXrefKey(f, people)) &&
      !ruled.has(legacyFindingXrefKey(f, people)),
  );

  // The busiest line: findings grouped by the primary subject's surname.
  const bySurname = new Map<string, number>();
  for (const finding of open) {
    const surname = people.get(finding.individualIds[0])?.surname;
    if (surname) bySurname.set(surname, (bySurname.get(surname) ?? 0) + 1);
  }
  let lineName: string | null = null;
  let lineCount = 0;
  for (const [surname, count] of bySurname) {
    if (count > lineCount) {
      lineName = surname;
      lineCount = count;
    }
  }

  // Top prompts: failures before cautions, at most one per check so three
  // prompts read as three different kinds of curiosity.
  const seenChecks = new Set<string>();
  const top: Curiosity[] = [];
  const ordered: HealthFinding[] = [
    ...open.filter((f) => f.severity === 'fail'),
    ...open.filter((f) => f.severity === 'caution'),
  ];
  for (const finding of ordered) {
    if (seenChecks.has(finding.check)) continue;
    seenChecks.add(finding.check);
    top.push({
      key: findingKey(finding),
      prompt: finding.detail,
      individualId: finding.individualIds[0],
    });
    if (top.length >= topCount) break;
  }

  return { total: open.length, lineName, lineCount, top };
}

/**
 * The curiosities that name one person — the Portrait's findings door
 * (docs/cohesion-design-brief.md: the third door). Same session-cached
 * audit run and the same marks/rulings filter as getCuriosities, so a
 * decision on the workbench disappears here on the next visit. Home warms
 * the audit cache on focus, so by the time a reader reaches a Portrait
 * this is usually a filter over work already done.
 */
export async function getPersonCuriosities(
  treeId: string,
  individualId: string,
): Promise<Curiosity[]> {
  const [{ report, people }, marks, rulings] = await Promise.all([
    getAuditRun(treeId),
    supabase.from('tree_health_marks').select('finding_key').eq('tree_id', treeId),
    supabase.from('tree_health_rulings').select('xref_key'),
  ]);
  const marked = new Set((marks.data ?? []).map((m) => m.finding_key));
  const ruled = new Set((rulings.data ?? []).map((r) => r.xref_key));

  return report.findings
    .filter(
      (f) =>
        f.individualIds.includes(individualId) &&
        !marked.has(findingKey(f)) &&
        !ruled.has(findingXrefKey(f, people)) &&
        !ruled.has(legacyFindingXrefKey(f, people)),
    )
    .map((f) => ({
      key: findingKey(f),
      prompt: f.detail,
      individualId: f.individualIds[0],
    }));
}

/**
 * The whole cached run — findings, orphan records, and the people they
 * name — for the punch list and the Orphan Records workbench.
 */
export async function getAuditBundle(treeId: string): Promise<AuditRun> {
  return getAuditRun(treeId);
}

/**
 * The session's audit run, shared with the workbench. Before this,
 * tree-health.tsx re-fetched the same ~30 paginated pages Home had already
 * pulled through this cache — the walkthrough audit's G2.
 */
export async function getAuditReport(
  treeId: string,
): Promise<{ report: TreeHealthReport; people: AuditRun['people']; precomputed: boolean }> {
  const { report, people, precomputed } = await getAuditRun(treeId);
  return { report, people, precomputed };
}

export function invalidateCuriositiesCache(): void {
  runs.clear();
}
