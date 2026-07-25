import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, View } from 'react-native';

import { getRelationship } from '@witness/core/family';
import {
  rankLivedThroughEvents,
  regionsFromPlaceParts,
  type LivedThroughTag,
} from '@witness/core/history';
import { fetchNaraCandidatesForIndividual, type NaraCandidate } from '@witness/core/query';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { NaraCandidateCard } from '@/components/nara-candidate-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import * as Clipboard from 'expo-clipboard';

import { ancestryPersonUrl } from '@/lib/ancestry';
import { getEventLibrary } from '@/lib/event-library';
import { createAncestorShareLink } from '@/lib/share-links';
import { getRelationshipMap } from '@/lib/relationship-cache';
import { invokeError, openResearchBrief as fetchOrCreateResearchBrief } from '@/lib/research-brief';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

interface Person {
  id: string;
  tree_id: string;
  full_name: string;
  sex: 'M' | 'F' | 'U';
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
  gedcom_xref: string;
}

interface EventRow {
  event_type: string;
  date_year: number | null;
  date_raw: string | null;
  places: { raw: string; parts: string[] } | null;
}

interface ParentRow {
  id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
}

interface CitationRow {
  fact: string;
  page: string | null;
  text_excerpt: string | null;
  url: string | null;
  sources: { title: string | null } | null;
}

interface SourceGroup {
  title: string;
  facts: string[];
  /** Excerpts of what the records actually say, deduped. */
  excerpts: string[];
  url: string | null;
}

/**
 * Citations grouped per source, reading order: the source cited for the
 * most facts first. Facts keep one mention each; excerpts dedupe (the
 * same census line often backs several facts).
 */
/**
 * External links (Ancestry, source URLs) open in a NEW tab on web: a
 * same-tab navigation unloads the SPA, so the browser's Back button
 * cold-reloads Witness onto Home and loses the user's place. A new tab
 * keeps this page alive — returning is a tab switch, not a restart.
 */
function openExternal(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener');
  } else {
    Linking.openURL(url);
  }
}

function groupCitations(rows: CitationRow[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const row of rows) {
    const title = row.sources?.title ?? 'Untitled source';
    if (!groups.has(title)) groups.set(title, { title, facts: [], excerpts: [], url: null });
    const group = groups.get(title)!;
    if (!group.facts.includes(row.fact)) group.facts.push(row.fact);
    if (row.text_excerpt && !group.excerpts.includes(row.text_excerpt)) {
      group.excerpts.push(row.text_excerpt);
    }
    if (!group.url && row.url) group.url = row.url;
  }
  return [...groups.values()].sort(
    (a, b) => b.facts.length - a.facts.length || a.title.localeCompare(b.title),
  );
}

type SectionState =
  | { name: 'none' }
  | { name: 'generating' }
  | { name: 'ready'; text: string }
  | { name: 'error'; message: string };

/** One AI-enriched text section backed by a cache row + Edge Function. */
function useEnrichment(
  individualId: string | undefined,
  enrichmentType: 'biography' | 'historical_context',
  fn: string,
  key: string,
) {
  const [state, setState] = useState<SectionState>({ name: 'none' });

  useEffect(() => {
    if (!individualId) return;
    let cancelled = false;
    setState({ name: 'none' });
    supabase
      .from('enrichment_cache')
      .select('content')
      .eq('individual_id', individualId)
      .eq('enrichment_type', enrichmentType)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setState({ name: 'ready', text: data.content });
      });
    return () => {
      cancelled = true;
    };
  }, [individualId, enrichmentType]);

  const generate = useCallback(async () => {
    setState({ name: 'generating' });
    const { data, error } = await supabase.functions.invoke(fn, {
      body: { individualId },
    });
    if (error) setState({ name: 'error', message: await invokeError(error) });
    else setState({ name: 'ready', text: data[key] });
  }, [individualId, fn, key]);

  return { state, generate };
}

function EnrichmentBody({
  buttonTitle,
  generatingLabel,
  state,
  onGenerate,
}: {
  buttonTitle: string;
  generatingLabel: string;
  state: SectionState;
  onGenerate: () => void;
}) {
  if (state.name === 'ready') return <ThemedText>{state.text}</ThemedText>;
  if (state.name === 'generating') {
    return (
      <View style={{ gap: 8, marginVertical: 8 }}>
        <ActivityIndicator />
        <ThemedText type="small">{generatingLabel}</ThemedText>
      </View>
    );
  }
  return (
    <>
      {state.name === 'error' && <ThemedText>{state.message}</ThemedText>}
      <Button title={buttonTitle} onPress={onGenerate} />
    </>
  );
}

type SectionTab = 'story' | 'world' | 'research';

