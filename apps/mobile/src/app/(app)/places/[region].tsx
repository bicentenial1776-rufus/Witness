import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { ancestorsInRegion, eventTypeLabel, type RegionResident } from '@witness/core/query';

import { Card } from '@/components/card';
import { KinLine } from '@/components/kin-line';
import { usePeopleList } from '@/components/people-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';

function lifeSpan(resident: RegionResident): string {
  const { birth_year, death_year } = resident.individual;
  return `${birth_year ?? '?'}–${death_year ?? '?'}`;
}

function connection(resident: RegionResident): string {
  return resident.events
    .slice(0, 3)
    .map((event) => `${eventTypeLabel(event.eventType)}${event.year ? ` ${event.year}` : ''} · ${event.placeRaw.split(',')[0]}`)
    .join('\n');
}

export default function RegionScreen() {
  const { region, treeId } = useLocalSearchParams<{ region: string; treeId: string }>();
  const [residents, setResidents] = useState<RegionResident[] | null>(null);
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
    return () => {
      cancelled = true;
    };
  }, [treeId, region]);

  const list = usePeopleList({ listKey: 'region', treeId, rows: residents, person: (r) => ({ id: r.individual.id, fullName: r.individual.full_name, birthYear: r.individual.birth_year, deathYear: r.individual.death_year }) });

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
            data={list.rows}
            keyExtractor={(resident) => resident.individual.id}
            style={{ marginTop: 12 }}
            ListHeaderComponent={list.bar}
            renderItem={({ item }) => (
              <Card
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })
                }
                style={{ marginBottom: 8 }}
              >
                <ThemedText>{item.individual.full_name}</ThemedText>
                <KinLine kin={list.kin.get(item.individual.id)} />
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
