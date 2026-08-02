import { router, useFocusEffect } from 'expo-router';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, useColorScheme } from 'react-native';

import {
  ancestorsAtPlace,
  placesWithActivity,
  type GeographyIndex,
  type PlaceActivity,
} from '@witness/core/query';

import { RecordText } from '@/components/record-text';
import { Masthead, MarginPanel, PageShell, useBroadsheet } from '@/components/broadsheet';
import { PlaceDrawer } from '@/components/broadsheet/place-drawer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
import { getGeographyIndex, invalidateGeographyCache } from '@/lib/geography-cache';
import { Broadsheet, BrandFonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// MapLibre v6 spawns its tile worker from import.meta.url, which Metro's
// web bundle can't satisfy — the worker silently never starts and the map
// renders no tiles. The worker module (and the shared chunk it imports)
// are served from public/ instead, kept in sync by the postinstall script.
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

const C = Broadsheet.color;
const MAX_MARKERS = 300;

const ERAS: { label: string; range?: { startYear: number; endYear: number } }[] = [
  { label: 'All' },
  { label: '1600s', range: { startYear: 1600, endYear: 1699 } },
  { label: '1700s', range: { startYear: 1700, endYear: 1799 } },
  { label: '1800s', range: { startYear: 1800, endYear: 1899 } },
  { label: '1900s', range: { startYear: 1900, endYear: 1999 } },
];

const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** The tile-warming filter from the redesign — paper, not laboratory. */
const WARM_FILTER = 'sepia(.32) saturate(.72) contrast(.94) brightness(1.04)';

function useGeography(treeId: string | undefined) {
  const [index, setIndex] = useState<GeographyIndex | null>(null);
  const [progress, setProgress] = useState<{ placed: number; total: number; pending: number } | null>(null);
  const lastPlaced = useRef<number | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      if (!treeId) return;
      let cancelled = false;
      (async () => {
        const [{ count: total }, { count: placed }, { count: pending }] = await Promise.all([
          supabase.from('places').select('id', { count: 'exact', head: true }).eq('tree_id', treeId),
          supabase
            .from('places')
            .select('id', { count: 'exact', head: true })
            .eq('tree_id', treeId)
            .not('latitude', 'is', null),
          supabase
            .from('places')
            .select('id', { count: 'exact', head: true })
            .eq('tree_id', treeId)
            .is('geocoded_at', null),
        ]);
        if (cancelled || total === null || placed === null || pending === null) return;
        setProgress({ placed, total, pending });
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

  return { index, progress };
}

/** One MapLibre map bound to a marker set, selection-aware. */
function useAncestorMap(
  containerRef: React.RefObject<View | null>,
  ready: boolean,
  markers: PlaceActivity[],
  treeId: string | undefined,
  onSelect: (placeId: string) => void,
) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const scheme = useColorScheme();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!ready || mapRef.current) return;
    const container = containerRef.current as unknown as HTMLElement | null;
    if (!container) return;
    container.style.filter = WARM_FILTER;

    const map = new maplibregl.Map({
      container,
      style: scheme === 'dark' ? STYLE_DARK : STYLE_LIGHT,
      center: [-71.5, 42.5],
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      // Pin diameter 22 + 26·√(count/max) px (redesign §2), count printed
      // inside; place names label only the pins above ~35% of max.
      map.addLayer({
        id: 'places-circles',
        type: 'circle',
        source: 'places',
        paint: {
          'circle-color': C.accent,
          'circle-opacity': 0.92,
          'circle-radius': ['+', 11, ['*', 13, ['sqrt', ['/', ['get', 'count'], ['get', 'max']]]]],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FCFAF6',
        },
      });
      map.addLayer({
        id: 'places-counts',
        type: 'symbol',
        source: 'places',
        layout: {
          'text-field': ['to-string', ['get', 'count']],
          'text-size': 11,
          'text-font': ['Montserrat Regular', 'Open Sans Regular'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#FCFAF6' },
      });
      map.addLayer({
        id: 'places-labels',
        type: 'symbol',
        source: 'places',
        filter: ['>=', ['get', 'share'], 0.35],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Montserrat Regular', 'Open Sans Regular'],
          'text-offset': [0, 2.1],
          'text-anchor': 'top',
        },
        paint: { 'text-color': '#4A443B', 'text-halo-color': '#FCFAF6', 'text-halo-width': 1.2 },
      });
      map.on('mouseenter', 'places-circles', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'places-circles', () => (map.getCanvas().style.cursor = ''));
      map.on('click', 'places-circles', (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (feature) onSelectRef.current((feature.properties as { id: string }).id);
      });
      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !treeId) return;
    const source = map.getSource('places') as GeoJSONSource | undefined;
    if (!source) return;
    const max = Math.max(1, ...markers.map((m) => m.eventCount));
    source.setData({
      type: 'FeatureCollection',
      features: markers.map(({ place, eventCount }) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [place.longitude!, place.latitude!] },
        properties: {
          id: place.id,
          name: place.parts[0] ?? place.raw,
          count: eventCount,
          max,
          share: eventCount / max,
        },
      })),
    });
    if (markers.length) {
      const top = markers.slice(0, 50);
      const lngs = top.map((m) => m.place.longitude!);
      const lats = top.map((m) => m.place.latitude!);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 70, maxZoom: 11, duration: 800 },
      );
    }
  }, [markers, mapReady, treeId]);

  return mapRef;
}

