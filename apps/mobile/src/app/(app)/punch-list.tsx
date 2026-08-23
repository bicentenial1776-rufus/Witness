import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, SectionList, View } from 'react-native';

import { correctionSnapshot, subjectLabel } from '@witness/core/corrections';
import { exportFileName, plainXref, punchListCsv, type PunchListCsvRow } from '@witness/core/export';
import {
  findOrphanRecords,
  findingKey,
  findingXrefKey,
  legacyFindingXrefKey,
  nameSlug,
  type HealthFinding,
  type OrphanIsland,
  type OrphanReport,
  type SoloOrphan,
} from '@witness/core/query';

import AncestorScreen from '@/app/(app)/ancestor/[id]';
import { Card } from '@/components/card';
import { useBroadsheet } from '@/components/broadsheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { showAlert } from '@/lib/alert';
import { providerPersonLink } from '@/lib/ancestry';
import {
  fetchTreeCorrections,
  setCorrectionStatus,
  type CorrectionPerson,
  type CorrectionRow,
} from '@/lib/corrections';
import { getAuditBundle, type AuditRun } from '@/lib/curiosities-cache';
import { saveTextFile } from '@/lib/export-file';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

// The workbench titles, so the punch list and the Tree Check name a
// category identically wherever the reader meets it.
import { CHECK_TITLES } from '@/lib/check-titles';

// External links open in a new tab on web (same-tab unloads the SPA) —
// mirror of the Portrait's openExternal.
function openExternalLink(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener');
  } else {
    void Linking.openURL(url);
  }
}

type TreeCorrection = CorrectionRow & { individuals: CorrectionPerson | null };

type PunchRow =
  | { kind: 'correction'; correction: TreeCorrection }
  | { kind: 'finding'; finding: HealthFinding }
  | { kind: 'island'; island: OrphanIsland }
  | { kind: 'solo'; solo: SoloOrphan };

interface PunchSection {
  key: string;
  title: string;
  count: number;
  data: PunchRow[];
}

/**
 * The punch list: every piece of open work in one place — your margin
 * corrections, the Tree Check's open findings, the orphan records — each
 * row with its road back to the source. The research ledger counts the
 * judgments already made; this is the other half, what is still open
 * (research-ledger.ts names exactly this gap). Export takes the whole
 * list to Ancestry as one worksheet.
 */
