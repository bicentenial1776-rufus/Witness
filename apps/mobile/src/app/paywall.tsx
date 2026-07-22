import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchasesError } from 'react-native-purchases';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandFonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePurchases } from '@/lib/purchases';

const UNLOCKED = [
  'Ask any temporal query — who was alive during any war, epidemic, or era',
  '"I\'m Here" mode — know the moment you\'re near an ancestor\'s grave',
  'AI-written biographies for every ancestor in your tree',
  'Weekly digest of anniversaries and discoveries in your family',
  'Full research brief generator for your hardest genealogy gaps',
];

// Screens 7 and 8 of the onboarding flow (witness-onboarding-screens.md) are
// meant to feel like one continuous moment, not a separate swipe the reader
// can skip past — so the trial timeline lives directly on the paywall
// itself, not behind another screen.
const TIMELINE = [
  { day: 'TODAY', body: 'Full access, nothing charged' },
  { day: 'DAY 5', body: 'We’ll remind you before your trial ends' },
  { day: 'DAY 7', body: 'Your subscription starts, unless you’ve canceled' },
] as const;

export default function Paywall() {
  const theme = useTheme();
  const { offering, purchasePackage, restore } = usePurchases();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const pkg = offering?.annual ?? offering?.availablePackages[0] ?? null;

  async function handlePurchase() {
    if (!pkg) {
      Alert.alert(
        'Not available yet',
        'Subscriptions aren’t configured for this build. Try again once the RevenueCat product is live.',
      );
      return;
    }
    setIsPurchasing(true);
    try {
      const unlocked = await purchasePackage(pkg);
      if (!unlocked) {
        Alert.alert('Purchase incomplete', 'That didn’t unlock full access. Please try again.');
      }
      // On success the router guard reacts to isEntitled and swaps to (app) itself.
    } catch (error) {
      const purchasesError = error as PurchasesError;
      if (!purchasesError.userCancelled) {
        Alert.alert('Purchase failed', purchasesError.message ?? 'Something went wrong.');
      }
    } finally {
      setIsPurchasing(false);
    }
  }

  async function handleRestore() {
    setIsRestoring(true);
    try {
      const unlocked = await restore();
      if (!unlocked) {
        Alert.alert('Nothing to restore', 'No active subscription was found for this account.');
      }
    } catch (error) {
      Alert.alert('Restore failed', error instanceof Error ? error.message : String(error));
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="accent" style={styles.eyebrow}>
            GET FULL ACCESS
          </ThemedText>
          <ThemedText style={[styles.headline, { color: theme.text }]}>
            Try Witness free for 7 days.
          </ThemedText>

          <View style={{ gap: 14 }}>
            {UNLOCKED.map((line) => (
              <View key={line} style={styles.row}>
                <ThemedText themeColor="accent" style={styles.bullet}>
                  {'✦'}
                </ThemedText>
                <ThemedText style={styles.rowText}>{line}</ThemedText>
              </View>
            ))}
          </View>

          <View style={[styles.timelineCard, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <View style={styles.timelineDotsRow}>
              <View style={[styles.timelineTrackLine, { backgroundColor: theme.border }]} />
              {TIMELINE.map((step) => (
                <View key={step.day} style={[styles.timelineDot, { backgroundColor: theme.accent }]} />
              ))}
            </View>
            <View style={styles.timelineLabelsRow}>
              {TIMELINE.map((step, i) => {
                const align = i === 0 ? 'left' : i === TIMELINE.length - 1 ? 'right' : 'center';
                return (
                  <View
                    key={step.day}
                    style={[
                      styles.timelineCol,
                      { alignItems: i === 0 ? 'flex-start' : i === TIMELINE.length - 1 ? 'flex-end' : 'center' },
                    ]}
                  >
                    <ThemedText type="smallBold" themeColor="accent" style={{ textAlign: align }}>
                      {step.day}
                    </ThemedText>
                    <ThemedText type="small" style={[styles.timelineBody, { textAlign: align }]}>
                      {step.body}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={[styles.priceCard, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="subtitle">{pkg?.product.priceString ?? '$19.99'} / year</ThemedText>
            <ThemedText type="small">Charged on Day 7 unless you cancel before then.</ThemedText>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button title="Start Free Trial" busy={isPurchasing} onPress={handlePurchase} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Cancel anytime in Settings. No charge until Day 7.
          </ThemedText>
          <ThemedText
            type="link"
            style={styles.center}
            onPress={isRestoring ? undefined : handleRestore}
          >
            {isRestoring ? 'Restoring…' : 'Restore Purchase'}
          </ThemedText>
          <View style={styles.legalRow}>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              onPress={() => WebBrowser.openBrowserAsync('https://witnesslives.com/privacy')}
            >
              Privacy Policy
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {'  ·  '}
            </ThemedText>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              onPress={() => WebBrowser.openBrowserAsync('https://witnesslives.com/terms')}
            >
              Terms of Use
            </ThemedText>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, gap: 20 },
  eyebrow: { letterSpacing: 3 },
  headline: { fontFamily: BrandFonts.serif.semiBold, fontSize: 30, lineHeight: 36 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { fontSize: 17, lineHeight: 25 },
  rowText: { flex: 1 },
  timelineCard: { borderWidth: 1, borderRadius: 15, padding: 20, gap: 12 },
  timelineDotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 10,
    paddingHorizontal: 3,
  },
  timelineTrackLine: { position: 'absolute', left: 8, right: 8, height: 1 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLabelsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineCol: { flex: 1, gap: 3 },
  timelineBody: { textAlign: 'left' },
  priceCard: { borderWidth: 1, borderRadius: 15, padding: 20, gap: 6, alignItems: 'center' },
  footer: { padding: 24, gap: 14 },
  center: { textAlign: 'center' },
  legalRow: { flexDirection: 'row', justifyContent: 'center' },
});
