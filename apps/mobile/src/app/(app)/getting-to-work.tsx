import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import {
  averageAgeAtFirstMarriageByCentury,
  averageAgeAtFirstMarriageBySex,
  averageLifespanByCentury,
  mortalityByDecade,
  type TreeIndex,
} from '@witness/core/query';

import { Masthead, PageShell, useBroadsheet } from '@/components/broadsheet';
import {
  BarList,
  ChartFrame,
  ColumnChart,
  PairedBars,
  StatTile,
  TrendDots,
  type Datum,
} from '@/components/charts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Broadsheet, BrandFonts, WideContent } from '@/constants/theme';
import { useActiveTree } from '@/lib/active-tree';
import { getTreeIndex } from '@/lib/tree-index-cache';

const C = Broadsheet.color;

/**
 * Getting To Work — the analytical read on a tree.
 *
 * Every figure here comes from computation Witness already does; nothing on
 * this screen required a new query. It exists because those numbers were
 * previously only ever answers to a specific question, never a view of the
 * whole, and a researcher sizing up a tree wants the whole.
 *
 * Desk-first by design. The charts want width, and this is the kind of
 * reading done sitting down; the phone gets the headline figures and is
 * pointed at a wider screen for the rest.
 */

interface Panels {
  people: number;
  withBirth: number;
  withDeath: number;
  surnames: number;
  lifespanByCentury: Datum[];
  mortality: Datum[];
  marriageByCentury: Datum[];
  marriageBySex: { key: string; label: string; value: number }[];
  topSurnames: Datum[];
  medianLifespan: number | null;
}

function centuryLabel(century: number): string {
  return `${String(century).slice(0, 2)}00s`;
}

function build(index: TreeIndex): Panels {
  const people = [...index.individuals.values()];
  const withBirth = people.filter((p) => p.birth_year !== null).length;
  const withDeath = people.filter((p) => p.death_year !== null).length;

  const surnameCounts = new Map<string, number>();
  for (const person of people) {
    const surname = person.surname?.trim();
    if (!surname) continue;
    surnameCounts.set(surname, (surnameCounts.get(surname) ?? 0) + 1);
  }

  const lifespans = averageLifespanByCentury(index);
  // Weighted across every cohort — the single "how long did they live" number.
  const totalCounted = lifespans.reduce((sum, c) => sum + c.count, 0);
  const medianLifespan =
    totalCounted > 0
      ? lifespans.reduce((sum, c) => sum + c.averageLifespan * c.count, 0) / totalCounted
      : null;

  return {
    people: people.length,
    withBirth,
    withDeath,
    surnames: surnameCounts.size,
    medianLifespan,
    lifespanByCentury: lifespans
      // One or two dated people in a century is noise drawn as a trend.
      .filter((c) => c.count >= 5)
      .map((c) => ({
        key: String(c.century),
        label: centuryLabel(c.century),
        value: c.averageLifespan,
        detail: `${centuryLabel(c.century)}: ${c.averageLifespan.toFixed(1)} years, from ${c.count.toLocaleString()} lives`,
      })),
    mortality: mortalityByDecade(index)
      .slice()
      .sort((a, b) => a.decade - b.decade)
      .map((d) => ({
        key: String(d.decade),
        label: `${d.decade}`,
        value: d.count,
        detail: `${d.decade}s: ${d.count.toLocaleString()} recorded deaths`,
      })),
    marriageByCentury: averageAgeAtFirstMarriageByCentury(index)
      .filter((c) => c.count >= 5)
      .map((c) => ({
        key: String(c.century),
        label: centuryLabel(c.century),
        value: c.averageAge,
        detail: `${centuryLabel(c.century)}: married at ${c.averageAge.toFixed(1)} on average, from ${c.count.toLocaleString()} marriages`,
      })),
    marriageBySex: averageAgeAtFirstMarriageBySex(index).map((s) => ({
      key: s.sex,
      label: s.sex === 'M' ? 'Men' : 'Women',
      value: s.averageAge,
    })),
    topSurnames: [...surnameCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([surname, n]) => ({
        key: surname,
        label: surname,
        value: n,
        detail: `${n.toLocaleString()} people`,
      })),
  };
}

