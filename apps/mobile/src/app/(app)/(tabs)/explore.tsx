import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import {
  HISTORICAL_EVENTS,
  countAliveDuring,
  eventMatchesSearch,
  type HistoricalEvent,
  type ShelfEntry,
} from '@witness/core/history';
import { searchIndex, type GeographyIndex } from '@witness/core/query';

import { useBroadsheet } from '@/components/broadsheet';
import { ExploreBroadsheet, PEOPLE_PAGE, type EraCount } from '@/components/broadsheet/explore-broadsheet';
import { getGeographyIndex } from '@/lib/geography-cache';
import {
  deleteQuestion,
  getSavedQuestions,
  saveQuestion,
  type SavedQuestion,
} from '@/lib/saved-questions';
import { VISITED_MARK, fetchVisitedSet } from '@/lib/visits';

import { Card } from '@/components/card';
import { KinLine } from '@/components/kin-line';
import { usePeopleList } from '@/components/people-list';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
import { getEventLibrary } from '@/lib/event-library';
import { getShelf } from '@/lib/shelf-cache';
import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';
import { WideContent } from '@/constants/theme';

/** With the filter open the page is the wrong unit: load this many matches at once. */
const WIDE_PAGE = 200;

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

/** One row from the search_people RPC: a PersonHit plus the query's total. */
interface SearchPersonRow {
  id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
  place: string | null;
  total: number;
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
  // Betsey's star (2026-08-19): which of these results the reader has
  // already been to. Owned here so both explore variants share one fetch.
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!people.length) {
      setVisitedIds(new Set());
      return;
    }
    let cancelled = false;
    void fetchVisitedSet(people.map((p) => p.id)).then((set) => {
      if (!cancelled) setVisitedIds(set);
    });
    return () => {
      cancelled = true;
    };
  }, [people]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  // True when the hits came from the saved field copy, not the server.
  const [searchFromCopy, setSearchFromCopy] = useState(false);
  const [peoplePage, setPeoplePage] = useState(0);
  const peopleList = usePeopleList({
    listKey: 'explore-search',
    treeId: activeTree?.id,
    rows: people,
    person: (p) => ({ id: p.id, fullName: p.full_name, birthYear: p.birth_year, deathYear: p.death_year }),
  });
  // Search, filter, and order need to see the whole match, not one page
  // of it: while the filter is open or in force, fetch wide and stop paging.
  const wide = peopleList.open || peopleList.active;
  const broadsheet = useBroadsheet();
  const [geoIndex, setGeoIndex] = useState<GeographyIndex | null>(null);
  const [eras, setEras] = useState<EraCount[]>([]);
  // The reader's own questions — on-device only (saved-questions.ts).
  // Asking = save + run through the ordinary search; the list keeps the
  // question for the next visit.
  const [questions, setQuestions] = useState<SavedQuestion[]>([]);
  const [questionDraft, setQuestionDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    getSavedQuestions().then((list) => {
      if (!cancelled) setQuestions(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function askQuestion(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuestionDraft('');
    setSearch(trimmed);
    setQuestions(await saveQuestion(trimmed));
  }

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

  // A new query starts back at the newest page.
  useEffect(() => {
    setPeoplePage(0);
  }, [search, activeTree?.id]);

  // People search, debounced a beat: match on name OR place, in one box.
  // "Benjamin" or "Collins" hits the name; "Worcester" hits anyone with an
  // event recorded there. The search_people RPC owns the union — deduped by
  // person, place-only matches tagged with the place that surfaced them,
  // EVERY match counted — and hands back one page, newest birth year first
  // (undated people close the final pages). The old client-side merge
  // capped name matches at the 20 earliest-born, which silently hid people
  // behind common given names.
  useEffect(() => {
    const q = search.trim();
    if (!q || q.length < 2 || !activeTree) {
      setPeople([]);
      setPeopleTotal(0);
      setSearchFromCopy(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Live search on a short fuse: one bar of LTE hangs, it doesn't fail
      // (SPEC_offline-field-mode.md). On an error or a stall, the saved
      // field copy answers the same question locally.
      const live = supabase
        .rpc('search_people', {
          p_tree_id: activeTree.id,
          p_query: q,
          p_limit: wide ? WIDE_PAGE : PEOPLE_PAGE,
          p_offset: wide ? 0 : peoplePage * PEOPLE_PAGE,
        })
        .returns<SearchPersonRow[]>();
      const result = await Promise.race([
        live,
        new Promise<'stalled'>((resolve) => setTimeout(() => resolve('stalled'), 4000)),
      ]);
      if (cancelled) return;
      if (result !== 'stalled' && !result.error) {
        const rows = result.data ?? [];
        setSearchFromCopy(false);
        setPeopleTotal(rows[0]?.total ?? 0);
        setPeople(rows.map(({ total: _total, place, ...person }) => ({ ...person, place: place ?? undefined })));
        return;
      }
      try {
        const index = await getTreeIndex(activeTree.id);
        if (cancelled) return;
        const page = searchIndex(index, q, wide ? WIDE_PAGE : PEOPLE_PAGE, wide ? 0 : peoplePage * PEOPLE_PAGE);
        setSearchFromCopy(true);
        setPeopleTotal(page.total);
        setPeople(page.hits.map(({ place, ...person }) => ({ ...person, place: place ?? undefined })));
      } catch {
        if (!cancelled) {
          setPeople([]);
          setPeopleTotal(0);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, activeTree?.id, peoplePage, wide]);

  function openEvent(event: HistoricalEvent) {
    if (!activeTree) return;
    router.push({ pathname: '/query/[eventId]', params: { eventId: event.id, treeId: activeTree.id } });
  }

  const searching = search.trim().length > 0;
  const filtered = searching ? events.filter((event) => eventMatchesSearch(event, search)) : [];
  const peoplePageCount = Math.ceil(peopleTotal / PEOPLE_PAGE);
  const peopleFirst = peoplePage * PEOPLE_PAGE + 1;
  const peopleLast = Math.min((peoplePage + 1) * PEOPLE_PAGE, peopleTotal);

  // Broadsheet layout (web ≥900px); phone/native rendering below untouched.
  if (broadsheet && activeTree && geoIndex) {
    return (
      <ExploreBroadsheet
        index={geoIndex}
        shelf={shelf}
        eras={eras}
        treeId={activeTree.id}
        searchPeople={people}
        searchRows={peopleList.rows}
        searchBar={peopleList.bar}
        kin={peopleList.kin}
        searchWide={wide}
        visitedIds={visitedIds}
        searchTotal={peopleTotal}
        searchPage={peoplePage}
        onSearchPage={setPeoplePage}
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
              {/* 1 · The Library — the catalog leads (Explore redesign,
                  2026-08-27: Library, then Ways in, then the shelf). */}
              <ThemedText type="subtitle">The Library</ThemedText>
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

              {/* 2 · Ways in. Archives left this shelf for the Tree tab:
                  Explore wanders, Tree works. Origins, migrations,
                  crossings, and kindred stay collapsed into Patterns
                  (docs/cohesion-design-brief.md). */}
              <ThemedText type="subtitle" style={{ marginTop: 12 }}>
                Ways in
              </ThemedText>
              <Card
                onPress={() => router.push({ pathname: '/places', params: { treeId: activeTree.id } })}
              >
                <ThemedText type="subtitle">Where your family lived</ThemedText>
                <ThemedText type="small">Every state, province, and country in your tree</ThemedText>
              </Card>
              <Card
                onPress={() => router.push({ pathname: '/patterns', params: { treeId: activeTree.id } })}
              >
                <ThemedText type="subtitle">Patterns in your family</ThemedText>
                <ThemedText type="small">
                  Where it began, the moves it made, the oceans it crossed, and the couples who
                  turned out to be kin
                </ThemedText>
              </Card>
              <Card onPress={() => router.push('/synthesis' as never)}>
                <ThemedText type="subtitle">Your whole ancestry, read at once</ThemedText>
                <ThemedText type="small">
                  Every recorded ancestor woven into one essay — it grows as your tree does
                </ThemedText>
              </Card>

              {/* 3 · From your family's history — the shelf (counts already
                  read the fuller picture: documented and probable lives
                  both), plus the reader's own kept questions. */}
              <ThemedText type="subtitle" style={{ marginTop: 12 }}>
                From your family’s history
              </ThemedText>
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

              {/* Your own questions: asked through the ordinary search,
                  kept on this device for the next visit. */}
              <TextField
                placeholder="Keep a question to ask again — search runs on names, places & moments"
                value={questionDraft}
                onChangeText={setQuestionDraft}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => void askQuestion(questionDraft)}
              />
              {questions.length > 0 && (
                <View>
                  <ThemedText type="small" themeColor="textSecondary">
                    Your questions — tap one to ask it again.
                  </ThemedText>
                  {questions.slice(0, 6).map((question) => (
                    <View
                      key={question.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 12,
                        paddingVertical: 6,
                      }}
                    >
                      <Pressable
                        style={{ flexShrink: 1 }}
                        onPress={() => setSearch(question.text)}
                      >
                        <ThemedText type="link">{question.text} ›</ThemedText>
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        accessibilityLabel={`Forget the question: ${question.text}`}
                        onPress={() => {
                          void deleteQuestion(question.id).then(setQuestions);
                        }}
                      >
                        <ThemedText type="small" themeColor="textSecondary">
                          ×
                        </ThemedText>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {searching && peopleTotal > 0 && (
            <>
              <ThemedText type="subtitle">
                {peopleTotal === 1
                  ? '1 person'
                  : `${peopleTotal.toLocaleString()} people — newest first${
                      wide
                        ? peopleTotal > WIDE_PAGE
                          ? `, first ${WIDE_PAGE} loaded for the filter`
                          : ''
                        : peopleTotal > PEOPLE_PAGE
                          ? `, showing ${peopleFirst}–${peopleLast}`
                          : ''
                    }`}
              </ThemedText>
              {searchFromCopy && (
                <ThemedText type="small">
                  From your saved copy — searched without a connection.
                </ThemedText>
              )}
              {peopleList.bar}
              {peopleList.rows.map((person) => (
                <Card
                  key={person.id}
                  onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: person.id } })}
                  style={{ paddingVertical: 12 }}
                >
                  <ThemedText>{person.full_name}</ThemedText>
                  <KinLine kin={peopleList.kin.get(person.id)} />
                  <ThemedText type="small">
                    {person.birth_year ?? '?'}–{person.living ? '' : (person.death_year ?? '?')}
                    {person.living ? ' · living' : ''}
                    {person.place ? ` · ${person.place}` : ''}
                    {visitedIds.has(person.id) ? `  ${VISITED_MARK}` : ''}
                  </ThemedText>
                </Card>
              ))}
              {/* Page through time: forward in the list is backward in the
                  years, so the controls say newer/older, not prev/next. */}
              {peopleTotal > PEOPLE_PAGE && !wide && (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Pressable
                    disabled={peoplePage === 0}
                    onPress={() => setPeoplePage((page) => page - 1)}
                    hitSlop={8}
                    style={{ opacity: peoplePage === 0 ? 0.35 : 1 }}
                  >
                    <ThemedText type="link">‹ Newer</ThemedText>
                  </Pressable>
                  <ThemedText type="small">
                    Page {peoplePage + 1} of {peoplePageCount}
                  </ThemedText>
                  <Pressable
                    disabled={peoplePage >= peoplePageCount - 1}
                    onPress={() => setPeoplePage((page) => page + 1)}
                    hitSlop={8}
                    style={{ opacity: peoplePage >= peoplePageCount - 1 ? 0.35 : 1 }}
                  >
                    <ThemedText type="link">Older ›</ThemedText>
                  </Pressable>
                </View>
              )}
            </>
          )}

          {searching && (
            <ThemedText type="subtitle">
              {`${filtered.length} ${filtered.length === 1 ? 'moment matches' : 'moments match'}`}
            </ThemedText>
          )}
          {searching && people.length === 0 && filtered.length === 0 && (
            <ThemedText type="small">Nothing matches — try a broader word.</ThemedText>
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
