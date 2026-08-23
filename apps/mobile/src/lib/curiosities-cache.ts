import {
  fetchTreeHealthData,
  findingKey,
  findingXrefKey,
  legacyFindingXrefKey,
  runTreeHealth,
  type HealthFinding,
  type TreeHealthData,
  type TreeHealthReport,
} from '@witness/core/query';

import { supabase } from '@/lib/supabase';

/**
 * Curiosities — the surface voice for Tree Health (docs/phone-ia-design-
 * brief.md): a curiosity is a prompt, not a problem. The forensic audit
 * runs once per tree per session (the same heavy fetch the Tree Check
 * makes); marks and rulings are re-read on every call so a "Mark fixed"
 * on the workbench is reflected the next time Home or the Tree tab asks.
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

export interface AuditRun {
  data: TreeHealthData;
  report: TreeHealthReport;
  people: Map<string, { gedcom_xref: string | null; surname: string | null; full_name: string }>;
}

const runs = new Map<string, Promise<AuditRun>>();
// A failed audit fetch is ~30 paginated requests; without a backoff every
// Home/Tree focus on a flaky network re-fires the whole sweep.
const failedAt = new Map<string, number>();
const FAILURE_BACKOFF_MS = 60_000;

function getAuditRun(treeId: string): Promise<AuditRun> {
  const lastFailure = failedAt.get(treeId);
  if (lastFailure && Date.now() - lastFailure < FAILURE_BACKOFF_MS) {
    return Promise.reject(new Error('curiosities fetch backing off'));
  }
  let pending = runs.get(treeId);
  if (!pending) {
    pending = fetchTreeHealthData(supabase, treeId).then((data) => ({
      data,
      report: runTreeHealth(data, { currentYear: new Date().getFullYear() }),
      people: new Map(
        data.individuals.map((i) => [
          i.id,
          { gedcom_xref: i.gedcom_xref, surname: i.surname, full_name: i.full_name },
        ]),
      ),
    }));
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
 * The whole cached run — data included. The punch list needs the raw
 * TreeHealthData to compute orphan records without re-downloading the
 * ~30 pages this cache exists to save.
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
): Promise<{ report: TreeHealthReport; people: AuditRun['people'] }> {
  const { report, people } = await getAuditRun(treeId);
  return { report, people };
}

export function invalidateCuriositiesCache(): void {
  runs.clear();
}
