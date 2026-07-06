import * as Sharing from 'expo-sharing';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { fetchHistoricalEvent, type HistoricalEvent } from '@witness/core/history';
import { aliveDuring, type AliveDuringResult, type AliveMatch } from '@witness/core/query';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DiscoveryCard, type DiscoveryCardHandle } from '@/components/discovery-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { getRelationshipMap } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

function matchLine(match: AliveMatch, startYear: number): string {
  if (match.bornDuring) return 'Born during these years';
  if (match.ageAtStart === null) return 'Age unknown';
  return `Was ${match.ageAtStart} in ${startYear}`;
}

export default function AliveDuringScreen() {
  const { eventId, treeId, pin } = useLocalSearchParams<{
    eventId: string;
    treeId: string;
    pin?: string;
  }>();
  const theme = useTheme();
  const [event, setEvent] = useState<HistoricalEvent | undefined | 'loading'>('loading');
  const [result, setResult] = useState<AliveDuringResult | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());
  const [scope, setScope] = useState<'line' | 'all'>('line');
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<DiscoveryCardHandle>(null);

  // Without a home person there is no "line" to filter by.
  const hasLine = relationships.size > 0;
  const effectiveScope = hasLine ? scope : 'all';
  const lineMatches = (result?.matches ?? []).filter((m) => relationships.has(m.individual.id));
  const scoped = effectiveScope === 'line' ? lineMatches : (result?.matches ?? []);
  // Arriving from an ancestor's "lived through" tag pins that ancestor to
  // the top of the results. The pin only reorders within the current
  // scope, so headline counts, tab labels, and the share card all stay
  // consistent; a scope that excludes the pinned person simply shows
  // them nowhere (the effect below picks the scope that contains them).
  const pinned = pin ? scoped.find((m) => m.individual.id === pin) : undefined;
  const shown = pinned ? [pinned, ...scoped.filter((m) => m !== pinned)] : scoped;
  const shownDocumented = shown.filter((m) => m.confidence === 'documented').length;

  async function shareDiscovery() {
    const uri = await cardRef.current?.capture?.();
    if (uri) await Sharing.shareAsync(uri, { mimeType: 'image/png' });
  }

  // A pinned ancestor outside the home-person line must land on a scope
  // that actually contains them.
  useEffect(() => {
    if (pin && relationships.size > 0 && !relationships.has(pin)) setScope('all');
  }, [pin, relationships]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setEvent('loading');
    fetchHistoricalEvent(supabase, eventId).then((e) => {
      if (!cancelled) setEvent(e);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (event === 'loading' || !event || !treeId) return;
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

  if (event === 'loading') {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }
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
    <ThemedView style={{ flex: 1, padding: 24, gap: 8 }}>
      <Stack.Screen options={{ title: event.name }} />
      <ThemedText type="small">
        {years} · {event.region}
      </ThemedText>

      {error && <ThemedText>Something went wrong: {error}</ThemedText>}

      {!result && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}

      {result && (
        <>
          {hasLine && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {(
                [
                  { key: 'line', label: `Related (${lineMatches.length.toLocaleString()})` },
                  { key: 'all', label: `Everyone (${result.matches.length.toLocaleString()})` },
                ] as const
              ).map(({ key, label }) => {
                const active = scope === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setScope(key)}
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
          )}
          <ThemedText type="subtitle" style={{ marginTop: 8 }}>
            {shown.length.toLocaleString()}{' '}
            {effectiveScope === 'line' ? 'of your relatives were alive' : 'people in your tree were alive'}
          </ThemedText>
          <ThemedText type="small">
            {shownDocumented.toLocaleString()} documented ·{' '}
            {(shown.length - shownDocumented).toLocaleString()} probable
          </ThemedText>
          {effectiveScope === 'line' && shown.length === 0 && (
            <ThemedText>
              No relatives of yours — switch to Everyone to see the whole tree.
            </ThemedText>
          )}
          {shown.length > 0 && <Button title="Share this discovery" onPress={shareDiscovery} />}
          <DiscoveryCard
            ref={cardRef}
            headline={`${shown.length.toLocaleString()} ${
              effectiveScope === 'line' ? 'of my relatives' : 'people in my family tree'
            } were alive during ${event.name}`}
            detail={event.summary}
            years={`${years} · ${event.region}`}
          />
          <FlatList
            data={shown}
            keyExtractor={(match) => match.individual.id}
            style={{ marginTop: 12 }}
            renderItem={({ item }) => (
              <Card
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })
                }
                style={{
                  borderStyle: item.confidence === 'probable' ? 'dashed' : 'solid',
                  ...(item.individual.id === pin && { borderColor: theme.accent, borderWidth: 2 }),
                  marginBottom: 8,
                }}
              >
                {item.individual.id === pin && (
                  <ThemedText type="smallBold" themeColor="accent">
                    THE ANCESTOR YOU CAME FROM
                  </ThemedText>
                )}
                <ThemedText>{item.individual.full_name}</ThemedText>
                {relationships.has(item.individual.id) && (
                  <ThemedText type="small">your {relationships.get(item.individual.id)}</ThemedText>
                )}
                <ThemedText type="small">
                  {item.individual.birth_year ?? '?'}–{item.individual.death_year ?? '?'} ·{' '}
                  {matchLine(item, event.startYear)}
                  {item.confidence === 'probable' ? ' · probable' : ''}
                </ThemedText>
              </Card>
            )}
          />
        </>
      )}
    </ThemedView>
  );
}
