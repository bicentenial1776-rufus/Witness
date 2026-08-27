import { Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

/**
 * The small in-place map behind a place caret (Portrait 2B): one pin at
 * town scale, deliberately inert — panning and zooming belong to the Map
 * tab, this is a glance. Same muted Apple cartography as the Map tab.
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
      <MapView
        style={{ height: 150 }}
        mapType="mutedStandard"
        initialRegion={{ latitude, longitude, latitudeDelta: 0.35, longitudeDelta: 0.35 }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        pointerEvents="none"
      >
        <Marker coordinate={{ latitude, longitude }} />
      </MapView>
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