export default function AncestorMapTab() {
  const broadsheet = useBroadsheet();
  const { activeTree, loadFailed } = useActiveTree();
  const treeId = activeTree?.id;
  const { index, progress } = useGeography(treeId);
  const [eraIndex, setEraIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const containerRef = useRef<View>(null);

  const markers = useMemo(() => {
    if (!index) return [];
    return placesWithActivity(index, ERAS[eraIndex]?.range).slice(0, MAX_MARKERS);
  }, [index, eraIndex]);

  const eraCounts = useMemo(() => {
    if (!index) return ERAS.map(() => 0);
    return ERAS.map((era) =>
      era.range
        ? index.events.filter(
            (e) => e.year !== null && e.year >= era.range!.startYear && e.year <= era.range!.endYear,
          ).length
        : index.events.length,
    );
  }, [index]);

  const mapRef = useAncestorMap(containerRef, Boolean(index), markers, treeId, setSelectedId);

  const selected = useMemo(() => {
    if (!index || !selectedId) return null;
    const place = index.places.get(selectedId);
    if (!place) return null;
    const residents = ancestorsAtPlace(index, selectedId);
    const years = residents
      .flatMap((r) => r.events.map((e) => e.year))
      .filter((y): y is number => y !== null)
      .sort((a, b) => a - b);
    const byEvents = [...residents].sort((a, b) => b.events.length - a.events.length);
    const eventCount = residents.reduce((n, r) => n + r.events.length, 0);
    const earliest = residents.find((r) => r.events.some((e) => e.year === years[0]));
    const latest = residents.find((r) => r.events.some((e) => e.year === years[years.length - 1]));
    return { place, residents, years, byEvents, eventCount, earliest, latest };
  }, [index, selectedId]);

  const selectFromLedger = (placeId: string) => {
    setSelectedId(placeId);
    const place = index?.places.get(placeId);
    if (place && place.longitude !== null && mapRef.current) {
      mapRef.current.flyTo({ center: [place.longitude, place.latitude!], zoom: 9, duration: 900 });
    }
  };

  if (!treeId) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <ThemedText style={{ textAlign: 'center' }}>
          {noTreeMessage(loadFailed, 'to see your family on the map')}
        </ThemedText>
      </ThemedView>
    );
  }

  if (!broadsheet) {
    // Narrow web keeps a plain full-bleed map with era chips.
    return (
      <ThemedView style={{ flex: 1 }}>
        {index === null ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : (
          <View ref={containerRef} style={{ flex: 1 }} />
        )}
        <View style={{ position: 'absolute', top: 60, left: 16, right: 16, flexDirection: 'row', gap: 8 }}>
          {ERAS.map((era, i) => (
            <Pressable
              key={era.label}
              onPress={() => setEraIndex(i)}
              style={{
                backgroundColor: eraIndex === i ? '#B45309' : '#FFFDF9',
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 7,
              }}
            >
              <Text style={{ color: eraIndex === i ? '#FFFDF9' : '#1C1917', fontSize: 14 }}>{era.label}</Text>
            </Pressable>
          ))}
        </View>
      </ThemedView>
    );
  }

  const placedPlaces = index ? [...index.places.values()].filter((p) => p.latitude !== null).length : 0;

  return (
    <>
    <PageShell
      masthead={
        <Masthead
          title="The Map"
          metaMono={index ? `${placedPlaces.toLocaleString()} PLACES · ${index.events.length.toLocaleString()} EVENTS` : ''}
          metaCaption={
            !progress
              ? 'Every located place in your tree'
              : progress.pending > 0
                ? `${progress.placed.toLocaleString()} of ${progress.total.toLocaleString()} places located so far`
                : 'All ancestors located.'
          }
        />
      }
      margin={
        <>
          <View>
            <RecordText eyebrow muted>
              Busiest places · {ERAS[eraIndex].label}
            </RecordText>
            {markers.slice(0, 9).map(({ place, eventCount }) => {
              const active = place.id === selectedId;
              return (
                <Pressable
                  key={place.id}
                  onPress={() => selectFromLedger(place.id)}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    paddingVertical: 8,
                    paddingLeft: 10,
                    borderLeftWidth: 3,
                    borderLeftColor: active ? C.accent : 'transparent',
                    backgroundColor: active ? C.paperRaised : 'transparent',
                    borderBottomWidth: 1,
                    borderBottomColor: C.ruleLight,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: BrandFonts.serif.regular,
                      fontSize: 17,
                      color: C.ink,
                      flexShrink: 1,
                    }}
                  >
                    {place.parts[0] ?? place.raw}
                  </Text>
                  <RecordText muted>{eventCount}</RecordText>
                </Pressable>
              );
            })}
          </View>
          {selected && (
            <View>
              <RecordText eyebrow accent>
                Selected place
              </RecordText>
              <Text style={{ fontFamily: BrandFonts.serif.bold, fontSize: 24, color: C.ink, marginTop: 6 }}>
                {selected.place.parts[0] ?? selected.place.raw}
              </Text>
              <RecordText muted style={{ marginTop: 4 }}>
                {selected.residents.length} PEOPLE · {selected.years[0] ?? '?'} – {selected.years[selected.years.length - 1] ?? '?'} · {selected.eventCount} EVENTS
              </RecordText>
              <View style={{ gap: 8, marginTop: 10 }}>
                {([
                  ['Earliest', selected.earliest],
                  ['Most recorded', selected.byEvents[0]],
                  ['Last recorded', selected.latest],
                ] as const).map(([label, resident]) =>
                  resident ? (
                    <View key={label}>
                      <RecordText eyebrow muted>{label}</RecordText>
                      <Text
                        style={{ fontFamily: BrandFonts.serif.regular, fontSize: 17, color: C.ink }}
                        onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: resident.individual.id } })}
                      >
                        {resident.individual.full_name}{' '}
                        <RecordText muted>
                          {resident.individual.birth_year ?? '?'} – {resident.individual.death_year ?? '?'}
                        </RecordText>
                      </Text>
                    </View>
                  ) : null,
                )}
              </View>
              <Text
                style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 14.5, color: C.accent, marginTop: 12 }}
                onPress={() => setDrawerOpen(true)}
              >
                The full record of this place →
              </Text>
            </View>
          )}
          <MarginPanel>
            <RecordText eyebrow muted>
              Reading the map
            </RecordText>
            <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14.5, color: C.inkSecondary }}>
              Pin size is how much recorded family life happened there; the number inside counts the
              events. Click any pin or ledger row for the place&rsquo;s full record.
            </Text>
          </MarginPanel>
        </>
      }
    >
      {/* Era band: inline text tabs, active underlined in orange. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 24, flexWrap: 'wrap' }}>
        {ERAS.map((era, i) => {
          const active = eraIndex === i;
          return (
            <Pressable key={era.label} onPress={() => setEraIndex(i)}>
              <View
                style={{
                  borderBottomWidth: 2,
                  borderBottomColor: active ? C.accent : 'transparent',
                  paddingBottom: 4,
                }}
              >
                <Text
                  style={{
                    fontFamily: active ? BrandFonts.sans.semiBold : BrandFonts.sans.regular,
                    fontSize: 16,
                    color: active ? C.ink : C.inkSecondary,
                  }}
                >
                  {era.label} <RecordText muted>{eraCounts[i]?.toLocaleString()}</RecordText>
                </Text>
              </View>
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        <RecordText muted>Pin size = life recorded there</RecordText>
      </View>

      {index === null ? (
        <ActivityIndicator style={{ marginVertical: 80 }} />
      ) : (
        <View
          ref={containerRef}
          style={{ height: 560, marginTop: 16, borderWidth: 1, borderColor: C.rule }}
        />
      )}

    </PageShell>
      {drawerOpen && selectedId && index && (
        <PlaceDrawer placeId={selectedId} treeId={treeId} index={index} onClose={() => setDrawerOpen(false)} />
      )}
    </>
  );
}
