import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { migrationPaths, type MigrationPath } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';

export default function MigrationsScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [paths, setPaths] = useState<MigrationPath[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    getGeographyIndex(treeId)
      .then((index) => {
        if (!cancelled) setPaths(migrationPaths(index));
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
        Each path is a move your family made within one lifetime, counted across the whole tree.
      </ThemedText>

      {error && <ThemedText>Something went wrong: {error}</ThemedText>}
      {!paths && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}

      {paths && (
        <FlatList
          data={paths.filter((path) => path.count >= 2)}
          keyExtractor={(path) => `${path.from}→${path.to}`}
          style={{ marginTop: 4 }}
          renderItem={({ item }) => (
            <Card
              onPress={() =>
                router.push({
                  pathname: '/migration',
                  params: { treeId, from: item.from, to: item.to },
                })
              }
              style={{ marginBottom: 8 }}
            >
              <ThemedText>
                {item.from} → {item.to}
              </ThemedText>
              <ThemedText type="small">
                {item.count.toLocaleString()} people{item.medianYear ? ` · mostly around ${item.medianYear}` : ''}
              </ThemedText>
              {item.movers[0] && (
                <ThemedText type="small">
                  e.g. {item.movers[0].name}
                  {item.movers[0].toYear ? `, arrived ${item.movers[0].toYear}` : ''}
                </ThemedText>
              )}
            </Card>
          )}
        />
      )}
    </ThemedView>
  );
}
