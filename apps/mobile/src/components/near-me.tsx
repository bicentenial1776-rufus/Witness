import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, SectionList, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { tierInScope } from '@witness/core/family';
import {
  eventTypeLabel,
  eventTypesOf,
  nearbyAncestors,
  type GeoEventType,
  type GeographyIndex,
  type NearbyPlace,
} from '@witness/core/query';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { KinReveal } from '@/components/kin-reveal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
import { getGeographyIndex } from '@/lib/geography-cache';
import { getLineageScope } from '@/lib/lineage-scope';
import { getKinMap, getLineageTierMap, type Kin } from '@/lib/relationship-cache';
import { useTheme } from '@/hooks/use-theme';

/**
 * Near me: who in your family has history near where you're standing?
 * Distance is the only dimension here — a log-scaled radius slider, results
 * as a list or a map. Lived as the fifth tab ("Nearby") until 2026-08-08;
 * now a mode of the Map tab (walkthrough audit G4: the tabs were splitting
 * one question — "where?" — by which coordinate was held fixed). The
 * embedded list/map toggle survives because standing in a cemetery you
 * want the list; planning a drive you want the map. The road back to the
 * Map tab's PLACES mode rides in the control row as `onExit` — a floating
 * button collided with this row in map view (2026-08-23).
 */

const MILES_TO_KM = 1.60934;

/**
 * Log-scaled slider: half the track covers 1–10 miles (the cemetery and
 * town range where precision matters), the rest sweeps out to 100.
 */
const MAX_MILES = 100;
const milesFromT = (t: number) => Math.max(1, Math.round(MAX_MILES ** t));

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
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={6}
      style={{
        // Slimmed 2026-08-27 (Rufus: the filter stack ate the screen) —
        // the text keeps its Large Print size; only the padding thinned.
        backgroundColor: active ? activeColor : theme.text,
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <ThemedText type="small" style={{ color: theme.background }}>{label}</ThemedText>
    </Pressable>
  );
}

/** Hairline between chip groups in the single filter row. */
function ChipDivider() {
  const theme = useTheme();
  return <View style={{ width: 1, height: 18, backgroundColor: theme.border, alignSelf: 'center' }} />;
}

