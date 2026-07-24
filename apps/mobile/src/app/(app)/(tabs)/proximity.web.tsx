import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { nearbyAncestors, type GeographyIndex, type NearbyPlace } from '@witness/core/query';

import { Masthead, MarginPanel, PageShell, useBroadsheet } from '@/components/broadsheet';
import { Card } from '@/components/card';
import { RecordText } from '@/components/record-text';
import { Broadsheet, BrandFonts } from '@/constants/theme';
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

  const broadsheet = useBroadsheet();
  const [town, setTown] = useState<string | null>(null);

  // Name where the reader is standing — one reverse geocode per position.
  useEffect(() => {
    if (!broadsheet || !position) return;
    let cancelled = false;
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${position.latitude}&lon=${position.longitude}&format=jsonv2&zoom=10`,
      { headers: { 'User-Agent': 'Witness/1.0 (family history app; witnesslives.com)' } },
    )
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const a = d?.address ?? {};
        const name = a.city ?? a.town ?? a.village ?? a.county ?? null;
        setTown(name && a.state ? `${name}, ${a.state}` : name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [broadsheet, position?.latitude, position?.longitude]);

  // Grouped by town, nearest first — never repeat a town heading per person.
  const towns = useMemo(() => {
    const byTown = new Map<
      string,
      { town: string; distanceKm: number; placeId: string; residents: (typeof sections)[number]['residents'] }
    >();
    for (const section of sections) {
      const townName = section.title.split(' · ')[0]!;
      const distanceKm =
        nearby?.find((h) => h.place.id === section.placeId)?.distanceKm ?? Number.MAX_VALUE;
      const existing = byTown.get(townName);
      if (existing) {
        existing.residents = [...existing.residents, ...section.residents];
        existing.distanceKm = Math.min(existing.distanceKm, distanceKm);
      } else {
        byTown.set(townName, { town: townName, distanceKm, placeId: section.placeId, residents: [...section.residents] });
      }
    }
    return [...byTown.values()].sort((a, b) => a.distanceKm - b.distanceKm);
  }, [sections, nearby]);

  const closest = useMemo(() => {
    const hit = nearby?.[0];
    if (!hit || !hit.residents[0] || !position) return null;
    const dLat = hit.place.latitude! - position.latitude;
    const dLng = hit.place.longitude! - position.longitude;
    const angle = (Math.atan2(dLng, dLat) * 180) / Math.PI;
    const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    const direction = directions[Math.round(((angle + 360) % 360) / 45) % 8];
    const miles = hit.distanceKm / MILES_TO_KM;
    return {
      resident: hit.residents[0],
      place: hit.place,
      phrase:
        miles < 0.5
          ? 'right where you are standing'
          : `about ${miles < 10 ? miles.toFixed(1) : Math.round(miles)} miles ${direction} of you`,
    };
  }, [nearby, position]);

  const BC = Broadsheet.color;

  if (broadsheet && treeId) {
    return (
      <PageShell
        masthead={
          <Masthead
            title="Nearby"
            metaMono={town ? `FROM ${town.toUpperCase()}` : 'FROM WHERE YOU ARE'}
            metaCaption={
              nearby ? `${towns.length} ${towns.length === 1 ? 'town' : 'towns'} within ${radiusMiles} mi` : undefined
            }
          />
        }
        margin={
          closest ? (
            <MarginPanel>
              <RecordText eyebrow muted>
                Closest of all
              </RecordText>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: closest.resident.individual.id } })
                }
              >
                <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 20, color: BC.ink }}>
                  {closest.resident.individual.full_name}
                </Text>
              </Pressable>
              <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14.5, color: BC.inkSecondary }}>
                {closest.resident.events[0]?.eventType ?? 'recorded'}
                {closest.resident.events[0]?.year ? ` ${closest.resident.events[0].year}` : ''} at{' '}
                {closest.place.parts[0] ?? closest.place.raw} — {closest.phrase}.
              </Text>
            </MarginPanel>
          ) : undefined
        }
      >
        {denied && (
          <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 17, color: BC.inkSecondary }}>
            Witness needs your location to find the ancestors around you — allow location access
            when your browser asks, then reload.
          </Text>
        )}
        {!denied && (!index || !position) && <ActivityIndicator style={{ marginVertical: 40 }} />}

        {nearby && (
          <>
            <Text
              style={{
                fontFamily: BrandFonts.serif.bold,
                fontSize: 40,
                lineHeight: 52,
                color: BC.ink,
                maxWidth: 700,
              }}
            >
              <Text style={{ color: BC.accent }}>{totalPeople.toLocaleString()}</Text> of your
              family&rsquo;s people left records within{' '}
              <Text style={{ color: BC.accent }}>{radiusMiles} miles</Text> of where you are.
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 22, marginTop: 18 }}>
              <RecordText eyebrow muted>
                Radius
              </RecordText>
              {RADII.map((miles) => {
                const active = radiusMiles === miles;
                return (
                  <Pressable key={miles} onPress={() => setRadiusMiles(miles)}>
                    <View
                      style={{
                        borderBottomWidth: 2,
                        borderBottomColor: active ? BC.accent : 'transparent',
                        paddingBottom: 3,
                      }}
                    >
                      <RecordText accent={active} muted={!active}>
                        {miles} MI
                      </RecordText>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {towns.map((group) => (
              <View key={group.town} style={{ marginTop: 30 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 14 }}>
                  <Text
                    style={{ fontFamily: BrandFonts.serif.regular, fontSize: 25, color: BC.ink }}
                    onPress={() =>
                      router.push({ pathname: '/place/[placeId]', params: { placeId: group.placeId, treeId } })
                    }
                  >
                    {group.town}
                  </Text>
                  <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: BC.rule }} />
                  <RecordText muted>
                    {(group.distanceKm / MILES_TO_KM).toFixed(1)} MI ·{' '}
                    {new Set(group.residents.map((r) => r.individual.id)).size} PEOPLE
                  </RecordText>
                </View>
                {group.residents.slice(0, 5).map((resident) => (
                  <Pressable
                    key={resident.individual.id}
                    onPress={() =>
                      router.push({ pathname: '/ancestor/[id]', params: { id: resident.individual.id } })
                    }
                    style={{
                      flexDirection: 'row',
                      alignItems: 'baseline',
                      paddingVertical: 9,
                      borderBottomWidth: 1,
                      borderBottomColor: BC.ruleLight,
                      gap: 12,
                    }}
                  >
                    <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 18, color: BC.ink }}>
                      {resident.individual.full_name}
                    </Text>
                    {relationships.has(resident.individual.id) && (
                      <Text style={{ fontFamily: BrandFonts.serif.italic, fontSize: 15, color: BC.inkMuted }}>
                        your {relationships.get(resident.individual.id)}
                      </Text>
                    )}
                    <View style={{ flex: 1 }} />
                    <RecordText muted>
                      {resident.events[0]?.eventType?.toUpperCase() ?? ''}{' '}
                      {resident.events[0]?.year ?? ''}
                    </RecordText>
                  </Pressable>
                ))}
                {group.residents.length > 5 && (
                  <Text
                    style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 14.5, color: BC.accent, marginTop: 8 }}
                    onPress={() =>
                      router.push({ pathname: '/place/[placeId]', params: { placeId: group.placeId, treeId } })
                    }
                  >
                    {group.residents.length - 5} more in {group.town} →
                  </Text>
                )}
              </View>
            ))}
            {towns.length === 0 && (
              <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 17, color: BC.inkMuted, marginTop: 24 }}>
                No family places within {radiusMiles} miles — widen the radius.
              </Text>
            )}
          </>
        )}
      </PageShell>
    );
  }

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
