import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { aliveDuring, type AliveDuringResult, type AliveMatch } from '@witness/core/query';
import type { HistoricalEvent } from '@witness/core/history';

import { RecordText } from '@/components/record-text';
import { Broadsheet, BrandFonts } from '@/constants/theme';
import { getEventLibrary } from '@/lib/event-library';
import { supabase } from '@/lib/supabase';

const C = Broadsheet.color;
const WIDTH = 420;

/**
 * The who-was-alive drawer (Rufus, 2026-07-24): instead of leaving the
 * page for the broad results screen, the answer slides in from the right
 * as a narrow column — the event up top, compact person rows beneath,
 * dismissed by the scrim or the ✕. The full page stays one link away.
 */
export function QueryDrawer({
  eventId,
  treeId,
  onClose,
}: {
  eventId: string;
  treeId: string;
  onClose: () => void;
}) {
  const [event, setEvent] = useState<HistoricalEvent | null>(null);
  const [result, setResult] = useState<AliveDuringResult | null>(null);
  const slide = useRef(new Animated.Value(WIDTH)).current;

  useEffect(() => {
    Animated.timing(slide, { toValue: 0, duration: 240, useNativeDriver: false }).start();
  }, [slide]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const library = await getEventLibrary();
      const found = library.find((e) => e.id === eventId) ?? null;
      if (cancelled) return;
      setEvent(found);
      if (found) {
        const alive = await aliveDuring(supabase, treeId, found);
        if (!cancelled) setResult(alive);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, treeId]);

  const openPerson = (match: AliveMatch) => {
    onClose();
    router.push({ pathname: '/ancestor/[id]', params: { id: match.individual.id } });
  };

  const row = (match: AliveMatch, first: boolean) => (
    <Pressable
      key={match.individual.id}
      onPress={() => openPerson(match)}
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 10,
        paddingVertical: 8,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: C.ruleLight,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontFamily: BrandFonts.serif.regular, fontSize: 16.5, color: C.ink }}
      >
        {match.individual.full_name}
      </Text>
      <RecordText muted>
        {match.ageAtStart !== null
          ? `${match.ageAtStart} in ${event?.startYear}`
          : match.bornDuring
            ? 'born during'
            : `${match.individual.birth_year ?? '?'}–${match.individual.death_year ?? '?'}`}
      </RecordText>
    </Pressable>
  );

  const documented = result?.matches.filter((m) => m.confidence === 'documented') ?? [];
  const probable = result?.matches.filter((m) => m.confidence === 'probable') ?? [];

  // 'fixed' is web-only; native ignores it and the drawer rendered
  // in-flow and invisible on iPad (caught 2026-08-28).
  return (
    <View
      style={
        {
          position: Platform.OS === 'web' ? 'fixed' : 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 50,
        } as never
      }
    >
      <Pressable
        onPress={onClose}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(23,20,15,0.28)' }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: WIDTH,
          backgroundColor: C.paperRaised,
          borderLeftWidth: 1,
          borderLeftColor: C.rule,
          transform: [{ translateX: slide }],
          shadowColor: '#17140F',
          shadowOpacity: 0.18,
          shadowRadius: 24,
          shadowOffset: { width: -6, height: 0 },
        }}
      >
        <View style={{ padding: 24, paddingBottom: 14, borderBottomWidth: 3, borderBottomColor: C.ink, borderStyle: 'double' as never }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <RecordText eyebrow accent>
              Who was alive
            </RecordText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 20, color: C.inkMuted }}>✕</Text>
            </Pressable>
          </View>
          {event && (
            <>
              <Text style={{ fontFamily: BrandFonts.serif.bold, fontSize: 25, color: C.ink, marginTop: 8 }}>
                {event.name}
              </Text>
              <RecordText style={{ marginTop: 6 }}>
                {event.startYear === event.endYear ? event.startYear : `${event.startYear} – ${event.endYear}`}
                {result ? ` · ${result.matches.length.toLocaleString()} ALIVE` : ''}
              </RecordText>
              {result && (
                <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13.5, color: C.inkMuted, marginTop: 3 }}>
                  {result.documentedCount.toLocaleString()} documented · {result.probableCount.toLocaleString()} probable
                </Text>
              )}
            </>
          )}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingTop: 14 }}>
          {!result && (
            <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 15, color: C.inkMuted }}>
              Reading the tree…
            </Text>
          )}
          {documented.length > 0 && (
            <>
              <RecordText eyebrow muted style={{ marginBottom: 4 }}>
                Documented
              </RecordText>
              {documented.map((m, i) => row(m, i === 0))}
            </>
          )}
          {probable.length > 0 && (
            <>
              <RecordText eyebrow muted style={{ marginTop: 18, marginBottom: 4 }}>
                Probable
              </RecordText>
              {probable.map((m, i) => row(m, i === 0))}
            </>
          )}
          <Text
            onPress={() => {
              onClose();
              router.push({ pathname: '/query/[eventId]', params: { eventId, treeId } });
            }}
            style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 14.5, color: C.accent, marginTop: 22, marginBottom: 30 }}
          >
            Open the full page →
          </Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}
