import { useMemo } from 'react';
import { View } from 'react-native';
import MapView, { UrlTile } from 'react-native-maps';

import { useTheme } from '@/hooks/use-theme';

export interface SanbornOverlay {
  tiles: string;
  bounds: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  attribution: string;
  page_url: string;
}

/**
 * The survey laid over today's streets: a georeferenced Sanborn mosaic
 * (OldInsuranceMaps.net's volunteer georeferencing of the LOC scans) as
 * a tile layer on Apple Maps, framed to the mosaic's own bounds. Shown
 * only where a mosaic exists — most towns have none — and always with
 * the caveat that its accuracy is nobody's guarantee.
 */
export function SanbornOverlayMap({ overlay }: { overlay: SanbornOverlay }) {
  const theme = useTheme();
  const region = useMemo(() => {
    const [west, south, east, north] = overlay.bounds;
    return {
      latitude: (south + north) / 2,
      longitude: (west + east) / 2,
      latitudeDelta: Math.max(0.004, (north - south) * 1.25),
      longitudeDelta: Math.max(0.004, (east - west) * 1.25),
    };
  }, [overlay.bounds]);

  return (
    <View style={{ height: 240, borderWidth: 1, borderColor: theme.border, borderRadius: 2, overflow: 'hidden' }}>
      <MapView style={{ flex: 1 }} initialRegion={region} mapType="mutedStandard" pitchEnabled={false} rotateEnabled={false}>
        <UrlTile
          urlTemplate={overlay.tiles}
          minimumZ={overlay.minzoom}
          maximumZ={overlay.maxzoom}
          tileSize={512}
          opacity={0.85}
          zIndex={1}
        />
      </MapView>
    </View>
  );
}
