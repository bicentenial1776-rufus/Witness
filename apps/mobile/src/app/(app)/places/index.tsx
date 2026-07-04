import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { regionRollups, type RegionRollup } from '@witness/core/query';

import { Card } from '@/components/card';
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
    <ThemedView style={{ flex: 1, padding: 24, gap: 8 }}>
      {error && <ThemedText>Something went wrong: {error}</ThemedText>}
      {!rollups && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}

      {rollups && (
        <FlatList
          data={rollups}
          keyExtractor={(rollup) => rollup.region}
          style={{ marginTop: 4 }}
          renderItem={({ item }) => (
            <Card
              onPress={() =>
                router.push({ pathname: '/places/[region]', params: { region: item.region, treeId } })
              }
              style={{ marginBottom: 8 }}
            >
              <ThemedText>{item.region}</ThemedText>
              <ThemedText type="small">
                {item.individualCount.toLocaleString()} people · {item.placeCount.toLocaleString()} places
              </ThemedText>
            </Card>
          )}
        />
      )}
    </ThemedView>
  );
}
