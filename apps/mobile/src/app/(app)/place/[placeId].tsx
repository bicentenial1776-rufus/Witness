import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { ancestorsAtPlace, type GeographyIndex, type RegionResident } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';
import { getRelationshipMap } from '@/lib/relationship-cache';

export default function PlaceScreen() {
  const { placeId, treeId } = useLocalSearchParams<{ placeId: string; treeId: string }>();
  const [index, setIndex] = useState<GeographyIndex | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    getGeographyIndex(treeId).then((i) => {
      if (!cancelled) setIndex(i);
    });
    getRelationshipMap(treeId).then((map) => {
      if (!cancelled) setRelationships(map);
    });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const place = index && placeId ? index.places.get(placeId) : undefined;
  const residents: RegionResident[] = index && placeId ? ancestorsAtPlace(index, placeId) : [];

  return (
    <ThemedView style={{ flex: 1, padding: 24, gap: 8 }}>
      <Stack.Screen options={{ title: place ? (place.parts[0] ?? place.raw) : '' }} />
      {!index ? (
        <ActivityIndicator style={{ marginVertical: 24 }} />
      ) : !place ? (
        <ThemedText>Place not found.</ThemedText>
      ) : (
        <>
          <ThemedText type="small">{place.raw}</ThemedText>
          <ThemedText type="subtitle">
            {residents.length.toLocaleString()} people in your family have events here
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
                <ThemedText type="small">
                  {item.events
                    .map((e) => `${e.eventType}${e.year ? ` ${e.year}` : ''}`)
                    .join(' · ')}
                </ThemedText>
              </Card>
            )}
          />
        </>
      )}
    </ThemedView>
  );
}
