import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { nearbyAncestors, type GeographyIndex, type NearbyPlace } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { getGeographyIndex } from '@/lib/geography-cache';
import { getRelationshipMap } from '@/lib/relationship-cache';
import { useTheme } from '@/hooks/use-theme';

/**
 * Web Nearby: same question as the native tab — who in your family has
 * history near where you are — answered with the browser's geolocation.
 * Radius presets replace the native log slider, and results stay a list;
 * the spatial view lives on the Map tab. Laptops geolocate by network,
 * so this is coarser than a phone in a cemetery — still enough to answer
 * "whose ground am I on?" from a desk.
 */

const MILES_TO_KM = 1.60934;
const RADII = [1, 5, 10, 25, 50, 100];

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
  theme,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? theme.accent : theme.backgroundElement,
        borderWidth: 1,
        borderColor: active ? theme.accent : theme.border,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 7,
      }}
    >
      <ThemedText type="small" style={{ color: active ? theme.onAccent : theme.text, fontWeight: 600 }}>
        {label}
      </ThemedText>
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
  const [radiusMiles, setRadiusMiles] = useState(5);
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
    if (!navigator.geolocation) {
      setDenied(true);
    } else {
      navigator.geolocation.getCurrentPosition(
        (location) => {
          if (!cancelled) {
            setPosition({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        },
        () => {
          if (!cancelled) setDenied(true);
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const nearby = useMemo(() => {
    if (!index || !position) return null;
    return nearbyAncestors(index, { ...position, radiusKm: radiusMiles * MILES_TO_KM });
  }, [index, position, radiusMiles]);

  const centuries = useMemo(() => (nearby ? centuriesOf(nearby) : []), [nearby]);

  const sections = useMemo(() => {
    if (!nearby) return [];
    return nearby
      .map((hit) => ({
        title: `${hit.place.parts[0] ?? hit.place.raw} · ${distanceLabel(hit.distanceKm)}`,
        placeId: hit.place.id,
        residents: hit.residents.filter(
          (resident) =>
            century === null ||
            resident.events.some((e) => e.year && Math.floor(e.year / 100) * 100 === century),
        ),
      }))
      .filter((section) => section.residents.length > 0);
  }, [nearby, century]);

  const totalPeople = useMemo(
    () => new Set(sections.flatMap((s) => s.residents.map((r) => r.individual.id))).size,
    [sections],
  );

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
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72, gap: 8 }}>
        {denied && (
          <ThemedText>
            Witness needs your location to find the ancestors around you — allow location access
            when your browser asks, then reload.
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
                ? `${totalPeople.toLocaleString()} of your family's people have history within ${radiusMiles} mi of you`
                : `No family places within ${radiusMiles} mi — widen the search`}
            </ThemedText>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {RADII.map((miles) => (
                <Chip
                  key={miles}
                  label={`${miles} mi`}
                  active={radiusMiles === miles}
                  theme={theme}
                  onPress={() => setRadiusMiles(miles)}
                />
              ))}
            </View>

            {centuries.length > 1 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[null, ...centuries].map((c) => (
                  <Chip
                    key={c ?? 'all'}
                    label={c === null ? 'All eras' : `${c}s`}
                    active={c === century}
                    theme={theme}
                    onPress={() => setCentury(c)}
                  />
                ))}
              </View>
            )}

            {sections.map((section) => (
              <View key={section.placeId} style={{ gap: 8 }}>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/place/[placeId]',
                      params: { placeId: section.placeId, treeId },
                    })
                  }
                >
                  <ThemedText type="subtitle" style={{ marginTop: 12 }}>
                    {section.title} <ThemedText type="link">›</ThemedText>
                  </ThemedText>
                </Pressable>
                {section.residents.map((item) => (
                  <Card
                    key={item.individual.id}
                    onPress={() =>
                      router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })
                    }
                  >
                    <ThemedText>{item.individual.full_name}</ThemedText>
                    {relationships.has(item.individual.id) && (
                      <ThemedText type="small">
                        your {relationships.get(item.individual.id)}
                      </ThemedText>
                    )}
                    <ThemedText type="small">
                      {item.events
                        .map((e) => `${e.eventType}${e.year ? ` ${e.year}` : ''}`)
                        .join(' · ')}
                    </ThemedText>
                  </Card>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}