export function NearMe({ onExit }: { onExit?: () => void }) {
  const theme = useTheme();
  const { activeTree, loadFailed } = useActiveTree();
  const treeId = activeTree?.id;
  const [index, setIndex] = useState<GeographyIndex | null>(null);
  const [relationships, setRelationships] = useState<Map<string, Kin>>(new Map());
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  // The OS location dialog used to fire the instant this mounted, context-free.
  // Now: 'ask' renders a priming card whose button is what triggers the dialog,
  // and 'denied' offers the road back (Settings) instead of a dead sentence.
  const [permission, setPermission] = useState<'checking' | 'ask' | 'granted' | 'denied'>(
    'checking',
  );
  // t in [0,1] on a log track; live follows the finger, committed queries.
  const [liveT, setLiveT] = useState(Math.log(5) / Math.log(MAX_MILES));
  const [committedT, setCommittedT] = useState(Math.log(5) / Math.log(MAX_MILES));
  const [century, setCentury] = useState<number | null>(null);
  // Empty set = no filter. Multi-select: standing in a cemetery you want
  // Burial + Death together, not one at a time.
  const [eventTypes, setEventTypes] = useState<Set<GeoEventType>>(new Set());
  const [view, setView] = useState<'list' | 'map'>('list');
  // Ruth's question (2026-08-24): "am I seeing only people related to me?"
  // She wasn't — every geocoded event in radius showed. Now the default is
  // your own people, honoring the featuring scope (direct line vs all blood
  // from the You tab); Everyone is one tap away. null = the relationship
  // rows couldn't load (offline) — fail open and show everyone, unfiltered.
  const [familyIds, setFamilyIds] = useState<Set<string> | null>(null);
  const [kinship, setKinship] = useState<'family' | 'everyone'>('family');

  const liveMiles = milesFromT(liveT);
  const radiusMiles = milesFromT(committedT);
  const radiusKm = radiusMiles * MILES_TO_KM;

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    getGeographyIndex(treeId).then((i) => {
      if (!cancelled) setIndex(i);
    });
    getKinMap(treeId).then((map) => {
      if (!cancelled) setRelationships(map);
    });
    Promise.all([getLineageTierMap(treeId), getLineageScope()])
      .then(([tiers, scope]) => {
        if (cancelled) return;
        const ids = new Set<string>();
        for (const [pid, tier] of tiers) if (tierInScope(tier, scope)) ids.add(pid);
        setFamilyIds(ids);
      })
      .catch(() => {});
    (async () => {
      // Look, don't ask: only an already-granted permission proceeds here.
      // The request itself waits for the priming card's button.
      const current = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      if (current.granted) {
        setPermission('granted');
        locate();
      } else if (current.canAskAgain === false) {
        setPermission('denied');
      } else {
        setPermission('ask');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  async function locate() {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setPosition({ latitude: location.coords.latitude, longitude: location.coords.longitude });
  }

  async function requestAccess() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setPermission('granted');
      locate();
    } else {
      setPermission('denied');
    }
  }

  // The road back from a denial runs through the Settings app — when the
  // reader returns, notice a granted permission without being asked to tap
  // anything again.
  useEffect(() => {
    if (permission !== 'denied') return;
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const current = await Location.getForegroundPermissionsAsync();
      if (current.granted) {
        setPermission('granted');
        locate();
      }
    });
    return () => subscription.remove();
  }, [permission]);

  const nearby = useMemo(() => {
    if (!index || !position) return null;
    return nearbyAncestors(index, { ...position, radiusKm });
  }, [index, position, radiusKm]);

  const centuries = useMemo(() => (nearby ? centuriesOf(nearby) : []), [nearby]);
  const typesPresent = useMemo(() => (nearby ? eventTypesOf(nearby) : []), [nearby]);

  // One filtered view of the hits, shared by the list sections and the map
  // pins — a marker must never claim people the list would not show.
  const filteredNearby = useMemo(() => {
    if (!nearby) return null;
    return nearby
      .map((hit) => ({
        ...hit,
        residents: hit.residents.filter(
          (resident) =>
            (kinship === 'everyone' ||
              familyIds === null ||
              familyIds.has(resident.individual.id)) &&
            (century === null ||
              resident.events.some((e) => e.year && Math.floor(e.year / 100) * 100 === century)) &&
            (eventTypes.size === 0 ||
              resident.events.some((e) => eventTypes.has(e.eventType))),
        ),
      }))
      .filter((hit) => hit.residents.length > 0);
  }, [nearby, century, eventTypes, kinship, familyIds]);

  const sections = useMemo(() => {
    if (!filteredNearby) return [];
    return filteredNearby.map((hit) => ({
      title: `${hit.place.parts[0] ?? hit.place.raw} · ${distanceLabel(hit.distanceKm)}`,
      placeId: hit.place.id,
      data: hit.residents,
    }));
  }, [filteredNearby]);

  const toggleEventType = (type: GeoEventType) =>
    setEventTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const totalPeople = useMemo(
    () => new Set(sections.flatMap((s) => s.data.map((r) => r.individual.id))).size,
    [sections],
  );

  if (!treeId) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <ThemedText style={{ textAlign: 'center' }}>
          {noTreeMessage(loadFailed, 'to see who lived near you')}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, padding: view === 'map' ? 0 : 24, paddingTop: view === 'map' ? 0 : 116, gap: 8 }}>
      {view === 'list' && (
        <>
          {permission === 'ask' && (
            <Card style={{ gap: 10 }}>
              <ThemedText type="subtitle">Who lived near where you’re standing?</ThemedText>
              <ThemedText type="small">
                Witness compares your location against the places already in your tree, on this
                device. Your location isn’t stored and isn’t sent anywhere.
              </ThemedText>
              <Button title="Show who’s near me" onPress={requestAccess} />
            </Card>
          )}

          {permission === 'denied' && (
            <Card style={{ gap: 10 }}>
              <ThemedText>
                Witness needs your location to find the ancestors around you — and location access
                is currently off for Witness.
              </ThemedText>
              <Button
                title="Open Settings"
                variant="secondary"
                onPress={() => Linking.openSettings().catch(() => {})}
              />
              <ThemedText type="small">
                Turn it on there and this screen picks up where you left it. The rest of Witness
                never uses your location.
              </ThemedText>
            </Card>
          )}

          {permission === 'granted' && (!index || !position) && (
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
                ? `${totalPeople.toLocaleString()} of your family's people have history within ${radiusMiles} mi of you`
                : kinship === 'family' && nearby.length > 0
                  ? `No relatives within ${radiusMiles} mi — Everyone shows the rest of the tree`
                  : `No family places within ${radiusMiles} mi — widen the search`}
            </ThemedText>
          )}

          <View
            style={
              view === 'map'
                ? { position: 'absolute', top: 60, left: 0, right: 0, zIndex: 1 }
                : undefined
            }
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: view === 'map' ? 16 : 0,
              }}
            >
              {onExit && (
                <Chip label="All places" active={false} activeColor={theme.accent} onPress={onExit} />
              )}
              <Chip
                label={view === 'list' ? 'Map' : 'List'}
                active={false}
                activeColor={theme.accent}
                onPress={() => setView(view === 'list' ? 'map' : 'list')}
              />
              {/* Standing at a stone that isn't in the list: capture it. */}
              <Chip
                label="At the stone"
                active={false}
                activeColor={theme.accent}
                onPress={() => router.push('/at-the-stone')}
              />
            </View>
            {/* The slider owns a full row — sharing one with the chips left
                a stub of a track on small phones. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginTop: 8,
                paddingHorizontal: view === 'map' ? 16 : 0,
              }}
            >
              <Slider
                style={{ flex: 1 }}
                minimumValue={0}
                maximumValue={1}
                value={committedT}
                onValueChange={setLiveT}
                onSlidingComplete={(t) => {
                  setLiveT(t);
                  setCommittedT(t);
                }}
                minimumTrackTintColor={theme.accent}
              />
              <View
                style={{
                  backgroundColor: view === 'map' ? theme.text : theme.backgroundElement,
                  borderRadius: 12,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  minWidth: 62,
                  alignItems: 'center',
                }}
              >
                <ThemedText
                  type="smallBold"
                  style={{ color: view === 'map' ? theme.background : theme.text }}
                >
                  {liveMiles} mi
                </ThemedText>
              </View>
            </View>
            {/* One filter row (2026-08-27: three stacked rows ate the
                screen). Kinship, era, and event chips share a single
                horizontal scroll, hairlines between the groups. Who
                counts stays your own people by default (Ruth's question,
                2026-08-24); the pair only appears when the relationship
                rows loaded. */}
            {view === 'list' &&
              ((familyIds !== null && familyIds.size > 0) ||
                centuries.length > 1 ||
                typesPresent.length > 1) && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, alignItems: 'center' }}
                  style={{ flexGrow: 0, marginTop: 8 }}
                >
                  {familyIds !== null && familyIds.size > 0 && (
                    <>
                      <Chip
                        label="Your family"
                        active={kinship === 'family'}
                        activeColor={theme.accent}
                        onPress={() => setKinship('family')}
                      />
                      <Chip
                        label="Everyone"
                        active={kinship === 'everyone'}
                        activeColor={theme.accent}
                        onPress={() => setKinship('everyone')}
                      />
                    </>
                  )}
                  {familyIds !== null && familyIds.size > 0 && centuries.length > 1 && (
                    <ChipDivider />
                  )}
                  {centuries.length > 1 &&
                    [null, ...centuries].map((c) => (
                      <Chip
                        key={c ?? 'all-eras'}
                        label={c === null ? 'All eras' : `${c}s`}
                        active={c === century}
                        activeColor={theme.accent}
                        onPress={() => setCentury(c)}
                      />
                    ))}
                  {typesPresent.length > 1 &&
                    ((familyIds !== null && familyIds.size > 0) || centuries.length > 1) && (
                      <ChipDivider />
                    )}
                  {typesPresent.length > 1 && (
                    <>
                      <Chip
                        label="All events"
                        active={eventTypes.size === 0}
                        activeColor={theme.accent}
                        onPress={() => setEventTypes(new Set())}
                      />
                      {typesPresent.map((type) => (
                        <Chip
                          key={type}
                          label={eventTypeLabel(type)}
                          active={eventTypes.has(type)}
                          activeColor={theme.accent}
                          onPress={() => toggleEventType(type)}
                        />
                      ))}
                    </>
                  )}
                </ScrollView>
              )}
          </View>

          {view === 'list' ? (
            <SectionList
              sections={sections}
              keyExtractor={(resident, i) => `${resident.individual.id}-${i}`}
              // Headers are bare text on paper — pinned ones float over the
              // cards mid-scroll. Let each stay with its own section.
              stickySectionHeadersEnabled={false}
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
                    <KinReveal
                      tier={relationships.get(item.individual.id)!.tier}
                      label={relationships.get(item.individual.id)!.label}
                    />
                  )}
                  <ThemedText type="small">
                    {item.events
                      .map((e) => `${eventTypeLabel(e.eventType)}${e.year ? ` ${e.year}` : ''}`)
                      .join(' · ')}
                  </ThemedText>
                  {index?.graveLinks.has(item.individual.id) && (
                    <ThemedText
                      type="link"
                      onPress={() => Linking.openURL(index.graveLinks.get(item.individual.id)!)}
                    >
                      Find A Grave ›
                    </ThemedText>
                  )}
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
                {(filteredNearby ?? []).map((hit) => (
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
