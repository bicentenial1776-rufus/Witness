import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable } from 'react-native';

import { regionRollups, type RegionRollup } from '@witness/core/query';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';

export default function PlacesScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [rollups, setRollups] = useState<RegionRollup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    getGeographyIndex(treeId)
      .then((index) => {
        if (!cancelled) setRollups(regionRollups(index));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  return (
    <ThemedView style={{ flex: 1, padding: 24, paddingTop: 72, gap: 8 }}>
      <Pressable onPress={() => router.back()}>
        <ThemedText type="link">‹ Back</ThemedText>
      </Pressable>
      <ThemedText type="title">Where your family lived</ThemedText>

      {error && <ThemedText>Something went wrong: {error}</ThemedText>}
      {!rollups && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}

      {rollups && (
        <FlatList
          data={rollups}
          keyExtractor={(rollup) => rollup.region}
          style={{ marginTop: 12 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/places/[region]', params: { region: item.region, treeId } })
              }
              style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, marginBottom: 8, gap: 2 }}
            >
              <ThemedText>{item.region}</ThemedText>
              <ThemedText type="small">
                {item.individualCount.toLocaleString()} people · {item.placeCount.toLocaleString()} places
              </ThemedText>
            </Pressable>
          )}
        />
      )}
    </ThemedView>
  );
}
