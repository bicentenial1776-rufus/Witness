import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { View, useColorScheme } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import type { SanbornOverlay } from './sanborn-overlay-map';
export type { SanbornOverlay } from './sanborn-overlay-map';

maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/**
 * Web variant: the georeferenced Sanborn mosaic as a raster source over
 * the CARTO basemap, fitted to the mosaic's bounds. Pan and zoom are
 * live — this one is for looking closely — but the wheel stays with the
 * page (cooperative gestures) so a scrolling reader is never trapped.
 */
export function SanbornOverlayMap({ overlay }: { overlay: SanbornOverlay }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const containerRef = useRef<View | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    const container = containerRef.current as unknown as HTMLElement | null;
    if (!container || mapRef.current) return;
    const [west, south, east, north] = overlay.bounds;
    const map = new maplibregl.Map({
      container,
      style: scheme === 'dark' ? STYLE_DARK : STYLE_LIGHT,
      bounds: [
        [west, south],
        [east, north],
      ],
      fitBoundsOptions: { padding: 12 },
      cooperativeGestures: true,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('load', () => {
      map.addSource('sanborn', {
        type: 'raster',
        tiles: [overlay.tiles],
        tileSize: 512,
        minzoom: overlay.minzoom,
        maxzoom: overlay.maxzoom,
        bounds: overlay.bounds,
        attribution: overlay.attribution,
      });
      map.addLayer({ id: 'sanborn', type: 'raster', source: 'sanborn', paint: { 'raster-opacity': 0.88 } });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay.tiles]);

  return (
    <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 2, overflow: 'hidden' }}>
      <View ref={containerRef} style={{ height: 320 }} />
    </View>
  );
}
