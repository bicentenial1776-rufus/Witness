import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { getRelationship } from '@witness/core/family';
import {
  rankLivedThroughEvents,
  regionsFromPlaceParts,
  type LivedThroughTag,
} from '@witness/core/history';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { getEventLibrary } from '@/lib/event-library';
import { getRelationshipMap } from '@/lib/relationship-cache';
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

type SectionState =
  | { name: 'none' }
  | { name: 'generating' }
  | { name: 'ready'; text: string }
  | { name: 'error'; message: string };

async function invokeError(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error);
  try {
    const body = await (error as { context?: Response }).context?.json?.();
    return body?.error ?? fallback;
  } catch {
    return fallback;
  }
}

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

export default function AncestorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [person, setPerson] = useState<Person | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [tags, setTags] = useState<LivedThroughTag[]>([]);
  const [relationship, setRelationship] = useState<string | null>(null);
  const [tab, setTab] = useState<SectionTab>('story');
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const biography = useEnrichment(id, 'biography', 'generate-biography', 'biography');
  const worldContext = useEnrichment(id, 'historical_context', 'generate-historical-context', 'context');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setPerson(null);
    setEvents([]);
    setParents([]);
    setTags([]);
    setRelationship(null);
    setTab('story');
    (async () => {
      const [{ data: personRow }, { data: eventRows }] = await Promise.all([
        supabase
          .from('individuals')
          .select('id, tree_id, full_name, sex, birth_year, death_year, living')
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

      // "Lived through" tags: the 5 events that best frame this life,
      // ranked by tier and boosted by this person's own geography — all
      // from data this screen already has, plus the cached event library.
      if (personRow) {
        const regions = regionsFromPlaceParts(eventRows ?? []);
        getEventLibrary().then((library) => {
          if (!cancelled) setTags(rankLivedThroughEvents(personRow, library, regions));
        });
      }

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

  async function openResearchBrief() {
    setBriefBusy(true);
    setBriefError(null);
    // An open brief for this ancestor already exists? Go there — the
    // Edge Function would happily generate a duplicate.
    const { data: existing } = await supabase
      .from('research_briefs')
      .select('id')
      .eq('individual_id', id)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      setBriefBusy(false);
      router.push({ pathname: '/research/[briefId]', params: { briefId: existing.id } });
      return;
    }
    const { data, error } = await supabase.functions.invoke('generate-research-brief', {
      body: { individualId: id },
    });
    setBriefBusy(false);
    if (error) {
      setBriefError(await invokeError(error));
      return;
    }
    router.push({ pathname: '/research/[briefId]', params: { briefId: data.id } });
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

      </ScrollView>
    </ThemedView>
  );
}
