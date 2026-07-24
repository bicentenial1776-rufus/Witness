import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WideContent } from '@/constants/theme';

/**
 * Web variant: the Ancestor Map runs on react-native-maps, which has no
 * web implementation. A MapLibre-based Map.web lands in Phase B
 * (WEB_APP_DESIGN.md §5); until then this tab explains itself instead of
 * crashing the bundle.
 */
export default function MapTab() {
  return (
    <ThemedView style={{ flex: 1 }}>
      <ThemedView style={{ ...WideContent, padding: 24, paddingTop: 72, gap: 8 }}>
        <ThemedText type="title">Map</ThemedText>
        <ThemedText type="subtitle">The Ancestor Map lives on iPhone and iPad for now.</ThemedText>
        <ThemedText type="small">
          Your family&rsquo;s places are still being mapped in the background — open Witness on
          your iPhone or iPad to wander them. The map arrives on the web soon.
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}
