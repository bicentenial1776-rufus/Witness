import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchasesError } from 'react-native-purchases';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { usePurchases } from '@/lib/purchases';

const UNLOCKED = [
  'Ask any temporal query — who was alive during any war, epidemic, or era',
  '"I\'m Here" mode — know the moment you\'re near an ancestor\'s grave',
  'AI-written biographies for every ancestor in your tree',
  'Weekly digest of anniversaries and discoveries in your family',
  'Full research brief generator for your hardest genealogy gaps',
];

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
            FULL ACCESS
          </ThemedText>
          <ThemedText type="title">Witness, unlocked.</ThemedText>

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

          <View style={[styles.priceCard, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="subtitle">{pkg?.product.priceString ?? '$19.99'} / year</ThemedText>
            <ThemedText type="small">
              Includes a free trial. Cancel anytime before it ends and you won’t be charged.
            </ThemedText>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button title="Start free trial" busy={isPurchasing} onPress={handlePurchase} />
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
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { fontSize: 17, lineHeight: 25 },
  rowText: { flex: 1 },
  priceCard: { borderWidth: 1, borderRadius: 15, padding: 20, gap: 6, alignItems: 'center' },
  footer: { padding: 24, gap: 14 },
  center: { textAlign: 'center' },
  legalRow: { flexDirection: 'row', justifyContent: 'center' },
});