export default function GettingToWorkScreen() {
  const { activeTree } = useActiveTree();
  const broadsheet = useBroadsheet();
  const [panels, setPanels] = useState<Panels | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!activeTree) return;
    let cancelled = false;
    setPanels(null);
    setFailed(false);
    getTreeIndex(activeTree.id)
      .then((index) => {
        if (!cancelled) setPanels(build(index));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTree?.id]);

  if (!broadsheet) {
    // The charts need width. Rather than crush them onto a phone, give the
    // headline figures and say plainly where the rest lives.
    return (
      <ThemedView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingTop: 72, gap: 10 }}>
          <ThemedText type="title">Getting To Work</ThemedText>
          {panels ? (
            <>
              <ThemedText>
                {panels.people.toLocaleString()} people · {panels.surnames.toLocaleString()} surnames
                {panels.medianLifespan
                  ? ` · they lived ${panels.medianLifespan.toFixed(0)} years on average`
                  : ''}
              </ThemedText>
              <ThemedText type="small">
                {panels.withBirth.toLocaleString()} have a birth year and{' '}
                {panels.withDeath.toLocaleString()} a death year — the dated core everything below
                is measured from.
              </ThemedText>
              <ThemedText type="small" style={{ marginTop: 12, opacity: 0.8 }}>
                The full picture — lifespans across the centuries, mortality by decade, marriage
                ages and your commonest names — is drawn on a wider screen. Open Witness in a
                browser at app.witnesslives.com.
              </ThemedText>
            </>
          ) : failed ? (
            <ThemedText type="small">Couldn’t read your tree just now.</ThemedText>
          ) : (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          )}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <PageShell
      masthead={
        <Masthead
          title="Getting To Work"
          metaMono={panels ? `${panels.people.toLocaleString()} PEOPLE MEASURED` : ''}
          metaCaption="What the shape of your tree says"
        />
      }
    >
      {!panels ? (
        failed ? (
          <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 17, color: C.inkSecondary }}>
            Couldn’t read your tree just now — leave and come back to retry.
          </Text>
        ) : (
          <ActivityIndicator style={{ marginVertical: 60 }} />
        )
      ) : (
        <View style={{ gap: 20 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <StatTile value={panels.people.toLocaleString()} label="People" />
            <StatTile value={panels.surnames.toLocaleString()} label="Surnames" />
            <StatTile value={panels.withBirth.toLocaleString()} label="With a birth year" />
            <StatTile value={panels.withDeath.toLocaleString()} label="With a death year" />
            <StatTile
              value={panels.medianLifespan ? `${panels.medianLifespan.toFixed(0)}` : '—'}
              label="Average lifespan"
            />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <ChartFrame
              title="Lifespans across the centuries"
              caption="Average years lived, by century of birth. Centuries with fewer than five dated lives are left out."
            >
              <TrendDots data={panels.lifespanByCentury} unit="years" />
            </ChartFrame>

            <ChartFrame
              title="Deaths by decade"
              caption="When the deaths in your tree were recorded — as much a map of your sources as of mortality."
            >
              <ColumnChart data={panels.mortality} />
            </ChartFrame>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <ChartFrame
              title="Age at first marriage"
              caption="By century of the marriage."
            >
              <TrendDots data={panels.marriageByCentury} unit="years" />
            </ChartFrame>

            <ChartFrame title="Who married younger" caption="Average age at a first marriage.">
              <PairedBars data={panels.marriageBySex} unit="years" />
            </ChartFrame>

            <ChartFrame title="Your commonest names" caption="The eight surnames carried by most people.">
              <BarList data={panels.topSurnames} />
            </ChartFrame>
          </View>

          <Text
            style={{
              fontFamily: BrandFonts.sans.regular,
              fontSize: 13,
              color: C.inkMuted,
              marginTop: 4,
            }}
          >
            Every figure is measured from the records you imported, not estimated. Where a date is
            missing the person is left out of that chart rather than guessed at, so a thin century
            usually means thin sources rather than a thin family.
          </Text>
        </View>
      )}
    </PageShell>
  );
}
