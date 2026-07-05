import * as WebBrowser from 'expo-web-browser';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { TRANSFER_TIPS, getPlatformGuide } from '@/constants/gedcom-guide';

/** One platform's export walkthrough, ending at the import flow. */
export default function ImportGuidePlatform() {
  const { platform: platformId } = useLocalSearchParams<{ platform: string }>();
  const theme = useTheme();
  const platform = getPlatformGuide(platformId);

  if (!platform) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <ThemedText>Unknown platform.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: platform.name }} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48, gap: 12 }}>
        {platform.intro && <ThemedText>{platform.intro}</ThemedText>}

        {platform.url && (
          <Button
            variant="secondary"
            title={platform.urlLabel ?? `Open ${platform.name}`}
            onPress={() => WebBrowser.openBrowserAsync(platform.url!)}
          />
        )}

        {platform.sections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={{ gap: 8 }}>
            {section.heading && (
              <ThemedText type="subtitle" style={{ marginTop: 8 }}>
                {section.heading}
              </ThemedText>
            )}
            {section.intro && <ThemedText type="small">{section.intro}</ThemedText>}
            <Card>
              {section.steps.map((step, stepIndex) => (
                <View key={stepIndex} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: theme.accent, width: 22, textAlign: 'right' }}
                  >
                    {stepIndex + 1}
                  </ThemedText>
                  <ThemedText style={{ flex: 1 }}>{step}</ThemedText>
                </View>
              ))}
            </Card>
            {section.note && (
              <ThemedText type="small">
                <ThemedText type="smallBold" themeColor="accent">
                  Good to know{' '}
                </ThemedText>
                {section.note}
              </ThemedText>
            )}
          </View>
        ))}

        <ThemedText type="subtitle" style={{ marginTop: 8 }}>
          Get the file onto this device
        </ThemedText>
        {TRANSFER_TIPS.map((tip) => (
          <ThemedText key={tip.title} type="small">
            <ThemedText type="smallBold">{tip.title}. </ThemedText>
            {tip.text}
          </ThemedText>
        ))}

        <Button title="I have my file — import it" onPress={() => router.push('/import')} />
        <ThemedText type="small">
          Stuck? Every platform moves its menus over time — search their help center for “export
          GEDCOM,” or write us at support@witnesslives.com and a real person will figure it out
          with you.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}