export default function PunchListScreen() {
  const { activeTree } = useActiveTree();
  const treeId = activeTree?.id;
  const broadsheet = useBroadsheet();
  const [bundle, setBundle] = useState<AuditRun | null>(null);
  const [orphans, setOrphans] = useState<OrphanReport | null>(null);
  const [corrections, setCorrections] = useState<TreeCorrection[]>([]);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [ruled, setRuled] = useState<Set<string>>(new Set());
  const [ancestryTreeId, setAncestryTreeId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    setBundle(null);
    setFailed(false);
    (async () => {
      try {
        const [run, places, marks, rulings, rows, tree] = await Promise.all([
          getAuditBundle(treeId),
          supabase.from('places').select('id, raw').eq('tree_id', treeId).limit(10000),
          supabase.from('tree_health_marks').select('finding_key').eq('tree_id', treeId),
          supabase.from('tree_health_rulings').select('xref_key'),
          fetchTreeCorrections(treeId),
          supabase.from('trees').select('ancestry_tree_id').eq('id', treeId).maybeSingle(),
        ]);
        if (cancelled) return;
        setBundle(run);
        setOrphans(
          findOrphanRecords(run.data, {
            placeNames: new Map((places.data ?? []).map((p) => [p.id, p.raw])),
          }),
        );
        setCorrections(rows);
        setMarked(new Set((marks.data ?? []).map((m) => m.finding_key)));
        setRuled(new Set((rulings.data ?? []).map((r) => r.xref_key)));
        setAncestryTreeId(tree.data?.ancestry_tree_id ?? null);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const people = bundle?.people ?? new Map();
  const healthPeople = useMemo(
    () => new Map((bundle?.data.individuals ?? []).map((i) => [i.id, i])),
    [bundle],
  );

  const isRuled = useCallback(
    (finding: Pick<HealthFinding, 'check' | 'individualIds'>) =>
      ruled.has(findingXrefKey(finding, people)) || ruled.has(legacyFindingXrefKey(finding, people)),
    [ruled, people],
  );

  // Orphan verdict keys — same construction as orphan-records.tsx, so a
  // decision made on either screen holds on both.
  const orphanRuled = useCallback(
    (id: string) => {
      const person = healthPeople.get(id);
      const slug = nameSlug(person?.full_name);
      const ref = person?.gedcom_xref ?? id;
      return (
        ruled.has(`orphan:${slug ? `${ref}~${slug}` : ref}`) || ruled.has(`orphan:${ref}`)
      );
    },
    [ruled, healthPeople],
  );
  const orphanOpen = useCallback(
    (id: string) => !marked.has(`orphan:${id}`) && !orphanRuled(id),
    [marked, orphanRuled],
  );

  const openFindings = useMemo(
    () =>
      (bundle?.report.findings ?? []).filter(
        (f) => !marked.has(findingKey(f)) && !isRuled(f),
      ),
    [bundle, marked, isRuled],
  );
  const openCorrections = useMemo(
    () => corrections.filter((c) => c.status === 'open'),
    [corrections],
  );
  const openIslands = useMemo(
    () => (orphans?.islands ?? []).filter((i) => orphanOpen(i.anchorId)),
    [orphans, orphanOpen],
  );
  const openSolos = useMemo(
    () => (orphans?.solos ?? []).filter((s) => orphanOpen(s.individualId)),
    [orphans, orphanOpen],
  );

  const linkFor = useCallback(
    (xref: string | null | undefined, familySearchId: string | null = null) =>
      xref ? providerPersonLink({ ancestryTreeId, xref, familySearchId }) : null,
    [ancestryTreeId],
  );

  /** The file has changed this fact since the correction was written. */
  const maybeAdopted = useCallback((c: TreeCorrection): boolean => {
    if (!c.snapshot_key || !c.individuals) return false;
    const fresh = correctionSnapshot(c.subject, c.individuals);
    return fresh !== null && fresh !== c.snapshot_key;
  }, []);

  async function toggleResolved(c: TreeCorrection) {
    const next = c.status === 'open' ? 'resolved' : 'open';
    setCorrections((prev) =>
      prev.map((r) => (r.id === c.id ? { ...r, status: next } : r)),
    );
    const saved = await setCorrectionStatus(c.id, next);
    if (!saved) {
      setCorrections((prev) =>
        prev.map((r) => (r.id === c.id ? { ...r, status: c.status } : r)),
      );
    }
  }

  function openPerson(id: string | null | undefined) {
    if (!id) return;
    if (broadsheet) setSelectedPerson(id);
    else router.push({ pathname: '/ancestor/[id]', params: { id } });
  }

  const sections = useMemo<PunchSection[]>(() => {
    const corrRows = openCorrections.map((correction) => ({ kind: 'correction' as const, correction }));
    const findingRows = openFindings.map((finding) => ({ kind: 'finding' as const, finding }));
    const orphanRows: PunchRow[] = [
      ...openIslands.map((island) => ({ kind: 'island' as const, island })),
      ...openSolos.map((solo) => ({ kind: 'solo' as const, solo })),
    ];
    return [
      {
        key: 'corrections',
        title: 'Your corrections — to enter at the source',
        count: corrRows.length,
        data: expanded.has('corrections') ? corrRows : [],
      },
      {
        key: 'findings',
        title: 'Tree Check findings',
        count: findingRows.length,
        data: expanded.has('findings') ? findingRows : [],
      },
      {
        key: 'orphans',
        title: 'Orphan records',
        count: orphanRows.length,
        data: expanded.has('orphans') ? orphanRows : [],
      },
    ];
  }, [openCorrections, openFindings, openIslands, openSolos, expanded]);

  const totalOpen =
    openCorrections.length + openFindings.length + openIslands.length + openSolos.length;

  /** One worksheet for everything open — the list that travels to Ancestry. */
  async function exportPunchList() {
    if (exporting || !bundle) return;
    setExporting(true);
    try {
      const rows: PunchListCsvRow[] = [
        ...openCorrections.map((c) => {
          const xref = c.individuals?.gedcom_xref ?? null;
          return {
            kind: 'Correction' as const,
            category: subjectLabel(c.subject),
            person: c.individuals?.full_name ?? 'Unnamed',
            xref: xref ? plainXref(xref) : null,
            problem: c.current_value ? `Record says: ${c.current_value}` : 'Not recorded',
            correction: c.corrected_value,
            note: c.note,
            ancestryUrl: linkFor(xref, c.individuals?.familysearch_id ?? null)?.url ?? null,
          };
        }),
        ...openFindings.map((f) => {
          const xref = people.get(f.individualIds[0])?.gedcom_xref ?? null;
          return {
            kind: 'Tree Check' as const,
            category: CHECK_TITLES[f.check],
            person: f.individualIds
              .map((id) => people.get(id)?.full_name ?? 'Unnamed')
              .join('; '),
            xref: xref ? plainXref(xref) : null,
            problem: f.detail,
            correction: null,
            note: null,
            ancestryUrl: linkFor(xref)?.url ?? null,
          };
        }),
        ...[...openIslands.map((i) => ({ id: i.anchorId, island: i, solo: null as SoloOrphan | null })),
          ...openSolos.map((s) => ({ id: s.individualId, island: null as OrphanIsland | null, solo: s }))].map(
          ({ id, island, solo }) => {
            const person = healthPeople.get(id);
            const suggestion = island?.suggestion ?? solo?.suggestion ?? null;
            return {
              kind: 'Orphan' as const,
              category: island ? 'Island' : 'Solo',
              person: person?.full_name ?? 'Unnamed',
              xref: person?.gedcom_xref ? plainXref(person.gedcom_xref) : null,
              problem: island
                ? `Island of ${island.memberIds.length} connected to each other, not to you`
                : solo?.deletionCandidate
                  ? 'Attached to no one — a name and nothing else; likely merge debris'
                  : 'Attached to no one',
              correction: suggestion
                ? `Possibly belongs near ${suggestion.candidateName} (${suggestion.reasons.join(', ')})`
                : null,
              note: null,
              ancestryUrl: linkFor(person?.gedcom_xref)?.url ?? null,
            };
          },
        ),
      ];
      await saveTextFile(
        exportFileName(activeTree?.name, 'punch-list', new Date().toISOString().slice(0, 10)),
        punchListCsv(rows),
        'text/csv',
        'public.comma-separated-values-text',
      );
    } catch {
      showAlert('Could not build the punch list', 'Try again in a moment.');
    } finally {
      setExporting(false);
    }
  }

  const header = (
    <View style={{ gap: 8, marginBottom: 16 }}>
      <ThemedText type="title">The punch list</ThemedText>
      {bundle && orphans ? (
        <>
          <ThemedText type="small" style={{ opacity: 0.8 }}>
            Everything still open — your corrections, the Tree Check’s findings, the orphan
            records — each with its road back to the source.
          </ThemedText>
          {totalOpen > 0 ? (
            <>
              <ThemedText type="smallBold">
                {totalOpen.toLocaleString()} open {totalOpen === 1 ? 'item' : 'items'}
              </ThemedText>
              <Pressable onPress={exportPunchList} disabled={exporting} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="accent">
                  {exporting ? 'Building your worksheet…' : '↓ Export this list as a spreadsheet'}
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <ThemedText>
              Nothing open. Your tree and your margin agree — until the next import finds
              something.
            </ThemedText>
          )}
        </>
      ) : failed ? (
        <ThemedText type="small">
          Couldn’t reach your tree just now — leave and come back to retry.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small">Gathering everything still open…</ThemedText>
          <ActivityIndicator style={{ marginVertical: 12 }} />
        </>
      )}
    </View>
  );

  const renderRow = (row: PunchRow) => {
    if (row.kind === 'correction') {
      const c = row.correction;
      const xref = c.individuals?.gedcom_xref ?? null;
      const link = linkFor(xref, c.individuals?.familysearch_id ?? null);
      return (
        <Card onPress={() => openPerson(c.individual_id)} style={{ marginBottom: 6, paddingVertical: 10 }}>
          <ThemedText type="smallBold">
            {c.individuals?.full_name ?? 'Unnamed'} · {subjectLabel(c.subject)}
          </ThemedText>
          {c.current_value && <ThemedText type="small">Record says: {c.current_value}</ThemedText>}
          <ThemedText type="small">Should be: {c.corrected_value}</ThemedText>
          {maybeAdopted(c) && (
            <ThemedText type="small" themeColor="accent">
              The file has changed this fact since you wrote this — it may have been adopted.
            </ThemedText>
          )}
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
            <Pressable onPress={() => void toggleResolved(c)} hitSlop={8}>
              <ThemedText type="smallBold" themeColor="accent">
                Entered at the source ✓
              </ThemedText>
            </Pressable>
            {link && (
              <Pressable onPress={() => openExternalLink(link.url)} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="accent">
                  {link.label} ›
                </ThemedText>
              </Pressable>
            )}
          </View>
        </Card>
      );
    }
    if (row.kind === 'finding') {
      const f = row.finding;
      const xref = people.get(f.individualIds[0])?.gedcom_xref ?? null;
      const link = linkFor(xref);
      return (
        <Card onPress={() => openPerson(f.individualIds[0])} style={{ marginBottom: 6, paddingVertical: 10 }}>
          <ThemedText type="small">{f.detail}</ThemedText>
          {link && (
            <Pressable onPress={() => openExternalLink(link.url)} hitSlop={8} style={{ marginTop: 6 }}>
              <ThemedText type="smallBold" themeColor="accent">
                {link.label} ›
              </ThemedText>
            </Pressable>
          )}
        </Card>
      );
    }
    const id = row.kind === 'island' ? row.island.anchorId : row.solo.individualId;
    const person = healthPeople.get(id);
    const suggestion = row.kind === 'island' ? row.island.suggestion : row.solo.suggestion;
    const link = linkFor(person?.gedcom_xref);
    return (
      <Card onPress={() => openPerson(id)} style={{ marginBottom: 6, paddingVertical: 10 }}>
        <ThemedText type="smallBold">{person?.full_name ?? 'Unnamed'}</ThemedText>
        <ThemedText type="small">
          {row.kind === 'island'
            ? `An island of ${row.island.memberIds.length} — connected to each other, not to you.`
            : row.solo.deletionCandidate
              ? 'Attached to no one — a name and nothing else; likely merge debris.'
              : 'Attached to no one.'}
        </ThemedText>
        {suggestion && (
          <ThemedText type="small">
            Possibly belongs near {suggestion.candidateName} — {suggestion.reasons.join(', ')}.
          </ThemedText>
        )}
        {link && (
          <Pressable onPress={() => openExternalLink(link.url)} hitSlop={8} style={{ marginTop: 6 }}>
            <ThemedText type="smallBold" themeColor="accent">
              {link.label} ›
            </ThemedText>
          </Pressable>
        )}
      </Card>
    );
  };

  const list = (
    <SectionList
      sections={sections}
      keyExtractor={(item, index) =>
        item.kind === 'correction'
          ? item.correction.id
          : item.kind === 'finding'
            ? `${findingKey(item.finding)}-${index}`
            : item.kind === 'island'
              ? `island-${item.island.anchorId}`
              : `solo-${item.solo.individualId}`
      }
      stickySectionHeadersEnabled
      contentContainerStyle={
        broadsheet
          ? { padding: 24, paddingTop: 32, paddingBottom: 48 }
          : { ...WideContent, padding: 24, paddingTop: 72, paddingBottom: 48 }
      }
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => (
        <Pressable
          onPress={() =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(section.key)) next.delete(section.key);
              else next.add(section.key);
              return next;
            })
          }
        >
          <ThemedView
            style={{ paddingTop: 12, paddingBottom: 6, flexDirection: 'row', alignItems: 'baseline', gap: 8 }}
          >
            <ThemedText type="subtitle" style={{ flex: 1 }}>
              {expanded.has(section.key) ? '▾' : '▸'} {section.title} · {section.count}
            </ThemedText>
          </ThemedView>
        </Pressable>
      )}
      renderItem={({ item }) => renderRow(item)}
    />
  );

  if (broadsheet) {
    return (
      <ThemedView style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 520, borderRightWidth: 1, borderRightColor: 'rgba(120,110,95,0.25)' }}>
          {list}
        </View>
        <View style={{ flex: 1 }}>
          {selectedPerson ? (
            <AncestorScreen key={selectedPerson} personId={selectedPerson} />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 48 }}>
              <ThemedText type="small" style={{ opacity: 0.6, textAlign: 'center', maxWidth: 360 }}>
                Select an item to see that person’s full page here — then follow the link to enter
                the fix at your source.
              </ThemedText>
            </View>
          )}
        </View>
      </ThemedView>
    );
  }

  return <ThemedView style={{ flex: 1 }}>{list}</ThemedView>;
}
