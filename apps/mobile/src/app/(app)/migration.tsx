import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { migrationPaths, type MigrationPath } from '@witness/core/query';

import { Card } from '@/components/card';
import { KinReveal } from '@/components/kin-reveal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';
import { getKinMap, type Kin } from '@/lib/relationship-cache';

export default function MigrationScreen() {
  const { treeId, from, to } = useLocalSearchParams<{ treeId: string; from: string; to: string }>();
  const [path, setPath] = useState<MigrationPath | null | undefined>(undefined);
  const [relationships, setRelationships] = useState<Map<string, Kin>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId || !from || !to) return;
    let cancelled = false;
    getGeographyIndex(treeId)
      .then((index) => {
        if (cancelled) return;
        setPath(migrationPaths(index).find((p) => p.from === from && p.to === to) ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    getKinMap(treeId).then((map) => {
      if (!cancelled) setRelationships(map);
    });
    return () => {
      cancelled = true;
    };
  }, [treeId, from, to]);

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
            data={path.movers}
            keyExtractor={(mover, index) => `${mover.individualId}-${index}`}
            style={{ marginTop: 12 }}
            renderItem={({ item }) => (
              <Card
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: item.individualId } })
                }
                style={{ marginBottom: 8 }}
              >
                <ThemedText>{item.name}</ThemedText>
                {relationships.has(item.individualId) && (
                  <KinReveal
                    tier={relationships.get(item.individualId)!.tier}
                    label={relationships.get(item.individualId)!.label}
                  />
                )}
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
