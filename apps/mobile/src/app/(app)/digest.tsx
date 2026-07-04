import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { weeklyDigest, type DigestEntry, type WeeklyDigest } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { armDigestNotification } from '@/lib/digest-notifications';
import { getRelationshipMap } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

/**
 * "This Week in Your Family" — up to three anniversaries this week, each
 * with a 2-sentence AI note. Notes come from the digest_note cache and are
 * generated (sequentially, against the shared daily budget) when missing.
 */

type NoteState = { text: string | null; loading: boolean };

function formatOccurs(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function anniversaryLine(entry: DigestEntry): string {
  const verb = entry.eventType === 'birth' ? 'Born' : 'Died';
  const when =
    entry.yearsAgo !== null
      ? `${entry.yearsAgo} years ago${entry.year !== null ? ` — ${entry.year}` : ''}`
      : (entry.year?.toString() ?? 'year unknown');
  return `${verb} ${when}`;
}

export default function DigestScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());
  const [notes, setNotes] = useState<Record<string, NoteState>>({});

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    setDigest(null);
    setError(null);
    setNotes({});
    (async () => {
      try {
        const relationshipMap = await getRelationshipMap(treeId).catch(() => new Map<string, string>());
        const result = await weeklyDigest(
          supabase,
          treeId,
          new Date(),
          new Set(relationshipMap.keys()),
        );
        if (cancelled) return;
        setRelationships(relationshipMap);
        setDigest(result);

        // Notes: cached ones load in one read; the rest generate one at a
        // time so a thin budget still finishes the top of the digest.
        const ids = result.entries.map((e) => e.individualId);
        if (ids.length === 0) return;
        const { data: cachedRows } = await supabase
          .from('enrichment_cache')
          .select('individual_id, content')
          .in('individual_id', ids)
          .eq('enrichment_type', 'digest_note');
        if (cancelled) return;
        const cached = new Map((cachedRows ?? []).map((r) => [r.individual_id, r.content]));
        setNotes(
          Object.fromEntries(
            ids.map((id) => [id, { text: cached.get(id) ?? null, loading: !cached.has(id) }]),
          ),
        );
        for (const id of ids) {
          if (cached.has(id)) continue;
          const { data } = await supabase.functions.invoke('generate-digest-note', {
            body: { individualId: id },
          });
          if (cancelled) return;
          setNotes((prev) => ({
            ...prev,
            [id]: { text: data?.note ?? null, loading: false },
          }));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  // Every visit re-arms next week's notification with fresh content.
  useEffect(() => {
    if (treeId) armDigestNotification(treeId).catch(() => {});
  }, [treeId]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48, gap: 12 }}>
        {digest && (
          <ThemedText type="small">
            {digest.weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} –{' '}
            {digest.weekEnd.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
            {digest.candidateCount > digest.entries.length
              ? ` · chosen from ${digest.candidateCount} anniversaries`
              : ''}
          </ThemedText>
        )}

        {error && <ThemedText>{error}</ThemedText>}
        {!digest && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}

        {digest?.entries.length === 0 && (
          <ThemedText style={{ marginTop: 12 }}>
            A quiet week — no dated anniversaries in your tree fall in the next seven days.
          </ThemedText>
        )}

        {digest?.entries.map((entry) => {
          const relationship = relationships.get(entry.individualId);
          const note = notes[entry.individualId];
          return (
            <Card
              key={entry.eventId}
              onPress={() =>
                router.push({ pathname: '/ancestor/[id]', params: { id: entry.individualId } })
              }
            >
              <ThemedText type="smallBold" themeColor="accent">
                {formatOccurs(entry.occursOn).toUpperCase()}
              </ThemedText>
              <ThemedText type="subtitle">{entry.fullName}</ThemedText>
              {relationship && <ThemedText type="small">Your {relationship}</ThemedText>}
              <ThemedText>
                {anniversaryLine(entry)}
                {entry.placeRaw ? ` · ${entry.placeRaw}` : ''}
              </ThemedText>
              {note?.loading ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <ActivityIndicator size="small" />
                  <ThemedText type="small">Placing them in their moment…</ThemedText>
                </View>
              ) : note?.text ? (
                <ThemedText style={{ marginTop: 4 }}>{note.text}</ThemedText>
              ) : null}
              <ThemedText type="link" style={{ marginTop: 4 }}>
                Their full story ›
              </ThemedText>
            </Card>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}
