import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { weeklyDigest, type DigestEntry, type WeeklyDigest } from '@witness/core/query';

import { useBroadsheet } from '@/components/broadsheet';
import { ThisWeekBroadsheet, type LivedThroughLine } from '@/components/broadsheet/this-week';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { armDigestNotification } from '@/lib/digest-notifications';
import { getEventLibrary } from '@/lib/event-library';
import { getRelationshipMap } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

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
  const broadsheet = useBroadsheet();
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());
  const [notes, setNotes] = useState<Record<string, NoteState>>({});
  const [livedThrough, setLivedThrough] = useState<LivedThroughLine[]>([]);

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
        // time so a thin budget still finishes the top of the digest. The
        // week's lead (days[0]) joins the cache read — the broadsheet
        // features it — but only featured entries spend generation budget.
        const entryIds = result.entries.map((e) => e.individualId);
        const ids = [
          ...new Set(
            [result.days[0]?.individualId, ...entryIds].filter((id): id is string => Boolean(id)),
          ),
        ];
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
            ids.map((id) => [
              id,
              { text: cached.get(id) ?? null, loading: !cached.has(id) && entryIds.includes(id) },
            ]),
          ),
        );
        for (const id of entryIds) {
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

  // Broadsheet margin data: the "while they lived" world events for the
  // week's featured life (carried here from Home in the phone-tab mirror).
  useEffect(() => {
    const top = digest?.days[0];
    if (!broadsheet || !top || top.birthYear === null) return;
    let cancelled = false;
    (async () => {
      const library = await getEventLibrary();
      const lastYear = top.deathYear ?? top.birthYear! + 80;
      const inLife = library.filter((e) => e.startYear >= top.birthYear! && e.startYear <= lastYear);
      const picks = [
        ...inLife.filter((e) => e.tier === 'major'),
        ...inLife.filter((e) => e.tier !== 'major'),
      ]
        .slice(0, 3)
        .sort((a, b) => a.startYear - b.startYear);
      if (!cancelled) {
        setLivedThrough(
          picks.map((e) => ({
            eventId: e.id,
            year: e.startYear,
            name: e.name,
            age: e.startYear - top.birthYear!,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [digest, broadsheet]);

  // Web ≥900px: This Week as the broadsheet page (redesign §3.1), reached
  // from Home — the rail's Home destination keeps it under that section.
  if (broadsheet && treeId && digest) {
    const top = digest.days[0];
    return (
      <ThisWeekBroadsheet
        digest={digest}
        relationships={relationships}
        topNote={top ? (notes[top.individualId]?.text ?? null) : null}
        livedThrough={livedThrough}
        treeId={treeId}
      />
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 12 }}>
        {digest && (
          <ThemedText type="small">
            {digest.weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} –{' '}
            {digest.weekEnd.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
            {digest.candidateCount > digest.days.length
              ? ` · chosen from ${digest.candidateCount} anniversaries`
              : ''}
          </ThemedText>
        )}

        {error && <ThemedText>{error}</ThemedText>}
        {!digest && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}

        {digest?.days.length === 0 && (
          <ThemedText style={{ marginTop: 12 }}>
            A quiet week — no dated anniversaries in your tree fall in the next seven days.
          </ThemedText>
        )}

        {digest?.days.map((entry) => {
          const relationship = relationships.get(entry.individualId);
          const featured = digest.entries.some((e) => e.eventId === entry.eventId);
          const open = () =>
            router.push({ pathname: '/ancestor/[id]', params: { id: entry.individualId } });

          if (!featured) {
            return (
              <Card key={entry.eventId} onPress={open} style={{ paddingVertical: 12 }}>
                <ThemedText type="small">{formatOccurs(entry.occursOn)}</ThemedText>
                <ThemedText>
                  {entry.fullName}
                  {relationship ? (
                    <ThemedText type="small"> · your {relationship}</ThemedText>
                  ) : null}
                </ThemedText>
                <ThemedText type="small">
                  {anniversaryLine(entry)}
                  {entry.placeRaw ? ` · ${entry.placeRaw.split(',')[0]}` : ''}
                </ThemedText>
              </Card>
            );
          }

          const note = notes[entry.individualId];
          return (
            <Card key={entry.eventId} onPress={open}>
              <ThemedText type="smallBold" themeColor="accent">
                ✦ FEATURED · {formatOccurs(entry.occursOn).toUpperCase()}
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
