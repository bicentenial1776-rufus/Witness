import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandFonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showAlert, showDestructiveConfirm } from '@/lib/alert';
import { useActiveTree } from '@/lib/active-tree';
import { discardOriginal } from '@/lib/gedcom-vault';
import { manageSubscriptionUrl, openManageSubscription } from '@/lib/manage-subscription';
import { usePurchases } from '@/lib/purchases';
import { clearResumePoint } from '@/lib/resume';
import { supabase } from '@/lib/supabase';

/**
 * Account deletion, in the app (App Store guideline 5.1.1(v), and plainly
 * owed to anyone we asked to create an account). Lives OUTSIDE the (app)
 * group so a reader standing at the paywall — exactly the reader most likely
 * to want out — can reach it too.
 *
 * The heavy work reuses the tree-delete machinery: drain every tree through
 * delete_tree_batch with the same honest progress line, then hand the small
 * remainder (profile, share links, pins, storage, the auth user itself) to
 * the delete-account edge function.
 */
export default function DeleteAccount() {
  const theme = useTheme();
  const { trees, refresh } = useActiveTree();
  const { subscription } = usePurchases();
  const [working, setWorking] = useState<{ stage: string; removed: number } | null>(null);

  // The paywall path may land here before the tree list has ever loaded.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Owned trees only: a tree shared with this account (family sharing) is
  // not this account's data — the drain must never touch it, and the
  // membership row itself cascades away with the auth user.
  const ownedTrees = (trees ?? []).filter((tree) => tree.owned);
  const treeCount = ownedTrees.length;
  const peopleCount = ownedTrees.reduce((sum, tree) => sum + tree.individual_count, 0);

  // A subscription outlives the account it was bought for — the store bills
  // the Apple ID or card, not our user row. Warn before, not after.
  const billingLive = Boolean(
    subscription && !subscription.isPromotional && (subscription.willRenew || subscription.isTrial),
  );

  async function runDelete() {
    let removed = 0;
    setWorking({ stage: 'starting', removed });
    for (const tree of ownedTrees) {
      let drained = false;
      for (let i = 0; i < 400; i++) {
        const { data, error } = await supabase.rpc('delete_tree_batch', { p_tree_id: tree.id });
        if (error) {
          setWorking(null);
          showAlert(
            'Delete stopped',
            `${error.message}\n\n${removed.toLocaleString()} records were removed before it stopped. Your account still exists — try again to finish.`,
          );
          return;
        }
        const result = data as { done?: boolean; deleted?: number; stage?: string } | null;
        removed += result?.deleted ?? 0;
        setWorking({ stage: result?.stage ?? '', removed });
        if (result?.done) {
          drained = true;
          break;
        }
      }
      if (!drained) {
        // Never report success we did not observe (the tree-delete rule).
        setWorking(null);
        showAlert(
          'Delete unfinished',
          `"${tree.name}" is larger than expected and only partly removed (${removed.toLocaleString()} records so far). Your account still exists — try again to finish.`,
        );
        return;
      }
      if (tree.gedcom_path) {
        // The edge function sweeps the folder anyway; this just does the
        // bulk of it under the user's own key while we're here.
        await discardOriginal(tree.gedcom_path).catch(() => {});
      }
    }

    setWorking({ stage: 'your account', removed });
    const { error } = await supabase.functions.invoke('delete-account');
    setWorking(null);
    if (error) {
      showAlert(
        'Account not deleted',
        'Your trees were removed, but the account itself is still here. Check your connection and try again — or email support@witnesslives.com and a real person will finish it.',
      );
      return;
    }

    // The account is gone; all that's left is to stop looking signed in.
    await clearResumePoint().catch(() => {});
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem('witness_last_route');
      } catch {}
    }
    await supabase.auth.signOut({ scope: 'local' });
  }

  function confirmDelete() {
    showDestructiveConfirm(
      'Delete your account?',
      treeCount > 0
        ? `This is permanent. ${treeCount === 1 ? 'Your tree' : `${treeCount} trees`} (${peopleCount.toLocaleString()} people) will be removed, then the account itself.`
        : 'This is permanent. Your account and everything attached to it will be removed.',
      'Delete everything',
      () => {
        runDelete();
      },
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText
            type="link"
            onPress={() => {
              if (!working) router.back();
            }}
          >
            ‹ Back
          </ThemedText>
          <ThemedText style={[styles.headline, { color: theme.text }]}>
            Delete your account
          </ThemedText>
          <ThemedText>
            This removes your account and everything in it — every imported tree, its people and
            places, your shared story links, and the encrypted originals in your vault. It cannot
            be undone.
          </ThemedText>
          <ThemedText type="small">
            Your GEDCOM files on your own devices, and your trees on Ancestry or anywhere else,
            are untouched — Witness only ever held a copy.
          </ThemedText>
          {treeCount > 0 && (
            <ThemedText type="small">
              {`On this account: ${treeCount === 1 ? 'one tree' : `${treeCount} trees`} · ${peopleCount.toLocaleString()} people.`}
            </ThemedText>
          )}

          {billingLive && (
            <View
              style={[
                styles.billingCard,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText type="smallBold">
                Deleting your account does not cancel your subscription.
              </ThemedText>
              <ThemedText type="small">
                The store bills your Apple ID or card, not this account — cancel first, or the
                charges continue for an account that no longer exists.
              </ThemedText>
              {manageSubscriptionUrl(subscription) ? (
                <ThemedText type="link" onPress={() => openManageSubscription(subscription)}>
                  Manage subscription ›
                </ThemedText>
              ) : (
                <ThemedText type="small">
                  Cancel it from the device where you subscribed.
                </ThemedText>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={working ? 'Deleting…' : 'Delete my account'}
            variant="secondary"
            busy={Boolean(working)}
            onPress={() => {
              if (!working) confirmDelete();
            }}
          />
          {working && (
            <ThemedText type="small" style={styles.center}>
              {`Deleting ${working.stage} — ${working.removed.toLocaleString()} records removed. Keep this screen open.`}
            </ThemedText>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, gap: 16 },
  headline: { fontFamily: BrandFonts.serif.semiBold, fontSize: 30, lineHeight: 36 },
  billingCard: { borderWidth: 1, borderRadius: 15, padding: 20, gap: 8 },
  footer: { padding: 24, gap: 14 },
  center: { textAlign: 'center' },
});
