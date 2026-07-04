import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

interface Person {
  id: string;
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

type BiographyState =
  | { name: 'none' }
  | { name: 'generating' }
  | { name: 'ready'; text: string }
  | { name: 'error'; message: string };

export default function AncestorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [person, setPerson] = useState<Person | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [biography, setBiography] = useState<BiographyState>({ name: 'none' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const [{ data: personRow }, { data: eventRows }, { data: cached }] = await Promise.all([
        supabase
          .from('individuals')
          .select('id, full_name, sex, birth_year, death_year, living')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('individual_events')
          .select('event_type, date_year, date_raw, places(raw)')
          .eq('individual_id', id)
          .order('date_year', { ascending: true })
          .returns<EventRow[]>(),
        supabase
          .from('enrichment_cache')
          .select('content')
          .eq('individual_id', id)
          .eq('enrichment_type', 'biography')
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setPerson(personRow);
      setEvents(eventRows ?? []);
      if (cached) setBiography({ name: 'ready', text: cached.content });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function generateBiography() {
    setBiography({ name: 'generating' });
    const { data, error } = await supabase.functions.invoke('generate-biography', {
      body: { individualId: id },
    });
    if (error) {
      let message = error.message;
      try {
        const body = await (error as { context?: Response }).context?.json?.();
        if (body?.error) message = body.error;
      } catch {
        // keep the generic message
      }
      setBiography({ name: 'error', message });
      return;
    }
    setBiography({ name: 'ready', text: data.biography });
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
        <ThemedText type="small">
          {person.birth_year ?? '?'}–{person.living ? '' : (person.death_year ?? '?')}
          {person.living ? ' · living' : ''}
        </ThemedText>

        <ThemedText type="subtitle" style={{ marginTop: 16 }}>
          Their story
        </ThemedText>
        {person.living ? (
          <ThemedText>
            {person.full_name.split(' ')[0]} appears to be living, so Witness keeps their story
            private.
          </ThemedText>
        ) : biography.name === 'ready' ? (
          <ThemedText>{biography.text}</ThemedText>
        ) : biography.name === 'generating' ? (
          <View style={{ gap: 8, marginVertical: 8 }}>
            <ActivityIndicator />
            <ThemedText type="small">Writing their story from the record…</ThemedText>
          </View>
        ) : (
          <>
            {biography.name === 'error' && <ThemedText>{biography.message}</ThemedText>}
            <Button title="Tell me their story" onPress={generateBiography} />
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
