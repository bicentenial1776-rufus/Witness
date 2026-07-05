import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { kindredCouples, type KindredCouple } from '@witness/core/family';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

function years(person: { birthYear: number | null; deathYear: number | null }): string {
  return `${person.birthYear ?? '?'}–${person.deathYear ?? '?'}`;
}

export default function KindredScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [couples, setCouples] = useState<KindredCouple[] | null>(null);
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
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48, gap: 8 }}>
        <ThemedText type="small">
          Marriages between blood relatives — a shared grandparent or closer. Common in close-knit
          communities, and occasionally a sign of two records that need untangling.
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
          <Card key={`${couple.spouseA.id}-${couple.spouseB.id}`}>
            <ThemedText type="subtitle">
              {couple.spouseA.name} ⚭ {couple.spouseB.name}
            </ThemedText>
            <ThemedText type="smallBold" themeColor="accent">
              {couple.label.toUpperCase()}
            </ThemedText>
            <ThemedText type="small">
              {years(couple.spouseA)} · {years(couple.spouseB)}
            </ThemedText>
            <ThemedText
              type="link"
              onPress={() =>
                router.push({ pathname: '/ancestor/[id]', params: { id: couple.commonAncestor.id } })
              }
            >
              Both descend from {couple.commonAncestor.name} ›
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <ThemedText
                type="link"
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: couple.spouseA.id } })
                }
              >
                {couple.spouseA.name.split(' ')[0]} ›
              </ThemedText>
              <ThemedText
                type="link"
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: couple.spouseB.id } })
                }
              >
                {couple.spouseB.name.split(' ')[0]} ›
              </ThemedText>
            </View>
          </Card>
        ))}
      </ScrollView>
    </ThemedView>
  );
}
