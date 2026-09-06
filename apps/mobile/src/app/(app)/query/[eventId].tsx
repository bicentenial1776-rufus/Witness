import * as Sharing from 'expo-sharing';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { fetchHistoricalEvent, type HistoricalEvent } from '@witness/core/history';
import { aliveDuring, type AliveDuringResult, type AliveMatch } from '@witness/core/query';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { KinLine } from '@/components/kin-line';
import { usePeopleList } from '@/components/people-list';
import { DiscoveryCard, type DiscoveryCardHandle } from '@/components/discovery-card';
import { LineageMark } from '@/components/lineage-mark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { getParentageMap } from '@/lib/parentage';
import { getLineageTierMap, type LineageTier } from '@/lib/relationship-cache';
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
  const [tiers, setTiers] = useState<Map<string, LineageTier>>(new Map());
  const [parentage, setParentage] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<DiscoveryCardHandle>(null);

  // The list's own filter bar decides who is shown (relationship, search,
  // order); the headline, the share card, and the pin all follow it.
  const list = usePeopleList({
    listKey: 'who-was-alive',
    treeId,
    rows: result?.matches,
    person: (m) => ({
      id: m.individual.id,
      fullName: m.individual.full_name,
      birthYear: m.individual.birth_year ?? null,
      deathYear: m.individual.death_year ?? null,
    }),
  });
  const scoped = list.rows;
  // Arriving from an ancestor's "lived through" tag pins that ancestor to
  // the top of the results. The pin only reorders within what the filter
  // shows; a filter that excludes the pinned person simply shows them
  // nowhere.
  const pinned = pin ? scoped.find((m) => m.individual.id === pin) : undefined;
  const shown = pinned ? [pinned, ...scoped.filter((m) => m !== pinned)] : scoped;
  const shownDocumented = shown.filter((m) => m.confidence === 'documented').length;

  async function shareDiscovery() {
    const uri = await cardRef.current?.capture?.();
    if (uri) await Sharing.shareAsync(uri, { mimeType: 'image/png' });
  }

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
    getLineageTierMap(treeId)
      .then((map) => {
        if (!cancelled) setTiers(map);
      })
      .catch(() => {});
    getParentageMap(treeId)
      .then((map) => {
        if (!cancelled) setParentage(map);
      })
      .catch(() => {});
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
          <ThemedText type="subtitle" style={{ marginTop: 8 }}>
            {shown.length.toLocaleString()}{' '}
            {list.active ? 'people shown by this filter were alive' : 'people in your tree were alive'}
          </ThemedText>
          {/* The fuller picture leads (2026-08-27): the headline counts
              documented and probable lives together, and this line says
              how the number is built instead of ranking the halves. */}
          <ThemedText type="small">
            Documented and probable together — {shownDocumented.toLocaleString()} with recorded
            years, {(shown.length - shownDocumented).toLocaleString()} assumed from a typical
            lifespan (dashed cards).
          </ThemedText>
          {list.active && shown.length === 0 && (
            <ThemedText>No one matches this filter — open Filter and widen it.</ThemedText>
          )}
          {shown.length > 0 && <Button title="Share this discovery" onPress={shareDiscovery} />}
          <DiscoveryCard
            ref={cardRef}
            headline={`${shown.length.toLocaleString()} people in my family tree were alive during ${event.name}`}
            detail={event.summary}
            years={`${years} · ${event.region}`}
          />
          {/* The bar sits right above the rows it changes, so a narrowed or
              reordered list is visible without scrolling. */}
          {list.bar}
          <FlatList
            data={shown}
            keyExtractor={(match) => match.individual.id}
            style={{ marginTop: 4 }}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ThemedText style={{ flexShrink: 1 }}>{item.individual.full_name}</ThemedText>
                  <LineageMark tier={tiers.get(item.individual.id)} color={theme.accent} />
                </View>
                <KinLine kin={list.kin.get(item.individual.id)} />
                {parentage.has(item.individual.id) && (
                  <ThemedText type="small">{parentage.get(item.individual.id)}</ThemedText>
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
