import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WideContent } from '@/constants/theme';

/**
 * Web variant: Nearby is inherently a you-are-standing-somewhere feature
 * (expo-location + react-native-maps) — it stays native. This placeholder
 * keeps the tab present and honest on the web (WEB_APP_DESIGN.md §5).
 */
export default function ProximityTab() {
  return (
    <ThemedView style={{ flex: 1 }}>
      <ThemedView style={{ ...WideContent, padding: 24, paddingTop: 72, gap: 8 }}>
        <ThemedText type="title">Nearby</ThemedText>
        <ThemedText type="subtitle">Nearby is a phone-in-your-pocket feature.</ThemedText>
        <ThemedText type="small">
          It watches where you are and tells you when family history is close — graves, old home
          places, the streets they walked. Open Witness on your iPhone to use it out in the world.
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}
