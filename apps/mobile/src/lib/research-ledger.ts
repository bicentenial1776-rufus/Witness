import { useCallback, useEffect, useState } from 'react';

import { pulseSummary, type TreePulse } from '@witness/core/pulse';

import { ARCHIVES_ENABLED } from '@/lib/features';
import { supabase } from '@/lib/supabase';

/**
 * What the researcher has already decided, gathered from wherever they
 * decided it.
 *
 * Deliberately a ledger of *judgments*, not of open work. Counting what is
 * still outstanding would mean re-running the health check over the whole
 * tree just to draw a summary card — these are all cheap keyed counts, and
 * they are the half that actually accumulates. Open counts live on the
 * screens that compute them anyway.
 */
export interface ResearchLedger {
  treeHealth: { fixed: number; ruled: number };
  orphans: { fixed: number; ruled: number };
  archives: { confirmed: number; dismissed: number; pending: number };
  /** Every judgment above, for the "you have made N decisions" line. */
  total: number;
  /** The last GEDCOM Refresh on this tree, if it came from one. */
  pulse: { summary: string; at: string } | null;
}

/**
 * Both verdict tables are shared by Tree Health and Orphan Records, told
 * apart by an `orphan:` prefix on the key — see orphan-records.tsx, which
 * mints `orphan:<id>` where tree-health.tsx mints `<check>:<ids>`.
 */
const ORPHAN_PREFIX = 'orphan:';

type NaraStatus = 'pending' | 'confirmed' | 'dismissed';

async function countByStatus(treeId: string, status: NaraStatus): Promise<number> {
  const { count } = await supabase
    .from('nara_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('tree_id', treeId)
    .eq('status', status);
  return count ?? 0;
}

export function useResearchLedger(treeId: string | undefined): {
  ledger: ResearchLedger | null;
  reload: () => void;
} {
  const [ledger, setLedger] = useState<ResearchLedger | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!treeId) {
      setLedger(null);
      return;
    }
    let cancelled = false;
    setLedger(null);

    Promise.all([
      supabase.from('tree_health_marks').select('finding_key').eq('tree_id', treeId),
      // Rulings are user-scoped by design: "this is not an error" outlives
      // any one upload, so it is not filtered by tree here either.
      supabase.from('tree_health_rulings').select('xref_key'),
      countByStatus(treeId, 'confirmed'),
      countByStatus(treeId, 'dismissed'),
      countByStatus(treeId, 'pending'),
      supabase.from('trees').select('last_pulse, last_pulse_at').eq('id', treeId).maybeSingle(),
    ])
      .then(([marks, rulings, confirmed, dismissed, pending, tree]) => {
        if (cancelled) return;
        const markKeys = (marks.data ?? []).map((m) => m.finding_key);
        const ruleKeys = (rulings.data ?? []).map((r) => r.xref_key);
        const split = (keys: string[]) => ({
          orphan: keys.filter((k) => k.startsWith(ORPHAN_PREFIX)).length,
          health: keys.filter((k) => !k.startsWith(ORPHAN_PREFIX)).length,
        });
        const m = split(markKeys);
        const r = split(ruleKeys);
        setLedger({
          treeHealth: { fixed: m.health, ruled: r.health },
          orphans: { fixed: m.orphan, ruled: r.orphan },
          archives: { confirmed, dismissed, pending },
          total: markKeys.length + ruleKeys.length + confirmed + dismissed,
          // Summarised at write time by applyRefresh, so the card reads the
          // same sentence the reader was shown when they chose to apply —
          // re-summarising here could drift from what they agreed to.
          pulse:
            tree.data?.last_pulse && tree.data.last_pulse_at
              ? {
                  summary: pulseSummary(tree.data.last_pulse as unknown as TreePulse),
                  at: tree.data.last_pulse_at,
                }
              : null,
        });
      })
      .catch(() => {
        // A ledger is a summary; failing to draw it should never block the
        // briefs below it. Zeroes would lie, so stay null and render nothing.
        if (!cancelled) setLedger(null);
      });

    return () => {
      cancelled = true;
    };
  }, [treeId, nonce]);

  return { ledger, reload };
}

/** Kept a literal union so a mistyped destination fails the build, not the tap. */
export type LedgerRoute = '/tree-health' | '/orphan-records' | '/archives';

export interface LedgerEntry {
  key: string;
  label: string;
  /** The decisions themselves, already worded. */
  detail: string;
  route: LedgerRoute;
  count: number;
}

/**
 * The band's heading. A tree with candidates waiting but nothing yet decided
 * would otherwise be told it has made "0 decisions", which reads as a scold
 * rather than an invitation.
 */
export function ledgerHeading(ledger: ResearchLedger): string {
  if (ledger.total === 0) return 'Your findings · waiting on you';
  return `Your findings · ${ledger.total.toLocaleString()} ${
    ledger.total === 1 ? 'decision' : 'decisions'
  } so far`;
}

/** The ledger as rows, with the empty surfaces dropped. */
export function ledgerEntries(ledger: ResearchLedger): LedgerEntry[] {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const rows: LedgerEntry[] = [
    {
      key: 'tree-health',
      label: 'Tree Health',
      detail: [
        ledger.treeHealth.fixed > 0 && `${plural(ledger.treeHealth.fixed, 'record', 'records')} fixed`,
        ledger.treeHealth.ruled > 0 && `${ledger.treeHealth.ruled} ruled not an error`,
      ]
        .filter(Boolean)
        .join(' · '),
      route: '/tree-health',
      count: ledger.treeHealth.fixed + ledger.treeHealth.ruled,
    },
    {
      key: 'orphan-records',
      label: 'Orphan Records',
      detail: [
        ledger.orphans.fixed > 0 && `${plural(ledger.orphans.fixed, 'record', 'records')} reconnected`,
        ledger.orphans.ruled > 0 && `${ledger.orphans.ruled} ruled not an error`,
      ]
        .filter(Boolean)
        .join(' · '),
      route: '/orphan-records',
      count: ledger.orphans.fixed + ledger.orphans.ruled,
    },
    ...(ARCHIVES_ENABLED
      ? [
          {
            key: 'archives',
            label: 'The National Archives',
            detail: [
              ledger.archives.confirmed > 0 && `${ledger.archives.confirmed} confirmed`,
              ledger.archives.dismissed > 0 && `${ledger.archives.dismissed} dismissed`,
              ledger.archives.pending > 0 && `${ledger.archives.pending} awaiting you`,
            ]
              .filter(Boolean)
              .join(' · '),
            route: '/archives' as const,
            count: ledger.archives.confirmed + ledger.archives.dismissed + ledger.archives.pending,
          },
        ]
      : []),
  ];
  return rows.filter((row) => row.count > 0);
}
