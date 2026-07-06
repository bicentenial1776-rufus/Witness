import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { familyOrigins, type RegionOrigin } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';

/**
 * "Where did my family originate?" — the earliest dated event per
 * region, oldest first. Each card names the ancestor who first places
 * the family there and opens that ancestor, feeding the flywheel back
 * into tags and results.
 */
export default function OriginsScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [origins, setOrigins] = useState<RegionOrigin[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    getGeographyIndex(treeId)
      .then((index) => {
        if (!cancelled) setOrigins(familyOrigins(index, 12));
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
      <ThemedText type="small">
        The earliest your tree reaches back into each region — and the first ancestor documented there.
      </ThemedText>

      {error && <ThemedText>Something went wrong: {error}</ThemedText>}
      {!origins && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}
      {origins?.length === 0 && (
        <ThemedText type="small" style={{ marginTop: 12 }}>
          No dated places yet — events need both a year and a place to trace origins.
        </ThemedText>
      )}

      {origins && (
        <FlatList
          data={origins}
          keyExtractor={(origin) => origin.region}
          style={{ marginTop: 4 }}
          renderItem={({ item }) => (
            <Card
              onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })}
              style={{ marginBottom: 8 }}
            >
              <ThemedText type="subtitle">{item.region}</ThemedText>
              <ThemedText type="small">
                since {item.earliestYear} · {item.individualCount.toLocaleString()}{' '}
                {item.individualCount === 1 ? 'person' : 'people'} over time
              </ThemedText>
              <ThemedText type="small">
                First: {item.individual.full_name} — {item.placeRaw} ›
              </ThemedText>
            </Card>
          )}
        />
      )}
    </ThemedView>
  );
}
