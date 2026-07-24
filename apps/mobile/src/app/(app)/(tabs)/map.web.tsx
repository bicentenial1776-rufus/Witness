import { router, useFocusEffect } from 'expo-router';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';

// MapLibre v6 spawns its tile worker from import.meta.url, which Metro's
// web bundle can't satisfy — the worker silently never starts and the map
// renders no tiles. The worker module (and the shared chunk it imports)
// are served from public/ instead, kept in sync by the postinstall script.
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View, useColorScheme } from 'react-native';

import { placesWithActivity, type GeographyIndex } from '@witness/core/query';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { getGeographyIndex, invalidateGeographyCache } from '@/lib/geography-cache';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

/**
 * Web Ancestor Map (WEB_APP_DESIGN.md §5, Phase B): MapLibre GL over
 * CARTO's free basemaps (attribution required, no key), same geography
 * index and era filter as the native tab. Markers render as one GeoJSON
 * circle layer — hundreds of places stay cheap — sized by how much family
 * life happened there; clicking opens a popup that links into the place
 * screen. Satellite view stays native-only for now.
 */

const MAX_MARKERS = 300;
const AMBER = '#B45309';

const ERAS: { label: string; range?: { startYear: number; endYear: number } }[] = [
  { label: 'All' },
  { label: '1600s', range: { startYear: 1600, endYear: 1699 } },
  { label: '1700s', range: { startYear: 1700, endYear: 1799 } },
  { label: '1800s', range: { startYear: 1800, endYear: 1899 } },
  { label: '1900s', range: { startYear: 1900, endYear: 1999 } },
];

const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export default function AncestorMapTab() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { activeTree } = useActiveTree();
  const treeId = activeTree?.id;
  const [index, setIndex] = useState<GeographyIndex | null>(null);
  const [eraIndex, setEraIndex] = useState(0);
  const [progress, setProgress] = useState<{ placed: number; total: number } | null>(null);
  const lastPlaced = useRef<number | null>(null);
  const containerRef = useRef<View>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

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

  // Mount the map once the container exists (react-native-web refs are the
  // underlying DOM elements).
  useEffect(() => {
    if (!treeId || index === null || mapRef.current) return;
    const container = containerRef.current as unknown as HTMLElement | null;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: scheme === 'dark' ? STYLE_DARK : STYLE_LIGHT,
      center: [-71.5, 42.5], // New England, pending data
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'places-circles',
        type: 'circle',
        source: 'places',
        paint: {
          'circle-color': AMBER,
          'circle-opacity': 0.85,
          'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 5, 25, 9, 100, 13],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#F7F3EE',
        },
      });
      map.on('mouseenter', 'places-circles', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'places-circles', () => (map.getCanvas().style.cursor = ''));
      map.on('click', 'places-circles', (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const { id, name, count, tree } = feature.properties as {
          id: string;
          name: string;
          count: number;
          tree: string;
        };
        const popup = new maplibregl.Popup({ offset: 12 })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family: Inter, sans-serif; max-width: 220px;">
              <div style="font-weight:600; margin-bottom:2px;">${name}</div>
              <div style="color:#57534E; font-size:12px;">${count} event${count === 1 ? '' : 's'}</div>
              <a data-place style="color:${AMBER}; font-size:13px; cursor:pointer;">View the ancestors here ›</a>
            </div>`,
          )
          .addTo(map);
        popup
          .getElement()
          .querySelector('[data-place]')
          ?.addEventListener('click', () =>
            router.push({ pathname: '/place/[placeId]', params: { placeId: id, treeId: tree } }),
          );
      });
      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The basemap style is chosen at mount; a live theme flip re-renders on
    // next visit rather than restyling a live map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeId, index === null]);

  // Feed the circle layer and reframe whenever the marker set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !treeId) return;
    const source = map.getSource('places') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: markers.map(({ place, eventCount }) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [place.longitude!, place.latitude!] },
        properties: {
          id: place.id,
          name: place.parts[0] ?? place.raw,
          count: eventCount,
          tree: treeId,
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
        { padding: { top: 140, right: 60, bottom: 80, left: 60 }, maxZoom: 11, duration: 800 },
      );
    }
  }, [markers, mapReady, treeId]);

  if (!treeId) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <ThemedText style={{ textAlign: 'center' }}>
          Import a tree to see your family on the map.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      {index === null ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <View ref={containerRef} style={{ flex: 1 }} />
      )}

      <View style={{ position: 'absolute', top: 60, left: 0, right: 0, gap: 8, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {ERAS.map((era, i) => {
            const active = eraIndex === i;
            return (
              <Pressable
                key={era.label}
                onPress={() => setEraIndex(i)}
                style={{
                  backgroundColor: active ? theme.accent : theme.backgroundElement,
                  borderWidth: 1,
                  borderColor: active ? theme.accent : theme.border,
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                }}
              >
                <ThemedText
                  type="small"
                  style={{ color: active ? theme.onAccent : theme.text, fontWeight: 600 }}
                >
                  {era.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        {progress && progress.placed < progress.total && (
          <View
            style={{
              backgroundColor: theme.backgroundElement,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
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
        {markers.length === MAX_MARKERS && (
          <ThemedText type="small">Showing the {MAX_MARKERS} busiest places for this era.</ThemedText>
        )}
      </View>
    </ThemedView>
  );
}
