import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { ancestorsAtPlace, type GeographyIndex } from '@witness/core/query';

import { RecordText } from '@/components/record-text';
import { Broadsheet, BrandFonts } from '@/constants/theme';

const C = Broadsheet.color;
const WIDTH = 420;

/**
 * The place detail as a top-to-bottom drawer (Rufus, 2026-07-24 — "the
 * drawer treatment is perfect"): everything the selected-place spread
 * used to say, plus the residents ledger, without leaving the map.
 */
export function PlaceDrawer({
  placeId,
  index,
  onClose,
}: {
  placeId: string;
  treeId?: string;
  index: GeographyIndex;
  onClose: () => void;
}) {
  const slide = useRef(new Animated.Value(WIDTH)).current;
  useEffect(() => {
    Animated.timing(slide, { toValue: 0, duration: 240, useNativeDriver: false }).start();
  }, [slide]);

  const detail = useMemo(() => {
    const place = index.places.get(placeId);
    if (!place) return null;
    const residents = ancestorsAtPlace(index, placeId);
    const years = residents
      .flatMap((r) => r.events.map((e) => e.year))
      .filter((y): y is number => y !== null)
      .sort((a, b) => a - b);
    const eventCount = residents.reduce((n, r) => n + r.events.length, 0);
    return { place, residents, years, eventCount };
  }, [index, placeId]);

  if (!detail) return null;
  const { place, residents, years, eventCount } = detail;

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
              The place
            </RecordText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 20, color: C.inkMuted }}>✕</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: BrandFonts.serif.bold, fontSize: 25, color: C.ink, marginTop: 8 }}>
            {place.parts[0] ?? place.raw}
          </Text>
          <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13.5, color: C.inkMuted, marginTop: 3 }}>
            {place.raw}
          </Text>
          <RecordText style={{ marginTop: 8 }}>
            {residents.length} PEOPLE · {years[0] ?? '?'} – {years[years.length - 1] ?? '?'} · {eventCount} EVENTS
          </RecordText>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingTop: 14 }}>
          <RecordText eyebrow muted style={{ marginBottom: 4 }}>
            The people here
          </RecordText>
          {residents.map((resident, i) => (
            <Pressable
              key={resident.individual.id}
              onPress={() => {
                onClose();
                router.push({ pathname: '/ancestor/[id]', params: { id: resident.individual.id } });
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: 10,
                paddingVertical: 8,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: C.ruleLight,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontFamily: BrandFonts.serif.regular, fontSize: 16.5, color: C.ink }}
              >
                {resident.individual.full_name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
