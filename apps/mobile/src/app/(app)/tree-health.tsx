import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, View } from 'react-native';

import {
  fetchTreeHealthData,
  findingKey,
  runTreeHealth,
  type HealthCheckId,
  type HealthFinding,
  type TreeHealthReport,
} from '@witness/core/query';

import AncestorScreen from '@/app/(app)/ancestor/[id]';
import { Card } from '@/components/card';
import { useBroadsheet } from '@/components/broadsheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

const CHECK_TITLES: Record<HealthCheckId, string> = {
  birth_after_death: 'Born after dying',
  burial_before_death: 'Buried before dying',
  father_too_old: 'Father implausibly old',
  mother_too_old: 'Mother implausibly old',
  father_too_young: 'Father implausibly young',
  mother_too_young: 'Mother implausibly young',
  born_after_mothers_death: 'Born after the mother’s death',
  born_long_after_fathers_death: 'Born years after the father’s death',
  implausible_lifespan: 'Lifespans past 110',
  fact_before_birth: 'Facts dated before birth',
  fact_after_death: 'Facts dated after death',
  marriage_after_death: 'Married after dying',
  marriage_before_13: 'Married before age 13',
  living_but_has_death: 'Living, but with a death recorded',
  duplicate_fact: 'The same fact recorded twice',
  conflicting_fact: 'Conflicting dates for one fact',
  husband_recorded_female: 'Husband recorded as female',
  wife_recorded_male: 'Wife recorded as male',
  same_surname_couple: 'Couples sharing a surname',
  sibling_born_too_soon: 'Siblings born close together',
  sibling_born_impossibly_soon: 'Siblings born impossibly close',
  date_in_future: 'Dates in the future',
};

const ATTRIBUTION =
  'Data-integrity checks adapted from FTAnalyzer (© Alexander Bisset, Apache License 2.0). GPL-related functionality not included.';

const UPLOAD_NOTE = 'Corrected records will fall off this list on the next GEDCOM upload.';

interface CheckSection {
  key: string;
  title: string;
  data: HealthFinding[];
}

/**
 * The FTAnalyzer Tree Check. Phone: the grouped list, each record
 * opening the ancestor's page. Broadsheet: a workbench — records on the
 * left, the selected person's full detail on the right, so a fix in
 * Ancestry is one glance away. "Fixed" marks persist per tree and die
 * with it on the next upload (tree_health_marks cascades with trees).
 */
export default function TreeHealthScreen() {
  const params = useLocalSearchParams<{ treeId?: string }>();
  const { activeTree } = useActiveTree();
  const treeId = params.treeId ?? activeTree?.id;
  const broadsheet = useBroadsheet();
  const [report, setReport] = useState<TreeHealthReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    setReport(null);
    setFailed(false);
    Promise.all([
      fetchTreeHealthData(supabase, treeId),
      supabase.from('tree_health_marks').select('finding_key').eq('tree_id', treeId),
    ])
      .then(([data, marks]) => {
        if (cancelled) return;
        setReport(runTreeHealth(data, { currentYear: new Date().getFullYear() }));
        setMarked(new Set((marks.data ?? []).map((m) => m.finding_key)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const sections = useMemo<CheckSection[]>(() => {
    if (!report) return [];
    const byCheck = new Map<HealthCheckId, HealthFinding[]>();
    for (const finding of report.findings) {
      if (!byCheck.has(finding.check)) byCheck.set(finding.check, []);
      byCheck.get(finding.check)!.push(finding);
    }
    return [...byCheck.entries()]
      .map(([check, data]) => ({ key: check, title: CHECK_TITLES[check], data }))
      .sort((a, b) => b.data.length - a.data.length);
  }, [report]);

  async function toggleFixed(finding: HealthFinding) {
    if (!treeId) return;
    const key = findingKey(finding);
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

  function openFinding(finding: HealthFinding) {
    const person = finding.individualIds[0];
    if (!person) return;
    if (broadsheet) {
      setSelectedKey(findingKey(finding));
      setSelectedPerson(person);
    } else {
      router.push({ pathname: '/ancestor/[id]', params: { id: person } });
    }
  }

  const total = report?.findings.length ?? 0;
  const fixedCount = report
    ? report.findings.filter((f) => marked.has(findingKey(f))).length
    : 0;

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
        <ThemedText type="title">FTAnalyzer Tree Check</ThemedText>
        <ThemedText
          type="small"
          style={broadsheet ? { maxWidth: 260, textAlign: 'right', opacity: 0.8 } : { opacity: 0.8 }}
        >
          {UPLOAD_NOTE}
        </ThemedText>
      </View>
      <ThemedText type="small" style={{ opacity: 0.7 }}>
        {ATTRIBUTION}
      </ThemedText>
      {report ? (
        <>
          <ThemedText type="smallBold">
            {total.toLocaleString()} {total === 1 ? 'record' : 'records'} found
            {fixedCount > 0 ? ` · ${fixedCount.toLocaleString()} marked fixed` : ''}
          </ThemedText>
          {total === 0 && (
            <ThemedText>
              Nothing to report — every check passed at the precision your dates were recorded.
            </ThemedText>
          )}
        </>
      ) : failed ? (
        <ThemedText type="small">
          Couldn’t reach your tree just now — leave and come back to retry.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small">Examining every person, family, and date…</ThemedText>
          <ActivityIndicator style={{ marginVertical: 12 }} />
        </>
      )}
    </View>
  );

  const list = (
    <SectionList
      sections={sections}
      keyExtractor={(item, index) => `${item.check}-${index}`}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={
        broadsheet
          ? { padding: 24, paddingTop: 32, paddingBottom: 48 }
          : { ...WideContent, padding: 24, paddingTop: 72, paddingBottom: 48 }
      }
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => (
        <ThemedText type="subtitle" style={{ marginTop: 16, marginBottom: 6 }}>
          {section.title} · {section.data.length}
        </ThemedText>
      )}
      renderItem={({ item }) => {
        const key = findingKey(item);
        const isFixed = marked.has(key);
        const isSelected = broadsheet && selectedKey === key;
        return (
          <Card
            onPress={() => openFinding(item)}
            style={{
              marginBottom: 6,
              paddingVertical: 10,
              opacity: isFixed ? 0.55 : 1,
              ...(isSelected ? { borderWidth: 1.5 } : null),
            }}
          >
            <ThemedText type="small">{item.detail}</ThemedText>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Pressable onPress={() => toggleFixed(item)} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="accent">
                  {isFixed ? '✓ Fixed — tap to undo' : 'Mark fixed'}
                </ThemedText>
              </Pressable>
              {!broadsheet && <ThemedText type="small">›</ThemedText>}
            </View>
          </Card>
        );
      }}
    />
  );

  // Broadsheet: the workbench split — records left, the person right.
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
                Select a record to see that person’s full page here — then make the correction at
                your source and mark it fixed.
              </ThemedText>
            </View>
          )}
        </View>
      </ThemedView>
    );
  }

  return <ThemedView style={{ flex: 1 }}>{list}</ThemedView>;
}
