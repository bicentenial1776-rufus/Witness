import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, View } from 'react-native';

import {
  fetchOrphanBundle,
  nameSlug,
  type HealthIndividual,
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
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

const UPLOAD_NOTE = 'Reconnected records will fall off this list on the next GEDCOM upload.';

type OrphanRow =
  | { kind: 'island'; island: OrphanIsland }
  | { kind: 'solo'; solo: SoloOrphan };

interface OrphanSection {
  key: string;
  title: string;
  count: number;
  data: OrphanRow[];
}

function years(person: HealthIndividual | undefined): string {
  if (!person) return '';
  return `${person.birth_year ?? '?'}–${person.living ? '' : (person.death_year ?? '?')}`;
}

/**
 * Orphan records: islands and solo strays the family graph cannot reach
 * from the main tree, each with its heuristic "possibly belongs near…"
 * suggestion. Bare solo records — a name and nothing else — are flagged
 * as candidates for deletion; in reality they were likely lost in a
 * merge. Same workbench idiom as the Tree Check: collapsed categories,
 * split view on the broadsheet, Mark fixed and Not an error verdicts
 * (marks die with the tree on upload; rulings survive by xref).
 */
export default function OrphanRecordsScreen() {
  const params = useLocalSearchParams<{ treeId?: string }>();
  const { activeTree } = useActiveTree();
  const treeId = params.treeId ?? activeTree?.id;
  const broadsheet = useBroadsheet();
  const [report, setReport] = useState<OrphanReport | null>(null);
  const [people, setPeople] = useState<Map<string, HealthIndividual>>(new Map());
  const [failed, setFailed] = useState(false);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [ruled, setRuled] = useState<Set<string>>(new Set());
  const [showRuled, setShowRuled] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    setReport(null);
    setFailed(false);
    Promise.all([
      fetchOrphanBundle(supabase, treeId),
      supabase.from('tree_health_marks').select('finding_key').eq('tree_id', treeId),
      supabase.from('tree_health_rulings').select('xref_key'),
    ])
      .then(([bundle, marks, rulings]) => {
        if (cancelled) return;
        setPeople(new Map(bundle.data.individuals.map((i) => [i.id, i])));
        setReport(bundle.report);
        setMarked(new Set((marks.data ?? []).map((m) => m.finding_key)));
        setRuled(new Set((rulings.data ?? []).map((r) => r.xref_key)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  // Verdict keys: marks are tree-scoped (db ids are fine); rulings must
  // survive re-imports, so they key on the primary person's GEDCOM xref.
  const primaryId = (row: OrphanRow) =>
    row.kind === 'island' ? row.island.anchorId : row.solo.individualId;
  const fixedKey = (row: OrphanRow) => `orphan:${primaryId(row)}`;
  // Name-fused so one file's @I12@ can't silence another file's (the
  // 2026-07-26 audit); the legacy xref-only key keeps old rulings honored.
  const rulingKey = (row: OrphanRow) => {
    const id = primaryId(row);
    const person = people.get(id);
    const slug = nameSlug(person?.full_name);
    const ref = person?.gedcom_xref ?? id;
    return `orphan:${slug ? `${ref}~${slug}` : ref}`;
  };
  const legacyRulingKey = (row: OrphanRow) => {
    const id = primaryId(row);
    return `orphan:${people.get(id)?.gedcom_xref ?? id}`;
  };
  const rowRuled = (row: OrphanRow) => ruled.has(rulingKey(row)) || ruled.has(legacyRulingKey(row));

  const sections = useMemo<OrphanSection[]>(() => {
    if (!report) return [];
    const visible = (rows: OrphanRow[]) =>
      showRuled ? rows : rows.filter((row) => !rowRuled(row));
    const islands = visible(report.islands.map((island) => ({ kind: 'island' as const, island })));
    const solos = visible(report.solos.map((solo) => ({ kind: 'solo' as const, solo })));
    return [
      {
        key: 'islands',
        title: 'Islands — connected to each other, not to you',
        count: islands.length,
        data: expanded.has('islands') ? islands : [],
      },
      {
        key: 'solos',
        title: 'Solo records — attached to no one',
        count: solos.length,
        data: expanded.has('solos') ? solos : [],
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, ruled, people, showRuled, expanded]);

  async function toggleFixed(row: OrphanRow) {
    if (!treeId) return;
    const key = fixedKey(row);
    const wasMarked = marked.has(key);
    setMarked((prev) => {
      const next = new Set(prev);
      if (wasMarked) next.delete(key);
      else next.add(key);
      return next;
    });
    if (wasMarked) {
      await supabase.from('tree_health_marks').delete().eq('tree_id', treeId).eq('finding_key', key);
    } else {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      await supabase
        .from('tree_health_marks')
        .upsert(
          { tree_id: treeId, user_id: auth.user.id, finding_key: key },
          { onConflict: 'tree_id,finding_key' },
        );
    }
  }

  async function toggleRuling(row: OrphanRow) {
    const key = rulingKey(row);
    const legacy = legacyRulingKey(row);
    const wasRuled = ruled.has(key) || ruled.has(legacy);
    setRuled((prev) => {
      const next = new Set(prev);
      if (wasRuled) {
        next.delete(key);
        next.delete(legacy);
      } else next.add(key);
      return next;
    });
    if (wasRuled) {
      await supabase.from('tree_health_rulings').delete().in('xref_key', [key, legacy]);
    } else {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      await supabase
        .from('tree_health_rulings')
        .upsert({ user_id: auth.user.id, xref_key: key }, { onConflict: 'user_id,xref_key' });
    }
  }

  function openPerson(id: string) {
    if (broadsheet) setSelectedPerson(id);
    else router.push({ pathname: '/ancestor/[id]', params: { id } });
  }

  const ruledCount = useMemo(() => {
    if (!report) return 0;
    const all: OrphanRow[] = [
      ...report.islands.map((island) => ({ kind: 'island' as const, island })),
      ...report.solos.map((solo) => ({ kind: 'solo' as const, solo })),
    ];
    return all.filter((row) => rowRuled(row)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, ruled, people]);

  const header = (
    <View style={{ gap: 8, marginBottom: 16 }}>
      <View
        style={{
          flexDirection: broadsheet ? 'row' : 'column',
          justifyContent: 'space-between',
          alignItems: broadsheet ? 'flex-start' : 'stretch',
          gap: 8,
        }}
      >
        <ThemedText type="title">Orphan Records</ThemedText>
        <ThemedText
          type="small"
          style={broadsheet ? { maxWidth: 260, textAlign: 'right', opacity: 0.8 } : { opacity: 0.8 }}
        >
          {UPLOAD_NOTE}
        </ThemedText>
      </View>
      {report ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 }}>
            <ThemedText type="smallBold">
              {report.totalDisconnected.toLocaleString()} records aren’t connected to your tree —{' '}
              {report.islands.length} {report.islands.length === 1 ? 'island' : 'islands'} ·{' '}
              {report.solos.length} solo
              {ruledCount > 0 ? ` · ${ruledCount.toLocaleString()} ruled not an error` : ''}
            </ThemedText>
            {ruledCount > 0 && (
              <Pressable onPress={() => setShowRuled((s) => !s)} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="accent">
                  {showRuled ? 'hide them' : 'show them'}
                </ThemedText>
              </Pressable>
            )}
          </View>
          <ThemedText type="small" style={{ opacity: 0.7 }}>
            Suggestions are leads scored on surname, era, and shared places — verify at your
            source before connecting.
          </ThemedText>
          {report.totalDisconnected === 0 && (
            <ThemedText>Every record in your tree connects to every other. Remarkable.</ThemedText>
          )}
        </>
      ) : failed ? (
        <ThemedText type="small">
          Couldn’t reach your tree just now — leave and come back to retry.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small">Tracing every connection in your tree…</ThemedText>
          <ActivityIndicator style={{ marginVertical: 12 }} />
        </>
      )}
    </View>
  );

  const renderRow = (row: OrphanRow) => {
    const id = primaryId(row);
    const person = people.get(id);
    const isFixed = marked.has(fixedKey(row));
    const isRuled = rowRuled(row);
    const suggestion = row.kind === 'island' ? row.island.suggestion : row.solo.suggestion;
    return (
      <Card
        onPress={() => openPerson(id)}
        style={{
          marginBottom: 6,
          paddingVertical: 10,
          opacity: isFixed || isRuled ? 0.55 : 1,
          ...(broadsheet && selectedPerson === id ? { borderWidth: 1.5 } : null),
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <ThemedText style={{ flex: 1 }}>
            {person?.full_name ?? 'Unknown'}{' '}
            <ThemedText type="small">({years(person)})</ThemedText>
          </ThemedText>
          {row.kind === 'island' && (
            <ThemedText type="smallBold">{row.island.memberIds.length} records</ThemedText>
          )}
        </View>
        {row.kind === 'solo' && row.solo.deletionCandidate ? (
          <ThemedText type="small" themeColor="accent" style={{ marginTop: 2 }}>
            Candidate for deletion — a name and nothing else, likely lost in a merge. Verify at
            your source before removing.
          </ThemedText>
        ) : suggestion ? (
          <Pressable onPress={() => openPerson(suggestion.candidateId)} hitSlop={4}>
            <ThemedText type="small" style={{ marginTop: 2 }}>
              Possibly belongs near{' '}
              <ThemedText type="smallBold" themeColor="accent">
                {suggestion.candidateName}
              </ThemedText>{' '}
              — {suggestion.reasons.join('; ')}
            </ThemedText>
          </Pressable>
        ) : (
          <ThemedText type="small" style={{ marginTop: 2, opacity: 0.7 }}>
            No plausible connection found in the main tree.
          </ThemedText>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 18 }}>
            {isRuled ? (
              <Pressable onPress={() => toggleRuling(row)} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="accent">
                  ✓ Not an error — tap to undo
                </ThemedText>
              </Pressable>
            ) : (
              <>
                <Pressable onPress={() => toggleFixed(row)} hitSlop={8}>
                  <ThemedText type="smallBold" themeColor="accent">
                    {isFixed ? '✓ Fixed — tap to undo' : 'Mark fixed'}
                  </ThemedText>
                </Pressable>
                {!isFixed && (
                  <Pressable onPress={() => toggleRuling(row)} hitSlop={8}>
                    <ThemedText type="smallBold" style={{ opacity: 0.7 }}>
                      Not an error
                    </ThemedText>
                  </Pressable>
                )}
              </>
            )}
          </View>
          {!broadsheet && <ThemedText type="small">›</ThemedText>}
        </View>
      </Card>
    );
  };

  const list = (
    <SectionList
      sections={sections}
      keyExtractor={(row) => (row.kind === 'island' ? `i-${row.island.anchorId}` : `s-${row.solo.individualId}`)}
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
          <ThemedView style={{ paddingTop: 12, paddingBottom: 6 }}>
            <ThemedText type="subtitle">
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
                Select a record to see that person here — suggestions name the main-tree ancestor
                they might belong near.
              </ThemedText>
            </View>
          )}
        </View>
      </ThemedView>
    );
  }

  return <ThemedView style={{ flex: 1 }}>{list}</ThemedView>;
}
