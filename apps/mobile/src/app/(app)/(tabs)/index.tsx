import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { weeklyDigest, type DigestEntry, type WeeklyDigest } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { armDigestNotification } from '@/lib/digest-notifications';
import { getRelationshipMap } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

function dayLabel(date: Date): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(date) - startOf(new Date())) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long' });
}

function anniversaryLine(entry: DigestEntry): string {
  const verb = entry.eventType === 'birth' ? 'Born' : 'Died';
  const when =
    entry.yearsAgo !== null
      ? `${entry.yearsAgo} years ago${entry.year !== null ? ` — ${entry.year}` : ''}`
      : (entry.year?.toString() ?? 'year unknown');
  return `${verb} ${when}`;
}

/**
 * The habit surface. Tree management lives on the You tab; Home is what's
 * new in your family's history right now: the week's anniversaries laid
 * out in the open, one person per day. The window rolls — it always
 * starts today, so tomorrow the next person moves to the top.
 */
export default function Home() {
  const { trees, activeTree, refresh } = useActiveTree();
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());
  const [topNote, setTopNote] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Keep next Sunday's digest notification armed with fresh content.
  useEffect(() => {
    if (activeTree) armDigestNotification(activeTree.id).catch(() => {});
  }, [activeTree?.id]);

  // The rolling week, recomputed on focus so the top card moves on at
  // midnight without a relaunch. Only the top person's note is read (from
  // cache, never generated) — the full notes live on the digest screen.
  useFocusEffect(
    useCallback(() => {
      if (!activeTree) return;
      let cancelled = false;
      (async () => {
        try {
          const relationshipMap = await getRelationshipMap(activeTree.id).catch(
            () => new Map<string, string>(),
          );
          const result = await weeklyDigest(
            supabase,
            activeTree.id,
            new Date(),
            new Set(relationshipMap.keys()),
          );
          if (cancelled) return;
          setRelationships(relationshipMap);
          setDigest(result);

          const top = result.days[0];
          if (!top) return;
          const { data } = await supabase
            .from('enrichment_cache')
            .select('content')
            .eq('individual_id', top.individualId)
            .eq('enrichment_type', 'digest_note')
            .maybeSingle();
          if (!cancelled) setTopNote(data?.content ?? null);
        } catch {
          // Home stays quiet on digest errors; the digest screen surfaces them.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeTree?.id]),
  );

  const openWeek = () =>
    activeTree && router.push({ pathname: '/digest', params: { treeId: activeTree.id } });

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingTop: 72, paddingBottom: 48, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <ThemedText type="title">Witness</ThemedText>
          <Pressable
            onPress={() => router.push('/you')}
            hitSlop={12}
            accessibilityLabel="Your account and trees"
            style={{ paddingTop: 10 }}
          >
            <SymbolView name="gearshape" size={26} tintColor="#6B6157" />
          </Pressable>
        </View>
        <ThemedText type="small" style={{ marginTop: -8 }}>
          Witnesses to history
        </ThemedText>

        {trees === null ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : trees.length === 0 ? (
          <Card onPress={() => router.push('/import-guide')} style={{ marginTop: 12 }}>
            <ThemedText type="subtitle">Bring your family in</ThemedText>
            <ThemedText>
              Your tree lives on Ancestry, FamilySearch, or another platform — Witness will walk
              you through getting it out and bringing it to life.
            </ThemedText>
            <ThemedText type="link">Show me how ›</ThemedText>
          </Card>
        ) : (
          activeTree && (
            <>
              <ThemedText type="smallBold" themeColor="accent" style={{ marginTop: 8 }}>
                THIS WEEK
              </ThemedText>

              {!digest && <ActivityIndicator style={{ marginVertical: 24 }} />}

              {digest?.days.length === 0 && (
                <ThemedText>
                  A quiet week — no dated anniversaries in your tree fall in the next seven days.
                </ThemedText>
              )}

              {digest?.days.map((entry, index) => {
                const relationship = relationships.get(entry.individualId);
                const open = () =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: entry.individualId } });

                if (index === 0) {
                  return (
                    <Card key={entry.eventId} onPress={open}>
                      <ThemedText type="smallBold" themeColor="accent">
                        ✦ {dayLabel(entry.occursOn).toUpperCase()} ·{' '}
                        {entry.occursOn
                          .toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
                          .toUpperCase()}
                      </ThemedText>
                      <ThemedText type="subtitle">{entry.fullName}</ThemedText>
                      {relationship && <ThemedText type="small">Your {relationship}</ThemedText>}
                      <ThemedText>
                        {anniversaryLine(entry)}
                        {entry.placeRaw ? ` · ${entry.placeRaw}` : ''}
                      </ThemedText>
                      {topNote && <ThemedText style={{ marginTop: 4 }}>{topNote}</ThemedText>}
                      <ThemedText type="link" style={{ marginTop: 4 }}>
                        Their full story ›
                      </ThemedText>
                    </Card>
                  );
                }

                return (
                  <Card key={entry.eventId} onPress={open} style={{ paddingVertical: 12 }}>
                    <ThemedText type="small">{dayLabel(entry.occursOn)}</ThemedText>
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
              })}

              {digest && digest.days.length > 0 && (
                <ThemedText type="link" onPress={openWeek}>
                  Read the week ›
                </ThemedText>
              )}
            </>
          )
        )}
      </ScrollView>
    </ThemedView>
  );
}
