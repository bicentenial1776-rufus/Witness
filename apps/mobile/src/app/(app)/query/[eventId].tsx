import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Pressable, View } from 'react-native';

import { getHistoricalEvent } from '@witness/core/history';
import { aliveDuring, type AliveDuringResult, type AliveMatch } from '@witness/core/query';

import { DiscoveryCard, type DiscoveryCardHandle } from '@/components/discovery-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getRelationshipMap } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

function matchLine(match: AliveMatch, startYear: number): string {
  if (match.bornDuring) return 'Born during these years';
  if (match.ageAtStart === null) return 'Age unknown';
  return `Was ${match.ageAtStart} in ${startYear}`;
}

export default function AliveDuringScreen() {
  const { eventId, treeId } = useLocalSearchParams<{ eventId: string; treeId: string }>();
  const event = getHistoricalEvent(eventId);
  const [result, setResult] = useState<AliveDuringResult | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<DiscoveryCardHandle>(null);

  async function shareDiscovery() {
    const uri = await cardRef.current?.capture?.();
    if (uri) await Sharing.shareAsync(uri, { mimeType: 'image/png' });
  }

  useEffect(() => {
    if (!event || !treeId) return;
    let cancelled = false;
    aliveDuring(supabase, treeId, event)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    getRelationshipMap(treeId).then((map) => {
      if (!cancelled) setRelationships(map);
    });
    return () => {
      cancelled = true;
    };
  }, [event, treeId]);

  if (!event) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <ThemedText>Unknown event.</ThemedText>
      </ThemedView>
    );
  }

  const years =
    event.startYear === event.endYear ? String(event.startYear) : `${event.startYear}–${event.endYear}`;

  return (
    <ThemedView style={{ flex: 1, padding: 24, paddingTop: 72, gap: 8 }}>
      <Pressable onPress={() => router.back()}>
        <ThemedText type="link">‹ Back</ThemedText>
      </Pressable>
      <ThemedText type="title">{event.name}</ThemedText>
      <ThemedText type="small">
        {years} · {event.region}
      </ThemedText>

      {error && <ThemedText>Something went wrong: {error}</ThemedText>}

      {!result && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}

      {result && (
        <>
          <ThemedText type="subtitle" style={{ marginTop: 8 }}>
            {result.matches.length.toLocaleString()} people in your family were alive
          </ThemedText>
          <ThemedText type="small">
            {result.documentedCount.toLocaleString()} documented ·{' '}
            {result.probableCount.toLocaleString()} probable
          </ThemedText>
          {result.matches.length > 0 && (
            <Button title="Share this discovery" onPress={shareDiscovery} />
          )}
          <DiscoveryCard
            ref={cardRef}
            headline={`${result.matches.length.toLocaleString()} of my ancestors were alive during ${event.name}`}
            detail={event.summary}
            years={`${years} · ${event.region}`}
          />
          <FlatList
            data={result.matches}
            keyExtractor={(match) => match.individual.id}
            style={{ marginTop: 12 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })
                }
                style={{
                  borderWidth: 1,
                  borderStyle: item.confidence === 'probable' ? 'dashed' : 'solid',
                  borderColor: '#999',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  gap: 2,
                }}
              >
                <ThemedText>{item.individual.full_name}</ThemedText>
                {relationships.has(item.individual.id) && (
                  <ThemedText type="small">your {relationships.get(item.individual.id)}</ThemedText>
                )}
                <ThemedText type="small">
                  {item.individual.birth_year ?? '?'}–{item.individual.death_year ?? '?'} ·{' '}
                  {matchLine(item, event.startYear)}
                  {item.confidence === 'probable' ? ' · probable' : ''}
                </ThemedText>
              </Pressable>
            )}
          />
        </>
      )}
    </ThemedView>
  );
}
