import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { ancestorsInRegion, type RegionResident } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';
import { getRelationshipMap } from '@/lib/relationship-cache';

function lifeSpan(resident: RegionResident): string {
  const { birth_year, death_year } = resident.individual;
  return `${birth_year ?? '?'}–${death_year ?? '?'}`;
}

function connection(resident: RegionResident): string {
  return resident.events
    .slice(0, 3)
    .map((event) => `${event.eventType}${event.year ? ` ${event.year}` : ''} · ${event.placeRaw.split(',')[0]}`)
    .join('\n');
}

export default function RegionScreen() {
  const { region, treeId } = useLocalSearchParams<{ region: string; treeId: string }>();
  const [residents, setResidents] = useState<RegionResident[] | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId || !region) return;
    let cancelled = false;
    getGeographyIndex(treeId)
      .then((index) => {
        if (!cancelled) setResidents(ancestorsInRegion(index, region));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    getRelationshipMap(treeId).then((map) => {
      if (!cancelled) setRelationships(map);
    });
    return () => {
      cancelled = true;
    };
  }, [treeId, region]);

  return (
    <ThemedView style={{ flex: 1, padding: 24, gap: 8 }}>
      <Stack.Screen options={{ title: region ?? '' }} />

      {error && <ThemedText>Something went wrong: {error}</ThemedText>}
      {!residents && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}

      {residents && (
        <>
          <ThemedText type="subtitle">
            {residents.length.toLocaleString()} people in your family lived here
          </ThemedText>
          <FlatList
            data={residents}
            keyExtractor={(resident) => resident.individual.id}
            style={{ marginTop: 12 }}
            renderItem={({ item }) => (
              <Card
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })
                }
                style={{ marginBottom: 8 }}
              >
                <ThemedText>{item.individual.full_name}</ThemedText>
                {relationships.has(item.individual.id) && (
                  <ThemedText type="small">your {relationships.get(item.individual.id)}</ThemedText>
                )}
                <ThemedText type="small">{lifeSpan(item)}</ThemedText>
                <ThemedText type="small">{connection(item)}</ThemedText>
              </Card>
            )}
          />
        </>
      )}
    </ThemedView>
  );
}
