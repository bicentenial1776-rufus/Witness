import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { voyageExplainer } from '@witness/core/history';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

/**
 * One voyage, your people (Rufus, 2026-09-02: the ship identification
 * "begs the question of who these people are"). Everyone in THIS tree
 * the reader has confirmed aboard leads the page; candidates still
 * awaiting a verdict follow, each row opening the person. The library's
 * full passenger list stays server-side — this window is the tree's own
 * roster, not the ship's.
 */

interface RosterRow {
  id: string;
  status: 'pending' | 'confirmed';
  individualId: string;
  passengerName: string;
  fullName: string;
  birthYear: number | null;
  deathYear: number | null;
  ship: string;
  arrivalYear: number;
  departurePort: string | null;
  arrivalPlace: string | null;
  source: string;
}

export default function VoyageScreen() {
  const { voyageId, treeId } = useLocalSearchParams<{ voyageId: string; treeId: string }>();
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!voyageId || !treeId) {
      // A deep link without its treeId would otherwise spin forever.
      setError('This voyage link is missing its tree — open it from a Portrait.');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: fetchError } = await supabase
        .from('passenger_candidates')
        .select(
          'id, status, individual_id, passenger_name, ship, arrival_year, departure_port, arrival_place, source, individuals (full_name, birth_year, death_year)',
        )
        .eq('tree_id', treeId)
        .eq('voyage_id', voyageId)
        .neq('status', 'dismissed');
      if (cancelled) return;
      if (fetchError) {
        setError('The roster could not load. Try again shortly.');
        return;
      }
      const mapped = (data ?? []).map((row) => {
        const person = row.individuals as unknown as {
          full_name: string;
          birth_year: number | null;
          death_year: number | null;
        } | null;
        return {
          id: row.id as string,
          status: row.status as 'pending' | 'confirmed',
          individualId: row.individual_id as string,
          passengerName: row.passenger_name as string,
          fullName: person?.full_name ?? (row.passenger_name as string),
          birthYear: person?.birth_year ?? null,
          deathYear: person?.death_year ?? null,
          ship: row.ship as string,
          arrivalYear: row.arrival_year as number,
          departurePort: row.departure_port as string | null,
          arrivalPlace: row.arrival_place as string | null,
          source: row.source as string,
        };
      });
      // Confirmed first — the reader's settled roster — then the waiting.
      mapped.sort((a, b) =>
        a.status === b.status ? a.fullName.localeCompare(b.fullName) : a.status === 'confirmed' ? -1 : 1,
      );
      setRows(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [voyageId, treeId]);

  const first = rows?.[0];
  const confirmed = rows?.filter((r) => r.status === 'confirmed') ?? [];
  const pending = rows?.filter((r) => r.status === 'pending') ?? [];

  return (
    <ThemedView style={{ flex: 1 }}>
      {rows === null && !error ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 8 }}
          data={rows ?? []}
          keyExtractor={(row) => row.id}
          ListHeaderComponent={
            <View style={{ gap: 8, marginBottom: 8 }}>
              <ThemedText type="title">
                {first ? `The ${first.ship}, ${first.arrivalYear}` : 'This voyage'}
              </ThemedText>
              {first && (
                <ThemedText type="small" themeColor="textSecondary">
                  {voyageExplainer({
                    voyageId: voyageId!,
                    ship: first.ship,
                    arrivalYear: first.arrivalYear,
                    departurePort: first.departurePort,
                    arrivalPlace: first.arrivalPlace,
                    source: first.source,
                  })}
                </ThemedText>
              )}
              {error && <ThemedText type="small">{error}</ThemedText>}
              {confirmed.length > 0 && (
                <ThemedText type="subtitle" style={{ marginTop: 8 }}>
                  Your people aboard — {confirmed.length} confirmed
                </ThemedText>
              )}
              {confirmed.length === 0 && rows !== null && !error && (
                <ThemedText type="small" style={{ marginTop: 8 }}>
                  No one is confirmed aboard yet
                  {pending.length > 0
                    ? ` — ${pending.length} candidate${pending.length === 1 ? '' : 's'} below await your verdict.`
                    : '.'}
                </ThemedText>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <>
              {item.status === 'pending' &&
                (index === 0 || rows![index - 1]!.status === 'confirmed') && (
                  <ThemedText type="subtitle" style={{ marginTop: 12, marginBottom: 4 }}>
                    Awaiting your verdict — {pending.length}
                  </ThemedText>
                )}
              <Card
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: item.individualId, tab: 'sources' } })
                }
              >
                <ThemedText type="smallBold">
                  {item.status === 'confirmed' ? '⛵ ' : ''}
                  {item.fullName}
                </ThemedText>
                <ThemedText type="small">
                  {`${item.birthYear ?? '?'}–${item.deathYear ?? '?'}`}
                  {item.passengerName.toLowerCase() !== item.fullName.toLowerCase()
                    ? ` · recorded as ${item.passengerName}`
                    : ''}
                </ThemedText>
              </Card>
            </>
          )}
          ListEmptyComponent={
            error ? null : (
              <ThemedText type="small">
                No candidates from this tree touch this voyage yet.
              </ThemedText>
            )
          }
        />
      )}
    </ThemedView>
  );
}
