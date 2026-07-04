import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { placesWithActivity, type GeographyIndex } from '@witness/core/query';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';

const MAX_MARKERS = 300;

const ERAS: { label: string; range?: { startYear: number; endYear: number } }[] = [
  { label: 'All time' },
  { label: '1600s', range: { startYear: 1600, endYear: 1699 } },
  { label: '1700s', range: { startYear: 1700, endYear: 1799 } },
  { label: '1800s', range: { startYear: 1800, endYear: 1899 } },
  { label: '1900s', range: { startYear: 1900, endYear: 1999 } },
];

export default function AncestorMapScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [index, setIndex] = useState<GeographyIndex | null>(null);
  const [eraIndex, setEraIndex] = useState(0);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    getGeographyIndex(treeId).then((i) => {
      if (!cancelled) setIndex(i);
    });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const markers = useMemo(() => {
    if (!index) return [];
    return placesWithActivity(index, ERAS[eraIndex]?.range).slice(0, MAX_MARKERS);
  }, [index, eraIndex]);

  const initialRegion = useMemo(() => {
    if (!markers.length) {
      // New England, pending data.
      return { latitude: 42.5, longitude: -71.5, latitudeDelta: 8, longitudeDelta: 8 };
    }
    const top = markers.slice(0, 50);
    const lats = top.map((m) => m.place.latitude!);
    const lngs = top.map((m) => m.place.longitude!);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(1, (maxLat - minLat) * 1.4),
      longitudeDelta: Math.max(1, (maxLng - minLng) * 1.4),
    };
  }, [markers]);

  return (
    <ThemedView style={{ flex: 1 }}>
      {index === null ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <MapView key={eraIndex} style={{ flex: 1 }} initialRegion={initialRegion}>
          {markers.map(({ place, eventCount }) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude!, longitude: place.longitude! }}
              title={place.parts[0] ?? place.raw}
              description={`${eventCount} event${eventCount === 1 ? '' : 's'} — tap for ancestors`}
              tracksViewChanges={false}
              onCalloutPress={() =>
                router.push({ pathname: '/place/[placeId]', params: { placeId: place.id, treeId } })
              }
            />
          ))}
        </MapView>
      )}

      <View style={{ position: 'absolute', top: 60, left: 0, right: 0, gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ backgroundColor: '#1C1917', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <ThemedText style={{ color: '#F7F3EE' }}>‹ Back</ThemedText>
          </Pressable>
          {ERAS.map((era, i) => (
            <Pressable
              key={era.label}
              onPress={() => setEraIndex(i)}
              style={{
                backgroundColor: i === eraIndex ? '#B45309' : '#1C1917',
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <ThemedText style={{ color: '#F7F3EE' }}>{era.label}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
        {markers.length === MAX_MARKERS && (
          <ThemedText type="small" style={{ paddingHorizontal: 16 }}>
            Showing the {MAX_MARKERS} busiest places for this era.
          </ThemedText>
        )}
      </View>
    </ThemedView>
  );
}
