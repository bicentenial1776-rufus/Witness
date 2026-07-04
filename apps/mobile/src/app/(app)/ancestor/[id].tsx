import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, View } from 'react-native';

import { getRelationship } from '@witness/core/family';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getRelationshipMap } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

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
  places: { raw: string } | null;
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

function EnrichmentSection({
  title,
  buttonTitle,
  generatingLabel,
  state,
  onGenerate,
}: {
  title: string;
  buttonTitle: string;
  generatingLabel: string;
  state: SectionState;
  onGenerate: () => void;
}) {
  return (
    <>
      <ThemedText type="subtitle" style={{ marginTop: 16 }}>
        {title}
      </ThemedText>
      {state.name === 'ready' ? (
        <ThemedText>{state.text}</ThemedText>
      ) : state.name === 'generating' ? (
        <View style={{ gap: 8, marginVertical: 8 }}>
          <ActivityIndicator />
          <ThemedText type="small">{generatingLabel}</ThemedText>
        </View>
      ) : (
        <>
          {state.name === 'error' && <ThemedText>{state.message}</ThemedText>}
          <Button title={buttonTitle} onPress={onGenerate} />
        </>
      )}
    </>
  );
}

export default function AncestorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [person, setPerson] = useState<Person | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [relationship, setRelationship] = useState<string | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const biography = useEnrichment(id, 'biography', 'generate-biography', 'biography');
  const worldContext = useEnrichment(id, 'historical_context', 'generate-historical-context', 'context');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const [{ data: personRow }, { data: eventRows }] = await Promise.all([
        supabase
          .from('individuals')
          .select('id, tree_id, full_name, sex, birth_year, death_year, living')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('individual_events')
          .select('event_type, date_year, date_raw, places(raw)')
          .eq('individual_id', id)
          .order('date_year', { ascending: true })
          .returns<EventRow[]>(),
      ]);
      if (cancelled) return;
      setPerson(personRow);
      setEvents(eventRows ?? []);

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

  async function startResearchBrief() {
    setBriefBusy(true);
    setBriefError(null);
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
    <ThemedView style={{ flex: 1, paddingTop: 72 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48, gap: 8 }}>
        <ThemedText type="link" onPress={() => router.back()}>
          ‹ Back
        </ThemedText>
        <ThemedText type="title">{person.full_name}</ThemedText>
        {relationship && <ThemedText type="subtitle">Your {relationship}</ThemedText>}
        <ThemedText type="small">
          {person.birth_year ?? '?'}–{person.living ? '' : (person.death_year ?? '?')}
          {person.living ? ' · living' : ''}
        </ThemedText>

        {person.living ? (
          <ThemedText style={{ marginTop: 16 }}>
            {person.full_name.split(' ')[0]} appears to be living, so Witness keeps their story
            private.
          </ThemedText>
        ) : (
          <>
            <EnrichmentSection
              title="Their story"
              buttonTitle="Tell me their story"
              generatingLabel="Writing their story from the record…"
              state={biography.state}
              onGenerate={biography.generate}
            />
            <EnrichmentSection
              title="The world they lived in"
              buttonTitle="Show me their world"
              generatingLabel="Searching the historical record…"
              state={worldContext.state}
              onGenerate={worldContext.generate}
            />

            <ThemedText type="subtitle" style={{ marginTop: 16 }}>
              Research
            </ThemedText>
            {briefError && <ThemedText>{briefError}</ThemedText>}
            {briefBusy ? (
              <View style={{ gap: 8, marginVertical: 8 }}>
                <ActivityIndicator />
                <ThemedText type="small">Preparing a research brief…</ThemedText>
              </View>
            ) : (
              <Button title="Start a research brief" onPress={startResearchBrief} />
            )}
          </>
        )}

        <ThemedText type="subtitle" style={{ marginTop: 16 }}>
          The record
        </ThemedText>
        {events.length === 0 && <ThemedText type="small">No dated events recorded.</ThemedText>}
        {events.map((event, index) => (
          <View
            key={index}
            style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, gap: 2 }}
          >
            <ThemedText>
              {event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}
              {event.date_raw ? ` · ${event.date_raw}` : event.date_year ? ` · ${event.date_year}` : ''}
            </ThemedText>
            {event.places?.raw && <ThemedText type="small">{event.places.raw}</ThemedText>}
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}
