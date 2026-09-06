import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { migrationPaths, type GeographyIndex, type MigrationPath } from '@witness/core/query';

import { Card } from '@/components/card';
import { KinLine, KinName } from '@/components/kin-line';
import { usePeopleList } from '@/components/people-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';

export default function MigrationScreen() {
  const { treeId, from, to } = useLocalSearchParams<{ treeId: string; from: string; to: string }>();
  const [path, setPath] = useState<MigrationPath | null | undefined>(undefined);
  const [index, setIndex] = useState<GeographyIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId || !from || !to) return;
    let cancelled = false;
    getGeographyIndex(treeId)
      .then((index) => {
        if (cancelled) return;
        setIndex(index);
        setPath(migrationPaths(index).find((p) => p.from === from && p.to === to) ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [treeId, from, to]);

  const list = usePeopleList({
    listKey: 'migration',
    treeId,
    rows: path?.movers,
    person: (m) => {
      const who = index?.individuals.get(m.individualId);
      return { id: m.individualId, fullName: m.name, birthYear: who?.birth_year ?? null, deathYear: who?.death_year ?? null };
    },
  });

  return (
    <ThemedView style={{ flex: 1, padding: 24, gap: 8 }}>
      <Stack.Screen options={{ title: `${from} → ${to}` }} />

      {error && <ThemedText>Something went wrong: {error}</ThemedText>}
      {path === undefined && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}
      {path === null && <ThemedText>This path is no longer in the tree.</ThemedText>}

      {path && (
        <>
          <ThemedText type="subtitle">
            {path.count.toLocaleString()} {path.count === 1 ? 'person' : 'people'} made this move
            {path.medianYear ? `, mostly around ${path.medianYear}` : ''}
          </ThemedText>
          <FlatList
            data={list.rows}
            keyExtractor={(mover, i) => `${mover.individualId}-${i}`}
            style={{ marginTop: 12 }}
            ListHeaderComponent={list.bar}
            renderItem={({ item }) => (
              <Card
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: item.individualId } })
                }
                style={{ marginBottom: 8 }}
              >
                <KinName kin={list.kin.get(item.individualId)}><ThemedText>{item.name}</ThemedText></KinName>
                <KinLine kin={list.kin.get(item.individualId)} />
                <ThemedText type="small">
                  {item.fromYear ? `last seen in ${from} ${item.fromYear}` : from}
                  {' · '}
                  {item.toYear ? `in ${to} by ${item.toYear}` : to}
                </ThemedText>
              </Card>
            )}
          />
        </>
      )}
    </ThemedView>
  );
}
