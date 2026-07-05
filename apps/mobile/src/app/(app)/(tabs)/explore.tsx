import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';

import {
  HISTORICAL_EVENTS,
  eventMatchesSearch,
  fetchHistoricalEvents,
  type HistoricalEvent,
} from '@witness/core/history';

import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { supabase } from '@/lib/supabase';

/**
 * Explore = the analyses (places, migrations, kindred couples) plus the
 * event library. The library comes from the database so new prompt cards
 * arrive without app updates — the search field is how it stays usable
 * as the list grows.
 */
export default function ExploreTab() {
  const { activeTree } = useActiveTree();
  const [events, setEvents] = useState<readonly HistoricalEvent[]>(HISTORICAL_EVENTS);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchHistoricalEvents(supabase).then((list) => {
      if (!cancelled) setEvents(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function openEvent(event: HistoricalEvent) {
    if (!activeTree) return;
    router.push({ pathname: '/query/[eventId]', params: { eventId: event.id, treeId: activeTree.id } });
  }

  const searching = search.trim().length > 0;
  const filtered = events.filter((event) => eventMatchesSearch(event, search));

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <ThemedText type="title">Explore</ThemedText>

      {activeTree ? (
        <>
          <TextField
            placeholder="Search history — “mayflower”, “famine”, “1918”…"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />

          {!searching && (
            <>
              <Card
                onPress={() => router.push({ pathname: '/places', params: { treeId: activeTree.id } })}
              >
                <ThemedText type="subtitle">Where your family lived</ThemedText>
                <ThemedText type="small">Every state, province, and country in your tree</ThemedText>
              </Card>
              <Card
                onPress={() =>
                  router.push({ pathname: '/migrations', params: { treeId: activeTree.id } })
                }
              >
                <ThemedText type="subtitle">Migration paths</ThemedText>
                <ThemedText type="small">The moves your family made, generation by generation</ThemedText>
              </Card>
              <Card
                onPress={() => router.push({ pathname: '/kindred', params: { treeId: activeTree.id } })}
              >
                <ThemedText type="subtitle">Kindred couples</ThemedText>
                <ThemedText type="small">Spouses who shared a grandparent or closer</ThemedText>
              </Card>
            </>
          )}

          <ThemedText type="subtitle" style={{ marginTop: searching ? 0 : 12 }}>
            {searching
              ? `${filtered.length} ${filtered.length === 1 ? 'moment matches' : 'moments match'}`
              : 'Who was alive during…'}
          </ThemedText>
        </>
      ) : (
        <ThemedText>Import a tree to start exploring.</ThemedText>
      )}
    </View>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <FlatList
        data={activeTree ? filtered : []}
        keyExtractor={(event) => event.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24, paddingTop: 72, paddingBottom: 48 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <Card onPress={() => openEvent(item)} style={{ marginBottom: 8 }}>
            <ThemedText>{item.name}</ThemedText>
            <ThemedText type="small">
              {item.startYear === item.endYear ? item.startYear : `${item.startYear}–${item.endYear}`} ·{' '}
              {item.region}
            </ThemedText>
          </Card>
        )}
      />
    </ThemedView>
  );
}
