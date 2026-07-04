import { forwardRef, type ComponentRef, type Ref } from 'react';
import { Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';

// Brand colors from the brief. The card deliberately ignores the device
// theme: a shared discovery should look like Witness wherever it lands.
const INK = '#1C1917';
const PARCHMENT = '#F7F3EE';
const AMBER = '#B45309';

export interface DiscoveryCardProps {
  headline: string;
  detail: string;
  years: string;
}

/** What callers need from the ref: just capture(). */
export interface DiscoveryCardHandle {
  capture?: () => Promise<string>;
}

/**
 * The shareable discovery card, rendered off-screen and captured with
 * react-native-view-shot. 1080×1350 (4:5) so it lands well in feeds
 * and messages.
 */
export const DiscoveryCard = forwardRef<DiscoveryCardHandle, DiscoveryCardProps>(function DiscoveryCard(
  { headline, detail, years },
  ref,
) {
  return (
    <View style={{ position: 'absolute', left: -2000, top: 0 }} pointerEvents="none">
      <ViewShot
        ref={ref as Ref<ComponentRef<typeof ViewShot>>}
        options={{ format: 'png', width: 1080, height: 1350 }}
      >
        <View
          style={{
            width: 540,
            height: 675,
            backgroundColor: INK,
            padding: 40,
            justifyContent: 'space-between',
          }}
        >
          <Text
            style={{
              color: AMBER,
              fontSize: 16,
              letterSpacing: 6,
              fontWeight: '600',
            }}
          >
            WITNESS
          </Text>

          <View style={{ gap: 16 }}>
            <Text style={{ color: PARCHMENT, fontSize: 40, fontWeight: '700', lineHeight: 48 }}>
              {headline}
            </Text>
            <View style={{ height: 3, width: 64, backgroundColor: AMBER }} />
            <Text style={{ color: PARCHMENT, fontSize: 20, lineHeight: 28, opacity: 0.9 }}>
              {detail}
            </Text>
            <Text style={{ color: AMBER, fontSize: 18, fontWeight: '600' }}>{years}</Text>
          </View>

          <Text style={{ color: PARCHMENT, fontSize: 14, opacity: 0.6 }}>
            Witnesses to History · witnesslives.com
          </Text>
        </View>
      </ViewShot>
    </View>
  );
});
