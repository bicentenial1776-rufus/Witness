import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { Text, View, useColorScheme } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

// Same worker workaround as map.web.tsx: Metro can't satisfy MapLibre's
// import.meta.url worker, so the copy in public/ serves it. Setting it
// twice is harmless — the last call simply wins with the same URL.
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
/** The tile-warming filter from the web redesign — paper, not laboratory. */
const WARM_FILTER = 'sepia(.32) saturate(.72) contrast(.94) brightness(1.04)';

/**
 * Web variant of the small in-place map (Portrait 2B): one pin at town
 * scale, non-interactive — the Map tab owns exploration.
 */
export function PlaceMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const containerRef = useRef<View | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    const container = containerRef.current as unknown as HTMLElement | null;
    if (!container || mapRef.current) return;
    container.style.filter = WARM_FILTER;
    const map = new maplibregl.Map({
      container,
      style: scheme === 'dark' ? STYLE_DARK : STYLE_LIGHT,
      center: [longitude, latitude],
      zoom: 9.5,
      interactive: false,
      attributionControl: { compact: true },
    });
    new maplibregl.Marker({ color: theme.accent }).setLngLat([longitude, latitude]).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Recreating the map for a theme flip mid-view isn't worth the churn;
    // the style is chosen on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 2,
        overflow: 'hidden',
        marginTop: 10,
      }}
    >
      <View ref={containerRef} style={{ height: 150 }} />
      <Text
        style={{
          fontFamily: Fonts.mono,
          fontSize: 12,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.textSecondary,
          backgroundColor: theme.backgroundElement,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
