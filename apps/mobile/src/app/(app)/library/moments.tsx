import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';

import { countAliveDuring, type HistoricalEvent } from '@witness/core/history';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getEventLibrary } from '@/lib/event-library';
import { getGeographyIndex } from '@/lib/geography-cache';
import { WideContent } from '@/constants/theme';

interface MomentRow {
  event: HistoricalEvent;
  aliveCount: number;
}

function eventYears(event: HistoricalEvent): string {
  return event.startYear === event.endYear
    ? String(event.startYear)
    : `${event.startYear}–${event.endYear}`;
}

/**
 * The full moments catalog, browsable at last: every historical event in
 * the library on one chronological scroll, grouped by century, each with
 * this tree's live alive-count. Search on Explore still finds moments by
 * word; this is for the reader who doesn't know the words yet. Keeping
 * every row personalized ("N of your ancestors were alive") is what keeps
 * this a family timeline rather than a generic history menu.
 */
export default function MomentsScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [rows, setRows] = useState<MomentRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    Promise.all([getEventLibrary(), getGeographyIndex(treeId)])
      .then(([events, index]) => {
        if (cancelled) return;
        setRows(
          [...events]
            .sort((a, b) => a.startYear - b.startYear || a.endYear - b.endYear)
            .map((event) => ({ event, aliveCount: countAliveDuring(index, event) })),
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  let lastEra: string | null = null;

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Moments in history' }} />
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 8 }}>
        <ThemedText type="small">
          Every moment in the library, oldest first — and who in your family was there for it.
        </ThemedText>

        {rows === null ? (
          failed ? (
            <ThemedText type="small">Couldn’t load the library just now — try again shortly.</ThemedText>
          ) : (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          )
        ) : (
          rows.map(({ event, aliveCount }) => {
            const era = `${Math.floor(event.startYear / 100) * 100}s`;
            const header = era !== lastEra;
            lastEra = era;
            return (
              <ThemedView key={event.id} style={{ gap: 8 }}>
                {header && (
                  <ThemedText type="subtitle" style={{ marginTop: 12 }}>
                    The {era}
                  </ThemedText>
                )}
                <Card
                  onPress={() =>
                    router.push({ pathname: '/query/[eventId]', params: { eventId: event.id, treeId } })
                  }
                >
                  <ThemedText>{event.name}</ThemedText>
                  <ThemedText type="small">
                    {eventYears(event)} · {event.region}
                  </ThemedText>
                  <ThemedText type="small" themeColor={aliveCount > 0 ? 'accent' : undefined}>
                    {aliveCount > 0
                      ? `${aliveCount.toLocaleString()} of your ancestors were alive ›`
                      : 'no ancestors alive then'}
                  </ThemedText>
                </Card>
              </ThemedView>
            );
          })
        )}
      </ScrollView>
    </ThemedView>
  );
}
