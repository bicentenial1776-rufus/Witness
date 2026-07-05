import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GEDCOM_GUIDE } from '@/constants/gedcom-guide';

/**
 * Onboarding: where does your tree live today? Each platform opens a
 * step-by-step export walkthrough. Reachable from the empty-tree home
 * card, the You tab, and the import screen.
 */
export default function ImportGuideIndex() {
  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48, gap: 12 }}>
        <ThemedText>
          Witness reads a GEDCOM file — the universal family-tree format every major platform can
          produce. Where do you build your tree today?
        </ThemedText>

        {GEDCOM_GUIDE.map((platform) => (
          <Card
            key={platform.id}
            onPress={() =>
              router.push({ pathname: '/import-guide/[platform]', params: { platform: platform.id } })
            }
          >
            <ThemedText type="subtitle">{platform.name}</ThemedText>
            <ThemedText type="small">{platform.blurb}</ThemedText>
          </Card>
        ))}

        <Card onPress={() => router.push('/import')}>
          <ThemedText type="subtitle">I already have my file</ThemedText>
          <ThemedText type="small">Go straight to import</ThemedText>
        </Card>

        <ThemedText type="small" style={{ marginTop: 8 }}>
          Witness never changes your tree — it reads, enriches, and discovers. Your tree on the
          platform stays exactly as it is. Photos don’t travel in a GEDCOM; your tree arrives
          complete, just without images for now.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}
