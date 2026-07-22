import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import {
  HISTORICAL_EVENTS,
  eventMatchesSearch,
  type HistoricalEvent,
  type ShelfEntry,
} from '@witness/core/history';

import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { getEventLibrary } from '@/lib/event-library';
import { getShelf } from '@/lib/shelf-cache';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

interface PersonHit {
  id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

function eventYears(event: HistoricalEvent): string {
  return event.startYear === event.endYear
    ? String(event.startYear)
    : `${event.startYear}–${event.endYear}`;
}

/**
 * Explore = the curated shelf (3–5 events scored for this tree, this
 * month), the situation categories (places, migrations, kindred), and
 * general search over people and history. Deliberately no browsable
 * event catalog — events reach the user through the shelf, ancestor-card
 * tags, and search (docs/QUERY_LIBRARY.md, Implementation Architecture).
 */
export default function ExploreTab() {
  const { activeTree } = useActiveTree();
  const [events, setEvents] = useState<readonly HistoricalEvent[]>(HISTORICAL_EVENTS);
  const [shelf, setShelf] = useState<ShelfEntry[] | null>(null);
  const [shelfFailed, setShelfFailed] = useState(false);
  const [shelfAttempt, setShelfAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<PersonHit[]>([]);

  // The full library backs search only; it is never listed outright.
  useEffect(() => {
    let cancelled = false;
    getEventLibrary().then((list) => {
      if (!cancelled) setEvents(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeTree) {
      setShelf(null);
      return;
    }
    let cancelled = false;
    setShelf(null);
    setShelfFailed(false);
    getShelf(activeTree.id)
      .then((entries) => {
        if (!cancelled) setShelf(entries);
      })
      .catch(() => {
        // A load failure is not an empty tree — say so, and retry on the
        // next focus (the shelf cache never keeps failures).
        if (!cancelled) {
          setShelf([]);
          setShelfFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTree?.id, shelfAttempt]);

  useFocusEffect(
    useCallback(() => {
      if (shelfFailed) setShelfAttempt((attempt) => attempt + 1);
    }, [shelfFailed]),
  );

  // People search: name match in the active tree, debounced a beat.
  useEffect(() => {
    const q = search.trim();
    if (!q || q.length < 2 || !activeTree) {
      setPeople([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('individuals')
        .select('id, full_name, birth_year, death_year, living')
        .eq('tree_id', activeTree.id)
        .ilike('full_name', `%${q}%`)
        .order('birth_year', { ascending: true, nullsFirst: false })
        .limit(20);
      if (!cancelled) setPeople(data ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, activeTree?.id]);

  function openEvent(event: HistoricalEvent) {
    if (!activeTree) return;
    router.push({ pathname: '/query/[eventId]', params: { eventId: event.id, treeId: activeTree.id } });
  }

  const searching = search.trim().length > 0;
  const filtered = searching ? events.filter((event) => eventMatchesSearch(event, search)) : [];

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <ThemedText type="title">Explore</ThemedText>

      {activeTree ? (
        <>
          <TextField
            placeholder="Search people & history — “Elizabeth Dane”, “mayflower”…"
            returnKeyType="search"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />

          {!searching && (
            <>
              <ThemedText type="subtitle">From your family’s history</ThemedText>
              {shelf === null && <ActivityIndicator style={{ marginVertical: 12 }} />}
              {shelf?.length === 0 &&
                (shelfFailed ? (
                  <ThemedText type="small">
                    Couldn’t reach your tree just now — this will retry when you come back.
                  </ThemedText>
                ) : (
                  <ThemedText type="small">
                    Nothing to show yet — import a tree with dated ancestors to see their moments.
                  </ThemedText>
                ))}
              {shelf?.map((entry) => (
                <Card key={entry.event.id} onPress={() => openEvent(entry.event)}>
                  {entry.anniversaryLabel && (
                    <ThemedText type="smallBold" themeColor="accent">
                      {entry.anniversaryLabel.toUpperCase()}
                    </ThemedText>
                  )}
                  <ThemedText type="subtitle">{entry.event.name}</ThemedText>
                  <ThemedText type="small">
                    {eventYears(entry.event)} · {entry.event.region}
                  </ThemedText>
                  <ThemedText type="small">{entry.event.summary}</ThemedText>
                  <ThemedText type="smallBold">
                    {entry.aliveCount.toLocaleString()} of your ancestors were alive ›
                  </ThemedText>
                </Card>
              ))}

              <ThemedText type="subtitle" style={{ marginTop: 12 }}>
                The Library
              </ThemedText>
              <Card onPress={() => router.push('/library')}>
                <ThemedText type="subtitle">Every question, with your answers</ThemedText>
                <ThemedText type="small">
                  Lives in wartime, the world&rsquo;s great events, long lives &amp; short, where
                  they lived — each question counted against your own tree.
                </ThemedText>
                <ThemedText type="smallBold" themeColor="accent">
                  Browse the Library ›
                </ThemedText>
              </Card>

              <ThemedText type="subtitle" style={{ marginTop: 12 }}>
                Ways in
              </ThemedText>
              <Card onPress={() => router.push('/ascent')}>
                <ThemedText type="subtitle">The Ascent</ThemedText>
                <ThemedText type="small">Climb your tree generation by generation — and see where the records thin</ThemedText>
              </Card>
              <Card
                onPress={() => router.push({ pathname: '/places', params: { treeId: activeTree.id } })}
              >
                <ThemedText type="subtitle">Where your family lived</ThemedText>
                <ThemedText type="small">Every state, province, and country in your tree</ThemedText>
              </Card>
              <Card
                onPress={() => router.push({ pathname: '/origins', params: { treeId: activeTree.id } })}
              >
                <ThemedText type="subtitle">Where your family began</ThemedText>
                <ThemedText type="small">The earliest places your tree reaches back to</ThemedText>
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
                onPress={() =>
                  router.push({ pathname: '/crossings', params: { treeId: activeTree.id } })
                }
              >
                <ThemedText type="subtitle">Ocean crossings</ThemedText>
                <ThemedText type="small">Ancestors who crossed the Atlantic or Pacific</ThemedText>
              </Card>
              <Card
                onPress={() => router.push({ pathname: '/kindred', params: { treeId: activeTree.id } })}
              >
                <ThemedText type="subtitle">Kindred couples</ThemedText>
                <ThemedText type="small">Spouses who shared an ancestor — however far back</ThemedText>
              </Card>
            </>
          )}

          {searching && people.length > 0 && (
            <>
              <ThemedText type="subtitle">
                {people.length === 20 ? 'First 20 people' : `${people.length} ${people.length === 1 ? 'person' : 'people'}`}
              </ThemedText>
              {people.map((person) => (
                <Card
                  key={person.id}
                  onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: person.id } })}
                  style={{ paddingVertical: 12 }}
                >
                  <ThemedText>{person.full_name}</ThemedText>
                  <ThemedText type="small">
                    {person.birth_year ?? '?'}–{person.living ? '' : (person.death_year ?? '?')}
                    {person.living ? ' · living' : ''}
                  </ThemedText>
                </Card>
              ))}
            </>
          )}

          {searching && (
            <ThemedText type="subtitle">
              {`${filtered.length} ${filtered.length === 1 ? 'moment matches' : 'moments match'}`}
            </ThemedText>
          )}
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
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ ...WideContent, padding: 24, paddingTop: 72, paddingBottom: 48 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <Card onPress={() => openEvent(item)} style={{ marginBottom: 8 }}>
            <ThemedText>{item.name}</ThemedText>
            <ThemedText type="small">
              {eventYears(item)} · {item.region}
            </ThemedText>
          </Card>
        )}
      />
    </ThemedView>
  );
}
