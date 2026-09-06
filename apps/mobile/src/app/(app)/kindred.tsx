import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { kindredCouples, type KindredCouple } from '@witness/core/family';
import type { GraphPerson } from '@witness/core/family';

import { Card } from '@/components/card';
import { KinLine } from '@/components/kin-line';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useKinMap } from '@/hooks/use-kin-map';
import type { Kin } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

function years(person: { birthYear: number | null; deathYear: number | null }): string {
  return `${person.birthYear ?? '?'}–${person.deathYear ?? '?'}`;
}

function visit(id: string) {
  router.push({ pathname: '/ancestor/[id]', params: { id } });
}

/** One descent line, top (child of the common ancestor) to the spouse. */
function DescentColumn({ path, kin }: { path: GraphPerson[]; kin: Map<string, Kin> }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      {path.slice(1).map((person) => (
        <View key={person.id} style={{ alignItems: 'center' }}>
          <ThemedText type="small">↓</ThemedText>
          <ThemedText
            type="small"
            themeColor="accent"
            style={{ textAlign: 'center' }}
            onPress={() => visit(person.id)}
          >
            {person.name}
          </ThemedText>
          <KinLine kin={kin.get(person.id)} />
          <ThemedText type="small">{years(person)}</ThemedText>
        </View>
      ))}
    </View>
  );
}

/**
 * The side-by-side descent diagram: the shared ancestor at the crown,
 * one column per spouse's line down to the couple themselves.
 */
function CoupleDiagram({ couple, kin }: { couple: KindredCouple; kin: Map<string, Kin> }) {
  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      <View style={{ alignItems: 'center' }}>
        <ThemedText type="smallBold" themeColor="accent" onPress={() => visit(couple.commonAncestor.id)}>
          {couple.commonAncestor.name}
        </ThemedText>
        <KinLine kin={kin.get(couple.commonAncestor.id)} />
        <ThemedText type="small">{years(couple.commonAncestor)}</ThemedText>
        <ThemedText type="small">↙ ↘</ThemedText>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <DescentColumn path={couple.pathA} kin={kin} />
        <DescentColumn path={couple.pathB} kin={kin} />
      </View>
    </View>
  );
}

function CoupleCard({ couple, kin }: { couple: KindredCouple; kin: Map<string, Kin> }) {
  const [showDiagram, setShowDiagram] = useState(false);

  return (
    <Card>
      <ThemedText type="subtitle">
        {couple.spouseA.name} ⚭ {couple.spouseB.name}
      </ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <KinLine kin={kin.get(couple.spouseA.id)} />
        <KinLine kin={kin.get(couple.spouseB.id)} />
      </View>
      <ThemedText type="smallBold" themeColor="accent">
        {couple.label.toUpperCase()}
      </ThemedText>
      <ThemedText type="small">
        {years(couple.spouseA)} · {years(couple.spouseB)}
      </ThemedText>
      <ThemedText type="small">
        {couple.commonAncestor.name} is {couple.spouseA.name.split(' ')[0]}’s{' '}
        {couple.ancestorLabelA} and {couple.spouseB.name.split(' ')[0]}’s{' '}
        {couple.ancestorLabelB}.
      </ThemedText>
      <ThemedText type="link" onPress={() => setShowDiagram((s) => !s)}>
        {showDiagram ? 'Hide the two lines ▴' : 'See how they’re related ▾'}
      </ThemedText>
      {showDiagram && <CoupleDiagram couple={couple} kin={kin} />}
    </Card>
  );
}

export default function KindredScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [couples, setCouples] = useState<KindredCouple[] | null>(null);
  const kin = useKinMap(treeId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    kindredCouples(supabase, treeId)
      .then((result) => {
        if (!cancelled) setCouples(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 8 }}>
        <ThemedText type="small">
          Marriages between blood relatives, as deep as the tree records — closest kinship first.
          Common in close-knit communities, and occasionally a sign of two records that need
          untangling.
        </ThemedText>

        {error && <ThemedText>Something went wrong: {error}</ThemedText>}
        {!couples && !error && (
          <View style={{ gap: 8, marginVertical: 16 }}>
            <ActivityIndicator />
            <ThemedText type="small" style={{ textAlign: 'center' }}>
              Sweeping every marriage in the tree…
            </ThemedText>
          </View>
        )}

        {couples?.length === 0 && (
          <ThemedText style={{ marginTop: 8 }}>
            No kindred couples found — no spouses in your tree share a grandparent or closer.
          </ThemedText>
        )}

        {couples?.map((couple) => (
          <CoupleCard kin={kin} key={`${couple.spouseA.id}-${couple.spouseB.id}`} couple={couple} />
        ))}
      </ScrollView>
    </ThemedView>
  );
}
