import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, View } from 'react-native';

import { nearbyAncestors, type GeographyIndex, type NearbyPlace } from '@witness/core/query';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';
import { getRelationshipMap } from '@/lib/relationship-cache';

const RADII = [
  { label: '500 m', km: 0.5 },
  { label: '2 km', km: 2 },
  { label: '10 km', km: 10 },
  { label: '50 km', km: 50 },
];

function distanceLabel(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Century tabs derived from the events actually found nearby. */
function centuriesOf(places: NearbyPlace[]): number[] {
  const centuries = new Set<number>();
  for (const hit of places) {
    for (const resident of hit.residents) {
      for (const event of resident.events) {
        if (event.year) centuries.add(Math.floor(event.year / 100) * 100);
      }
    }
  }
  return [...centuries].sort((a, b) => a - b);
}

export default function ImHereScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [index, setIndex] = useState<GeographyIndex | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [denied, setDenied] = useState(false);
  const [radiusIndex, setRadiusIndex] = useState(1);
  const [century, setCentury] = useState<number | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    getGeographyIndex(treeId).then((i) => {
      if (!cancelled) setIndex(i);
    });
    getRelationshipMap(treeId).then((map) => {
      if (!cancelled) setRelationships(map);
    });
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) setDenied(true);
        return;
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!cancelled) {
        setPosition({ latitude: location.coords.latitude, longitude: location.coords.longitude });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const nearby = useMemo(() => {
    if (!index || !position) return null;
    return nearbyAncestors(index, { ...position, radiusKm: RADII[radiusIndex]!.km });
  }, [index, position, radiusIndex]);

  const centuries = useMemo(() => (nearby ? centuriesOf(nearby) : []), [nearby]);

  const sections = useMemo(() => {
    if (!nearby) return [];
    return nearby
      .map((hit) => ({
        title: `${hit.place.parts[0] ?? hit.place.raw} · ${distanceLabel(hit.distanceKm)}`,
        data: hit.residents.filter(
          (resident) =>
            century === null ||
            resident.events.some((e) => e.year && Math.floor(e.year / 100) * 100 === century),
        ),
      }))
      .filter((section) => section.data.length > 0);
  }, [nearby, century]);

  const totalPeople = useMemo(
    () => new Set(sections.flatMap((s) => s.data.map((r) => r.individual.id))).size,
    [sections],
  );

  return (
    <ThemedView style={{ flex: 1, padding: 24, paddingTop: 72, gap: 8 }}>
      <Pressable onPress={() => router.back()}>
        <ThemedText type="link">‹ Back</ThemedText>
      </Pressable>
      <ThemedText type="title">I'm here</ThemedText>

      {denied && (
        <ThemedText>
          Witness needs your location to find the ancestors around you. Enable location access in
          Settings.
        </ThemedText>
      )}

      {!denied && (!index || !position) && (
        <View style={{ gap: 8, marginVertical: 8 }}>
          <ActivityIndicator />
          <ThemedText type="small">Finding where you are…</ThemedText>
        </View>
      )}

      {nearby && (
        <>
          <ThemedText type="subtitle">
            {totalPeople > 0
              ? `${totalPeople.toLocaleString()} of your family's people have history within ${RADII[radiusIndex]!.label} of you`
              : `No family places within ${RADII[radiusIndex]!.label} — widen the search`}
          </ThemedText>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
            {RADII.map((radius, i) => (
              <Pressable
                key={radius.label}
                onPress={() => setRadiusIndex(i)}
                style={{
                  backgroundColor: i === radiusIndex ? '#B45309' : '#1C1917',
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <ThemedText style={{ color: '#F7F3EE' }}>{radius.label}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          {centuries.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
              {[null, ...centuries].map((c) => (
                <Pressable
                  key={c ?? 'all'}
                  onPress={() => setCentury(c)}
                  style={{
                    backgroundColor: c === century ? '#B45309' : '#1C1917',
                    borderRadius: 16,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <ThemedText style={{ color: '#F7F3EE' }}>{c === null ? 'All eras' : `${c}s`}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <SectionList
            sections={sections}
            keyExtractor={(resident, i) => `${resident.individual.id}-${i}`}
            style={{ marginTop: 8 }}
            renderSectionHeader={({ section }) => (
              <ThemedText type="subtitle" style={{ marginTop: 12 }}>
                {section.title}
              </ThemedText>
            )}
            renderItem={({ item }) => (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })
                }
                style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, marginTop: 8, gap: 2 }}
              >
                <ThemedText>{item.individual.full_name}</ThemedText>
                {relationships.has(item.individual.id) && (
                  <ThemedText type="small">your {relationships.get(item.individual.id)}</ThemedText>
                )}
                <ThemedText type="small">
                  {item.events.map((e) => `${e.eventType}${e.year ? ` ${e.year}` : ''}`).join(' · ')}
                </ThemedText>
              </Pressable>
            )}
          />
        </>
      )}
    </ThemedView>
  );
}