const TABS: { key: SectionTab; label: string }[] = [
  { key: 'story', label: 'Their story' },
  { key: 'world', label: 'Their world' },
  { key: 'research', label: 'Research' },
];

/** The record as a lifeline: amber moments on one vertical thread. */
function Lifeline({ events }: { events: EventRow[] }) {
  const theme = useTheme();
  return (
    <View>
      {events.map((event, index) => (
        <View key={index} style={{ flexDirection: 'row' }}>
          <View style={{ width: 20, alignItems: 'center' }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: theme.accent,
                marginTop: 7,
              }}
            />
            {index < events.length - 1 && (
              <View style={{ width: 2, flex: 1, backgroundColor: theme.border }} />
            )}
          </View>
          <View style={{ flex: 1, paddingLeft: 10, paddingBottom: index < events.length - 1 ? 20 : 0 }}>
            <ThemedText>
              {event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}
              {event.date_raw ? ` · ${event.date_raw}` : event.date_year ? ` · ${event.date_year}` : ''}
            </ThemedText>
            {event.places?.raw && <ThemedText type="small">{event.places.raw}</ThemedText>}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function AncestorScreen({ personId }: { personId?: string } = {}) {
  // Normally a route screen; Tree Health embeds it as the right-hand
  // detail pane by passing personId directly.
  const params = useLocalSearchParams<{ id: string }>();
  const id = personId ?? params.id;
  const theme = useTheme();
  const [person, setPerson] = useState<Person | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [tags, setTags] = useState<LivedThroughTag[]>([]);
  const [sources, setSources] = useState<SourceGroup[]>([]);
  const [naraCandidates, setNaraCandidates] = useState<NaraCandidate[]>([]);
  const [relationship, setRelationship] = useState<string | null>(null);
  const [ancestryUrl, setAncestryUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<SectionTab>('story');
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'copied'>('idle');

  const biography = useEnrichment(id, 'biography', 'generate-biography', 'biography');
  const worldContext = useEnrichment(id, 'historical_context', 'generate-historical-context', 'context');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setPerson(null);
    setEvents([]);
    setParents([]);
    setTags([]);
    setSources([]);
    setNaraCandidates([]);
    setRelationship(null);
    setAncestryUrl(null);
    setTab('story');
    (async () => {
      const [{ data: personRow }, { data: eventRows }] = await Promise.all([
        supabase
          .from('individuals')
          .select('id, tree_id, full_name, sex, birth_year, death_year, living, gedcom_xref')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('individual_events')
          .select('event_type, date_year, date_raw, places(raw, parts)')
          .eq('individual_id', id)
          .order('date_year', { ascending: true })
          .returns<EventRow[]>(),
      ]);
      if (cancelled) return;
      setPerson(personRow);
      setEvents(eventRows ?? []);

      // The Ancestry deep link needs the tree's Ancestry id alongside this
      // person's xref; both absent for non-Ancestry trees, hiding the link.
      if (personRow) {
        supabase
          .from('trees')
          .select('ancestry_tree_id')
          .eq('id', personRow.tree_id)
          .single()
          .then(({ data }) => {
            if (!cancelled && data) {
              setAncestryUrl(ancestryPersonUrl(data.ancestry_tree_id, personRow.gedcom_xref));
            }
          });
      }

      // "Lived through" tags: the 5 events that best frame this life,
      // ranked by tier and boosted by this person's own geography — all
      // from data this screen already has, plus the cached event library.
      if (personRow) {
        const regions = regionsFromPlaceParts(eventRows ?? []);
        getEventLibrary().then((library) => {
          if (!cancelled) setTags(rankLivedThroughEvents(personRow, library, regions));
        });
      }

      // Sources: every citation naming this person, grouped per source.
      // Trees imported before the citations migration simply have none;
      // a database that predates the table errors and the section hides.
      supabase
        .from('citations')
        .select('fact, page, text_excerpt, url, sources(title)')
        .eq('individual_id', id)
        .returns<CitationRow[]>()
        .then(({ data }) => {
          if (!cancelled && data) setSources(groupCitations(data));
        });

      // National Archives candidates for this person (pending asks +
      // confirmed documents). Hidden while empty; enrichment is gradual.
      fetchNaraCandidatesForIndividual(supabase, id)
        .then((rows) => {
          if (!cancelled) setNaraCandidates(rows.filter((c) => c.status !== 'dismissed'));
        })
        .catch(() => {});

      // Parents: the families this person is a child of, then both spouses.
      const { data: childLinks } = await supabase
        .from('family_children')
        .select('family_id')
        .eq('individual_id', id);
      const familyIds = (childLinks ?? []).map((l) => l.family_id);
      if (familyIds.length && !cancelled) {
        const { data: families } = await supabase
          .from('families')
          .select('husband_id, wife_id')
          .in('id', familyIds);
        const parentIds = [
          ...new Set((families ?? []).flatMap((f) => [f.husband_id, f.wife_id])),
        ].filter((pid): pid is string => Boolean(pid) && pid !== id);
        if (parentIds.length) {
          const { data: parentRows } = await supabase
            .from('individuals')
            .select('id, full_name, birth_year, death_year')
            .in('id', parentIds);
          if (!cancelled) setParents(parentRows ?? []);
        }
      }

      // Relationship to the home person: instant from the ancestor cache,
      // otherwise a live graph walk (cousins, descendants, in-laws).
      if (personRow) {
        const cached = (await getRelationshipMap(personRow.tree_id)).get(personRow.id);
        if (cached) {
          if (!cancelled) setRelationship(cached);
        } else {
          const { data: tree } = await supabase
            .from('trees')
            .select('home_person_id')
            .eq('id', personRow.tree_id)
            .single();
          if (tree?.home_person_id && tree.home_person_id !== personRow.id) {
            const live = await getRelationship(supabase, personRow.tree_id, tree.home_person_id, personRow.id);
            if (!cancelled && live.confidence !== 'none') setRelationship(live.label);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Tab selection initiates the section's action directly — no second tap.
  function selectTab(next: SectionTab) {
    setTab(next);
    if (next === 'world' && worldContext.state.name === 'none') worldContext.generate();
    if (next === 'research' && !briefBusy) openResearchBrief();
  }

  // Share a snapshot card of this ancestor: 90-day tokenized link on the
  // clipboard. Never offered for the living (the button renders inside the
  // non-living branch below).
  async function shareAncestor() {
    if (!person || shareState === 'busy') return;
    setShareState('busy');
    try {
      const lines = [
        ...events
          .slice(0, 2)
          .map(
            (e) =>
              `${e.event_type.charAt(0).toUpperCase() + e.event_type.slice(1)}${
                e.date_year ? ` ${e.date_year}` : ''
              }${e.places?.raw ? ` · ${e.places.raw}` : ''}`,
          ),
        ...(tags[0] ? [`Lived through ${tags[0].event.name}`] : []),
      ];
      const url = await createAncestorShareLink(person, lines);
      await Clipboard.setStringAsync(url);
      setShareState('copied');
    } catch (error) {
      console.warn('Share failed', error);
      setShareState('idle');
    }
  }

  async function openResearchBrief() {
    setBriefBusy(true);
    setBriefError(null);
    const error = await fetchOrCreateResearchBrief(id);
    setBriefBusy(false);
    if (error) setBriefError(error);
  }

  if (!person) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 8 }}>
        <ThemedText type="title">{person.full_name}</ThemedText>
        {relationship && (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/relationship/[individualId]', params: { individualId: person.id } })
            }
          >
            <ThemedText type="subtitle">
              Your {relationship} <ThemedText type="link">›</ThemedText>
            </ThemedText>
          </Pressable>
        )}
        <ThemedText type="small">
          {person.birth_year ?? '?'}–{person.living ? '' : (person.death_year ?? '?')}
          {person.living ? ' · living' : ''}
        </ThemedText>

        {/* The two ways this person travels: a public story card, and their
            page on the platform the tree came from. Up top by request —
            sharing shouldn't live below six screens of record. */}
        {(!person.living || ancestryUrl) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 4 }}>
            {!person.living && (
              <ThemedText
                type="link"
                onPress={shareState === 'busy' ? undefined : shareAncestor}
              >
                {shareState === 'copied'
                  ? 'Link copied — good for 90 days ✓'
                  : shareState === 'busy'
                    ? 'Creating link…'
                    : `Share ${person.full_name.split(' ')[0]}’s story ›`}
              </ThemedText>
            )}
            {ancestryUrl && (
              <ThemedText type="link" onPress={() => openExternal(ancestryUrl)}>
                View on Ancestry ›
              </ThemedText>
            )}
          </View>
        )}

        {tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {tags.map((tag) => (
              <Pressable
                key={tag.event.id}
                onPress={() =>
                  router.push({
                    pathname: '/query/[eventId]',
                    params: { eventId: tag.event.id, treeId: person.tree_id, pin: person.id },
                  })
                }
                style={{
                  backgroundColor: theme.backgroundElement,
                  borderWidth: 1,
                  borderColor: theme.accent,
                  borderRadius: 14,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <ThemedText type="small" themeColor="accent" style={{ fontWeight: 600 }}>
                  {tag.event.name}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        {parents.length > 0 && (
          <View style={{ marginTop: 8, gap: 2 }}>
            <ThemedText type="smallBold">PARENTS</ThemedText>
            {parents.map((parent) => (
              <Pressable
                key={parent.id}
                onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: parent.id } })}
              >
                <ThemedText type="link">
                  {parent.full_name} ›{' '}
                  <ThemedText type="small">
                    {parent.birth_year ?? '?'}–{parent.death_year ?? '?'}
                  </ThemedText>
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        {person.living ? (
          <ThemedText style={{ marginTop: 16 }}>
            {person.full_name.split(' ')[0]} appears to be living, so Witness keeps their story
            private.
          </ThemedText>
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                marginTop: 16,
              }}
            >
              {TABS.map(({ key, label }) => {
                const active = tab === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => selectTab(key)}
                    style={{
                      backgroundColor: active ? theme.accent : theme.backgroundElement,
                      borderWidth: 1,
                      borderColor: active ? theme.accent : theme.border,
                      borderRadius: 16,
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                    }}
                  >
                    <ThemedText
                      type="small"
                      style={{ color: active ? theme.onAccent : theme.text, fontWeight: 600 }}
                    >
                      {label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ marginTop: 8, gap: 8 }}>
              {tab === 'story' && (
                <EnrichmentBody
                  buttonTitle="Tell me their story"
                  generatingLabel="Writing their story from the record…"
                  state={biography.state}
                  onGenerate={biography.generate}
                />
              )}
              {tab === 'world' &&
                (worldContext.state.name === 'ready' ? (
                  <ThemedText>{worldContext.state.text}</ThemedText>
                ) : worldContext.state.name === 'error' ? (
                  <>
                    <ThemedText>{worldContext.state.message}</ThemedText>
                    <Button title="Try again" onPress={worldContext.generate} />
                  </>
                ) : (
                  <View style={{ gap: 8, marginVertical: 8 }}>
                    <ActivityIndicator />
                    <ThemedText type="small">Searching the historical record…</ThemedText>
                  </View>
                ))}
              {tab === 'research' &&
                (briefBusy ? (
                  <View style={{ gap: 8, marginVertical: 8 }}>
                    <ActivityIndicator />
                    <ThemedText type="small">Preparing a research brief…</ThemedText>
                  </View>
                ) : briefError ? (
                  <>
                    <ThemedText>{briefError}</ThemedText>
                    <Button title="Try again" onPress={openResearchBrief} />
                  </>
                ) : (
                  <ThemedText type="link" onPress={openResearchBrief}>
                    Open the research brief ›
                  </ThemedText>
                ))}
            </View>
          </>
        )}

        <ThemedText type="subtitle" style={{ marginTop: 16 }}>
          The record
        </ThemedText>
        {events.length === 0 ? (
          <ThemedText type="small">No dated events recorded.</ThemedText>
        ) : (
          <Card>
            <Lifeline events={events} />
          </Card>
        )}

        {sources.length > 0 && (
          <>
            <ThemedText type="subtitle" style={{ marginTop: 16 }}>
              Sources
            </ThemedText>
            <ThemedText type="small">
              How the record knows {person.full_name.split(' ')[0]} —{' '}
              {sources.length === 1 ? 'one source' : `${sources.length} sources`}, as cited in your
              tree.
            </ThemedText>
            {sources.map((source) => (
              <Card key={source.title}>
                <ThemedText type="smallBold">{source.title}</ThemedText>
                <ThemedText type="small">cites their {source.facts.join(', ')}</ThemedText>
                {source.excerpts.slice(0, 3).map((excerpt) => (
                  <ThemedText key={excerpt} type="small" style={{ fontStyle: 'italic' }}>
                    “{excerpt}”
                  </ThemedText>
                ))}
                {source.url && (
                  <ThemedText type="link" onPress={() => openExternal(source.url!)}>
                    View the record ›
                  </ThemedText>
                )}
              </Card>
            ))}
          </>
        )}

        {naraCandidates.length > 0 && (
          <>
            <ThemedText type="subtitle" style={{ marginTop: 16 }}>
              In the National Archives
            </ThemedText>
            <ThemedText type="small">
              Records that might be {person.full_name.split(' ')[0]} — you decide.
            </ThemedText>
            {naraCandidates.map((candidate) => (
              <NaraCandidateCard
                key={candidate.id}
                candidate={candidate}
                onResolved={(candidateId, status) =>
                  setNaraCandidates((current) =>
                    status === 'dismissed'
                      ? current.filter((c) => c.id !== candidateId)
                      : current.map((c) => (c.id === candidateId ? { ...c, status } : c)),
                  )
                }
              />
            ))}
          </>
        )}

      </ScrollView>
    </ThemedView>
  );
}
