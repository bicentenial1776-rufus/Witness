import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { oceanCrossings, type OceanCrossing } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';

interface CrossingRow extends OceanCrossing {
  ocean: 'Atlantic' | 'Pacific';
}

/**
 * "Which ancestors crossed the ocean?" — every documented change of
 * shore, earliest first, Atlantic and Pacific interleaved by year. A
 * return voyage is its own row; each row opens the voyager.
 */
export default function CrossingsScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [rows, setRows] = useState<CrossingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    getGeographyIndex(treeId)
      .then((index) => {
        if (cancelled) return;
        const merged: CrossingRow[] = [
          ...oceanCrossings(index, 'atlantic').map((c) => ({ ...c, ocean: 'Atlantic' as const })),
          ...oceanCrossings(index, 'pacific').map((c) => ({ ...c, ocean: 'Pacific' as const })),
        ].sort((a, b) => a.to.year - b.to.year);
        // Trees duplicate an ancestor wherever two lines share them; the
        // same human's voyage should read once, not once per line.
        const seen = new Set<string>();
        const distinct = merged.filter((row) => {
          const key = [
            row.individual.full_name,
            row.individual.birth_year,
            row.individual.death_year,
            row.from.country,
            row.to.country,
            row.from.year,
            row.to.year,
          ].join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setRows(distinct);
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
        Every documented change of shore within one lifetime — including the rare return voyage.
      </ThemedText>

      {error && <ThemedText>Something went wrong: {error}</ThemedText>}
      {!rows && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}
      {rows?.length === 0 && (
        <ThemedText type="small" style={{ marginTop: 12 }}>
          No crossings documented yet — an ancestor needs dated events on both shores to appear here.
        </ThemedText>
      )}

      {rows && rows.length > 0 && (
        <FlatList
          data={rows}
          keyExtractor={(row, index) => `${row.individual.id}-${index}`}
          style={{ marginTop: 4 }}
          renderItem={({ item }) => (
            <Card
              onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })}
              style={{ marginBottom: 8 }}
            >
              <ThemedText>{item.individual.full_name}</ThemedText>
              <ThemedText type="small">
                {item.individual.birth_year ?? '?'}–
                {item.individual.living ? '' : (item.individual.death_year ?? '?')}
              </ThemedText>
              <ThemedText type="small">
                {item.from.country} → {item.to.country}
                {item.from.year === item.to.year
                  ? ` · ${item.to.year}`
                  : ` · between ${item.from.year} and ${item.to.year}`}
              </ThemedText>
              <ThemedText type="small">
                {item.ocean}
                {item.direction === 'fromAmericas' ? ' · return voyage' : ''}
              </ThemedText>
            </Card>
          )}
        />
      )}
    </ThemedView>
  );
}
