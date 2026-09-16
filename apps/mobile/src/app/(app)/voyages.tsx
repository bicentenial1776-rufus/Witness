import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { fetchVoyageRoster, type VoyageRoster } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { supabase } from '@/lib/supabase';

/**
 * The ships they came on — every voyage the library places someone of
 * this tree aboard, ships with a confirmed name first. A count here is
 * the reader's own verdicts, never the library's: a name and a year that
 * agree are a question until a human rules (the Crossing card's doctrine).
 * Each row opens the voyage's roster of this tree's people.
 */
export default function VoyagesScreen() {
  const { activeTree } = useActiveTree();
  const { treeId: paramTreeId } = useLocalSearchParams<{ treeId?: string }>();
  const treeId = paramTreeId ?? activeTree?.id;
  const [rows, setRows] = useState<VoyageRoster[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    fetchVoyageRoster(supabase, treeId)
      .then((roster) => {
        if (!cancelled) setRows(roster);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  function countLine(row: VoyageRoster): string {
    const parts: string[] = [];
    if (row.confirmed) parts.push(`${row.confirmed} of yours confirmed aboard`);
    if (row.pending) parts.push(`${row.pending} still a question`);
    return parts.join(' · ');
  }

  return (
    <ThemedView style={{ flex: 1, padding: 24, gap: 8 }}>
      <ThemedText type="small">
        Every ship the shipping lists place someone of yours on. Confirmed means you ruled on the
        record; a question is a name and a year that agree, and nothing more yet.
      </ThemedText>

      {error && <ThemedText>Something went wrong: {error}</ThemedText>}
      {!rows && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}
      {rows?.length === 0 && (
        <ThemedText type="small" style={{ marginTop: 12 }}>
          No ship has anyone of yours aboard yet — names appear here as the shipping lists grow.
        </ThemedText>
      )}

      {rows && rows.length > 0 && (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.voyageId}
          style={{ marginTop: 4 }}
          renderItem={({ item }) => (
            <Card
              onPress={() =>
                router.push({
                  pathname: '/voyage/[voyageId]',
                  params: { voyageId: item.voyageId, treeId },
                })
              }
              style={{ marginBottom: 8 }}
            >
              <ThemedText type="subtitle">
                {item.ship}, {item.arrivalYear}
              </ThemedText>
              <ThemedText type="small">{countLine(item)} ›</ThemedText>
            </Card>
          )}
        />
      )}
    </ThemedView>
  );
}
