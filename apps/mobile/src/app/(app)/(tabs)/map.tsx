import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import MapView, { Marker, type MapType } from 'react-native-maps';

import { placesWithActivity, type GeographyIndex } from '@witness/core/query';

import { NearMe } from '@/components/near-me';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
import { getGeographyIndex, invalidateGeographyCache } from '@/lib/geography-cache';
import { useTheme } from '@/hooks/use-theme';
import { fetchRecordMapPoints, type RecordMapPoint } from '@/lib/register-points';
import { supabase } from '@/lib/supabase';

const MAX_MARKERS = 300;

const ERAS: { label: string; range?: { startYear: number; endYear: number } }[] = [
  { label: 'All' },
  { label: '1600s', range: { startYear: 1600, endYear: 1699 } },
  { label: '1700s', range: { startYear: 1700, endYear: 1799 } },
  { label: '1800s', range: { startYear: 1800, endYear: 1899 } },
  { label: '1900s', range: { startYear: 1900, endYear: 1999 } },
];

export default function AncestorMapTab() {
  const theme = useTheme();
  const { activeTree, loadFailed } = useActiveTree();
  const treeId = activeTree?.id;
  const [index, setIndex] = useState<GeographyIndex | null>(null);
  // The record books' points — confirmed register links with a geocode
  // (a veterans' cemetery, a land parcel). A second, quieter marker set
  // beside the tree's own places; refreshed on every focus since a
  // confirm on the Portrait is what creates them.
  const [recordPoints, setRecordPoints] = useState<RecordMapPoint[]>([]);
  const [eraIndex, setEraIndex] = useState(0);
  // Apple Maps: full color styling isn't customizable, but mutedStandard
  // is the desaturated cartography that suits the brand; hybrid = satellite
  // with labels.
  const [mapType, setMapType] = useState<MapType>('mutedStandard');
  // PLACES roams the whole tree; NEAR ME fixes your position and asks who
  // was around you (the former Nearby tab — audit G4). One question, two
  // grips on it, one tab.
  const [mode, setMode] = useState<'places' | 'near'>('places');
  const [progress, setProgress] = useState<{ placed: number; total: number } | null>(null);
  const lastPlaced = useRef<number | null>(null);
  const mapRef = useRef<MapView>(null);

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

  // Geocoding runs server-side for hours after an import. Each visit checks
  // how far along the tree is; when new places have landed since last look,
  // the cached index is stale — refetch so the new pins actually show.
  useFocusEffect(
    useCallback(() => {
      if (!treeId) return;
      let cancelled = false;
      fetchRecordMapPoints(treeId).then((points) => {
        if (!cancelled) setRecordPoints(points);
      });
      (async () => {
        const [{ count: total }, { count: placed }] = await Promise.all([
          supabase.from('places').select('id', { count: 'exact', head: true }).eq('tree_id', treeId),
          supabase
            .from('places')
            .select('id', { count: 'exact', head: true })
            .eq('tree_id', treeId)
            .not('latitude', 'is', null),
        ]);
        if (cancelled || total === null || placed === null) return;
        setProgress({ placed, total });
        if (lastPlaced.current !== null && placed > lastPlaced.current) {
          invalidateGeographyCache();
          const fresh = await getGeographyIndex(treeId);
          if (!cancelled) setIndex(fresh);
        }
        lastPlaced.current = placed;
      })();
      return () => {
        cancelled = true;
      };
    }, [treeId]),
  );

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
      latitudeDelta: Math.max(0.05, (maxLat - minLat) * 1.3),
      longitudeDelta: Math.max(0.05, (maxLng - minLng) * 1.3),
    };
  }, [markers]);

  // Reframe (animated) when the era changes instead of remounting the map.
  useEffect(() => {
    if (!markers.length) return;
    mapRef.current?.fitToCoordinates(
      markers.slice(0, 50).map((m) => ({ latitude: m.place.latitude!, longitude: m.place.longitude! })),
      { edgePadding: { top: 140, right: 60, bottom: 80, left: 60 }, animated: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eraIndex, index]);

  if (!treeId) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <ThemedText style={{ textAlign: 'center' }}>
          {noTreeMessage(loadFailed, 'to see your family on the map')}
        </ThemedText>
      </ThemedView>
    );
  }

  if (mode === 'near') {
    return <NearMe onExit={() => setMode('places')} />;
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      {index === null ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={initialRegion} mapType={mapType}>
          {markers.map(({ place, eventCount }) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude!, longitude: place.longitude! }}
              title={place.parts[0] ?? place.raw}
              description={`${eventCount} event${eventCount === 1 ? '' : 's'} · View the ancestors here ›`}
              tracksViewChanges={false}
              onCalloutPress={() =>
                router.push({ pathname: '/place/[placeId]', params: { placeId: place.id, treeId } })
              }
            />
          ))}
          {recordPoints.map((point, i) => (
            <Marker
              key={`${point.linkId ?? point.registerKey}:${i}`}
              coordinate={{ latitude: point.latitude, longitude: point.longitude }}
              // A person's own record (a grave, a parcel) in amber; a
              // regiment's engagement — the unit was here, he probably was —
              // in ink, so the two never read as the same claim.
              pinColor={point.kind === 'entity' ? theme.text : theme.accent}
              title={point.kind === 'entity' && point.recordName ? `${point.personName} — ${point.recordName}` : point.personName}
              description={`${point.label} · ${point.kind === 'entity' ? 'His regiment was here' : 'From the record books'} ›`}
              tracksViewChanges={false}
              onCalloutPress={() => {
                if (point.individualId) router.push({ pathname: '/ancestor/[id]', params: { id: point.individualId } });
              }}
            />
          ))}
        </MapView>
      )}

      <View style={{ position: 'absolute', top: 60, left: 0, right: 0, gap: 8, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SegmentedControl
            style={{ flex: 1 }}
            values={ERAS.map((era) => era.label)}
            selectedIndex={eraIndex}
            onChange={(event) => setEraIndex(event.nativeEvent.selectedSegmentIndex)}
          />
          <Pressable
            onPress={() => setMode('near')}
            style={{
              backgroundColor: theme.text,
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <ThemedText type="small" style={{ color: theme.background }}>Near me</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setMapType(mapType === 'hybrid' ? 'mutedStandard' : 'hybrid')}
            style={{
              backgroundColor: mapType === 'hybrid' ? theme.accent : theme.text,
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <ThemedText type="small" style={{ color: theme.background }}>Sat</ThemedText>
          </Pressable>
        </View>
        {progress && progress.placed < progress.total && (
          <View
            style={{
              backgroundColor: theme.backgroundElement,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <ThemedText type="small">
              Mapping your family&rsquo;s places — {progress.placed.toLocaleString()} of{' '}
              {progress.total.toLocaleString()} placed so far. More appear as they&rsquo;re found.
            </ThemedText>
          </View>
        )}
        {/* A tree with no place rows at all would otherwise show an empty map
            of New England with no explanation (the progress banner needs
            total > 0 to have anything to count). */}
        {progress && progress.total === 0 && (
          <View
            style={{
              backgroundColor: theme.backgroundElement,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <ThemedText type="small">
              No places are recorded in this tree — the map lights up when your GEDCOM carries
              where things happened.
            </ThemedText>
          </View>
        )}
        {markers.length === MAX_MARKERS && (
          <ThemedText type="small">
            Showing the {MAX_MARKERS} busiest places for this era.
          </ThemedText>
        )}
      </View>
    </ThemedView>
  );
}
