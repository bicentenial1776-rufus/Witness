import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, View } from 'react-native';

import {
  fetchTreeHealthData,
  runTreeHealth,
  type HealthCheckId,
  type HealthFinding,
  type TreeHealthReport,
} from '@witness/core/query';

import { Card } from '@/components/card';
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

interface CheckSection {
  key: string;
  title: string;
  severity: HealthFinding['severity'];
  data: HealthFinding[];
}

/**
 * The FTAnalyzer Tree Check: every finding from the Tree Health audit,
 * grouped by check, failures before cautions, each row landing on the
 * person it accuses. The audit runs fresh on entry — it reads the whole
 * tree once and everything after is local.
 */
export default function TreeHealthScreen() {
  const params = useLocalSearchParams<{ treeId?: string }>();
  const { activeTree } = useActiveTree();
  const treeId = params.treeId ?? activeTree?.id;
  const [report, setReport] = useState<TreeHealthReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    setReport(null);
    setFailed(false);
    fetchTreeHealthData(supabase, treeId)
      .then((data) => {
        if (!cancelled) setReport(runTreeHealth(data, { currentYear: new Date().getFullYear() }));
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
      .map(([check, data]) => ({
        key: check,
        title: CHECK_TITLES[check],
        severity: data[0]!.severity,
        data,
      }))
      .sort((a, b) =>
        a.severity !== b.severity ? (a.severity === 'fail' ? -1 : 1) : b.data.length - a.data.length,
      );
  }, [report]);

  const fails = report?.findings.filter((f) => f.severity === 'fail').length ?? 0;
  const cautions = (report?.findings.length ?? 0) - fails;

  return (
    <ThemedView style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.check}-${index}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ ...WideContent, padding: 24, paddingTop: 72, paddingBottom: 48 }}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 16 }}>
            <ThemedText type="title">FTAnalyzer Tree Check</ThemedText>
            {report ? (
              <>
                <ThemedText type="small">
                  {report.individualsChecked.toLocaleString()} people and{' '}
                  {report.familiesChecked.toLocaleString()} families examined.
                </ThemedText>
                <ThemedText type="smallBold">
                  {fails.toLocaleString()} {fails === 1 ? 'failure' : 'failures'} ·{' '}
                  {cautions.toLocaleString()} {cautions === 1 ? 'caution' : 'cautions'}
                </ThemedText>
                {report.findings.length === 0 && (
                  <ThemedText>
                    Nothing to report — every check passed at the precision your dates were
                    recorded.
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
        }
        renderSectionHeader={({ section }) => (
          <ThemedText type="subtitle" style={{ marginTop: 16, marginBottom: 6 }}>
            {section.title} · {section.data.length}
          </ThemedText>
        )}
        renderItem={({ item }) => (
          <Card
            onPress={() =>
              router.push({ pathname: '/ancestor/[id]', params: { id: item.individualIds[0]! } })
            }
            style={{ marginBottom: 6, paddingVertical: 10 }}
          >
            <ThemedText type="smallBold" themeColor={item.severity === 'fail' ? 'accent' : undefined}>
              {item.severity === 'fail' ? '✗ Failure' : '⚠ Caution'}
            </ThemedText>
            <ThemedText type="small">{item.detail}</ThemedText>
          </Card>
        )}
        ListFooterComponent={
          report ? (
            <ThemedText type="small" style={{ marginTop: 24, opacity: 0.7 }}>
              {ATTRIBUTION}
            </ThemedText>
          ) : null
        }
      />
    </ThemedView>
  );
}
