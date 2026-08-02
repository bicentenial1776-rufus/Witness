import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import {
  HISTORICAL_EVENTS,
  countAliveDuring,
  eventMatchesSearch,
  type HistoricalEvent,
  type ShelfEntry,
} from '@witness/core/history';
import { fetchNaraCounts, type GeographyIndex, type NaraCounts } from '@witness/core/query';

import { useBroadsheet } from '@/components/broadsheet';
import { ExploreBroadsheet, type EraCount } from '@/components/broadsheet/explore-broadsheet';
import { getGeographyIndex } from '@/lib/geography-cache';

import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
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
  /** Set when the person matched on a place rather than their name —
      shown so it's clear why they surfaced ("· Worcester, Massachusetts"). */
  place?: string;
}

/** An event row with its person + place embedded, for the place search. */
interface PlaceEventRow {
  individuals: {
    id: string;
    full_name: string;
    birth_year: number | null;
    death_year: number | null;
    living: boolean;
  } | null;
  places: { raw: string } | null;
}

function eventYears(event: HistoricalEvent): string {
  return event.startYear === event.endYear
    ? String(event.startYear)
    : `${event.startYear}–${event.endYear}`;
}

/**
 * Explore = the curated shelf (3–5 events scored for this tree, this
 * month), the situation categories (places, migrations, kindred), and
 * general search over people and history. The full event catalog is
 * browsable as the Library's century-grouped "Moments in history"
 * timeline — every row personalized with a live alive-count
 * (docs/QUERY_LIBRARY.md); search here remains the fast path.
 */
export default function ExploreTab() {
  const { activeTree, loadFailed } = useActiveTree();
  const [events, setEvents] = useState<readonly HistoricalEvent[]>(HISTORICAL_EVENTS);
  const [shelf, setShelf] = useState<ShelfEntry[] | null>(null);
  const [shelfFailed, setShelfFailed] = useState(false);
  const [shelfAttempt, setShelfAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [naraCounts, setNaraCounts] = useState<NaraCounts | null>(null);
  const broadsheet = useBroadsheet();
  const [geoIndex, setGeoIndex] = useState<GeographyIndex | null>(null);
  const [eras, setEras] = useState<EraCount[]>([]);

  // Broadsheet data: the geography index powers the self-previewing
  // sections; kindred and era counts fill the rest.
  useEffect(() => {
    if (!broadsheet || !activeTree) return;
    let cancelled = false;
    (async () => {
      const index = await getGeographyIndex(activeTree.id);
      if (cancelled) return;
      setGeoIndex(index);
      const library = await getEventLibrary();
      const majors = library.filter((e) => e.tier === 'major');
      const step = Math.max(1, Math.floor(majors.length / 6));
      const picks = majors.filter((_, i) => i % step === 0).slice(0, 6);
      if (!cancelled) {
        setEras(picks.map((event) => ({ event, aliveCount: countAliveDuring(index, event) })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [broadsheet, activeTree?.id]);

  // Archive counts refresh on every focus: reviews happen deeper in the
  // stack, and a stale "3 to review" badge undercuts the workflow.
  useFocusEffect(
    useCallback(() => {
      if (!activeTree) return;
      let cancelled = false;
      fetchNaraCounts(supabase, activeTree.id)
        .then((counts) => {
          if (!cancelled) setNaraCounts(counts);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [activeTree?.id]),
  );

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

  // People search, debounced a beat: match on name OR place, in one box.
  // "Benjamin" or "Collins" hits the name; "Worcester" hits anyone with an
  // event recorded there. Name matches lead; place-only matches follow,
  // each tagged with the place that surfaced them.
  useEffect(() => {
    const q = search.trim();
    if (!q || q.length < 2 || !activeTree) {
      setPeople([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const treeId = activeTree.id;
      const [nameRes, placeRes] = await Promise.all([
        supabase
          .from('individuals')
          .select('id, full_name, birth_year, death_year, living')
          .eq('tree_id', treeId)
          .ilike('full_name', `%${q}%`)
          .order('birth_year', { ascending: true, nullsFirst: false })
          .limit(20),
        // Every event whose place text matches, with the person embedded;
        // deduped to distinct people client-side (no DISTINCT over a join).
        supabase
          .from('individual_events')
          .select('individuals!inner(id, full_name, birth_year, death_year, living), places!inner(raw)')
          .eq('tree_id', treeId)
          .ilike('places.raw', `%${q}%`)
          .limit(300)
          .returns<PlaceEventRow[]>(),
      ]);
      if (cancelled) return;

      const seen = new Set<string>();
      const merged: PersonHit[] = [];
      for (const person of nameRes.data ?? []) {
        if (!seen.has(person.id)) {
          seen.add(person.id);
          merged.push(person);
        }
      }
      const placeHits: PersonHit[] = [];
      for (const row of placeRes.data ?? []) {
        const person = row.individuals;
        if (person && !seen.has(person.id)) {
          seen.add(person.id);
          placeHits.push({ ...person, place: row.places?.raw ?? undefined });
        }
      }
      placeHits.sort((a, b) => (a.birth_year ?? Infinity) - (b.birth_year ?? Infinity));
      merged.push(...placeHits);
      if (!cancelled) setPeople(merged.slice(0, 25));
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

  // Broadsheet layout (web ≥900px); phone/native rendering below untouched.
  if (broadsheet && activeTree && geoIndex) {
    return (
      <ExploreBroadsheet
        index={geoIndex}
        shelf={shelf}
        eras={eras}
        naraCounts={naraCounts}
        treeId={activeTree.id}
        searchPeople={people}
        searchMoments={filtered.slice(0, 8)}
        search={search}
        onSearch={setSearch}
      />
    );
  }

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <ThemedText type="title">Explore</ThemedText>

      {activeTree ? (
        <>
          <TextField
            placeholder="Search people, places & history — “Elizabeth Dane”, “Worcester”…"
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
              <Card
                onPress={() =>
                  router.push({ pathname: '/archives', params: { treeId: activeTree.id } })
                }
              >
                <ThemedText type="subtitle">In the National Archives</ThemedText>
                <ThemedText type="small">
                  Federal records matched to your ancestors — draft cards, naturalizations, and
                  more, each awaiting your judgment
                </ThemedText>
                {naraCounts && (naraCounts.pending > 0 || naraCounts.confirmed > 0) && (
                  <ThemedText type="smallBold" themeColor="accent">
                    {[
                      naraCounts.pending > 0 ? `${naraCounts.pending} to review` : null,
                      naraCounts.confirmed > 0
                        ? `${naraCounts.confirmed} confirmed`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}{' '}
                    ›
                  </ThemedText>
                )}
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
                {people.length === 25 ? 'First 25 people' : `${people.length} ${people.length === 1 ? 'person' : 'people'}`}
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
                    {person.place ? ` · ${person.place}` : ''}
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
        <ThemedText>{noTreeMessage(loadFailed, 'to start exploring')}</ThemedText>
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
