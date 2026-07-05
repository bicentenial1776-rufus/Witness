import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { nearbyAncestors, type GeographyIndex, type NearbyPlace } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { getGeographyIndex } from '@/lib/geography-cache';
import { getRelationshipMap } from '@/lib/relationship-cache';
import { useTheme } from '@/hooks/use-theme';

/**
 * Proximity: who in your family has history near where you're standing?
 * Distance is this tab's only dimension (eras live on the Map tab) —
 * radius chips in miles, results as a list or a map.
 */

const MILES_TO_KM = 1.60934;

const RADII = [1, 5, 10, 15, 25].map((miles) => ({
  label: `${miles} mi`,
  km: miles * MILES_TO_KM,
}));

function distanceLabel(km: number): string {
  const miles = km / MILES_TO_KM;
  return miles < 0.2 ? `${Math.round(miles * 5280)} ft` : `${miles.toFixed(1)} mi`;
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

function Chip({
  label,
  active,
  onPress,
  activeColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? activeColor : '#1C1917',
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 7,
      }}
    >
      <ThemedText style={{ color: '#F7F3EE' }}>{label}</ThemedText>
    </Pressable>
  );
}

export default function ProximityTab() {
  const theme = useTheme();
  const { activeTree } = useActiveTree();
  const treeId = activeTree?.id;
  const [index, setIndex] = useState<GeographyIndex | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [denied, setDenied] = useState(false);
  const [radiusIndex, setRadiusIndex] = useState(1);
  const [century, setCentury] = useState<number | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');

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
        placeId: hit.place.id,
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

  const radiusKm = RADII[radiusIndex]!.km;

  if (!treeId) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <ThemedText style={{ textAlign: 'center' }}>
          Import a tree to see who lived near you.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, padding: view === 'map' ? 0 : 24, paddingTop: view === 'map' ? 0 : 72, gap: 8 }}>
      {view === 'list' && (
        <>
          {denied && (
            <ThemedText>
              Witness needs your location to find the ancestors around you. Enable location access
              in Settings.
            </ThemedText>
          )}

          {!denied && (!index || !position) && (
            <View style={{ gap: 8, marginVertical: 8 }}>
              <ActivityIndicator />
              <ThemedText type="small">Finding where you are…</ThemedText>
            </View>
          )}
        </>
      )}

      {nearby && (
        <>
          {view === 'list' && (
            <ThemedText type="subtitle">
              {totalPeople > 0
                ? `${totalPeople.toLocaleString()} of your family's people have history within ${RADII[radiusIndex]!.label} of you`
                : `No family places within ${RADII[radiusIndex]!.label} — widen the search`}
            </ThemedText>
          )}

          <View
            style={
              view === 'map'
                ? { position: 'absolute', top: 60, left: 0, right: 0, zIndex: 1 }
                : undefined
            }
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: view === 'map' ? 16 : 0 }}
              style={{ flexGrow: 0 }}
            >
              <Chip
                label={view === 'list' ? 'Map' : 'List'}
                active={false}
                activeColor={theme.accent}
                onPress={() => setView(view === 'list' ? 'map' : 'list')}
              />
              {RADII.map((radius, i) => (
                <Chip
                  key={radius.label}
                  label={radius.label}
                  active={i === radiusIndex}
                  activeColor={theme.accent}
                  onPress={() => setRadiusIndex(i)}
                />
              ))}
            </ScrollView>
            {view === 'list' && centuries.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                style={{ flexGrow: 0, marginTop: 8 }}
              >
                {[null, ...centuries].map((c) => (
                  <Chip
                    key={c ?? 'all'}
                    label={c === null ? 'All eras' : `${c}s`}
                    active={c === century}
                    activeColor={theme.accent}
                    onPress={() => setCentury(c)}
                  />
                ))}
              </ScrollView>
            )}
          </View>

          {view === 'list' ? (
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
                <Card
                  onPress={() =>
                    router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })
                  }
                  style={{ marginTop: 8 }}
                >
                  <ThemedText>{item.individual.full_name}</ThemedText>
                  {relationships.has(item.individual.id) && (
                    <ThemedText type="small">your {relationships.get(item.individual.id)}</ThemedText>
                  )}
                  <ThemedText type="small">
                    {item.events.map((e) => `${e.eventType}${e.year ? ` ${e.year}` : ''}`).join(' · ')}
                  </ThemedText>
                </Card>
              )}
            />
          ) : (
            position && (
              <MapView
                style={{ flex: 1 }}
                mapType="mutedStandard"
                showsUserLocation
                initialRegion={{
                  ...position,
                  latitudeDelta: (radiusKm / 111) * 2.4,
                  longitudeDelta: (radiusKm / 111) * 2.4,
                }}
              >
                {nearby.map((hit) => (
                  <Marker
                    key={hit.place.id}
                    coordinate={{ latitude: hit.place.latitude!, longitude: hit.place.longitude! }}
                    title={hit.place.parts[0] ?? hit.place.raw}
                    description={`${hit.residents.length} ${hit.residents.length === 1 ? 'person' : 'people'} · ${distanceLabel(hit.distanceKm)} away · View them ›`}
                    tracksViewChanges={false}
                    onCalloutPress={() =>
                      router.push({ pathname: '/place/[placeId]', params: { placeId: hit.place.id, treeId } })
                    }
                  />
                ))}
              </MapView>
            )
          )}
        </>
      )}
    </ThemedView>
  );
}
