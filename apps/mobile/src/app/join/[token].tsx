import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { BrandFonts, WideContent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActiveTree } from '@/lib/active-tree';
import {
  acceptInvite,
  peekInvite,
  stashPendingInvite,
  type InvitePeek,
} from '@/lib/family-sharing';
import { showAlert } from '@/lib/alert';
import { usePurchases } from '@/lib/purchases';
import { invalidateRelationshipCache } from '@/lib/relationship-cache';

/**
 * The landing for a family invitation — public like /shared, because the
 * person holding the link may have no account yet (design brief §5). The
 * walk: peek at who's inviting (get_invite, anonymous), get a session if
 * there isn't one (the token is stashed so sign-up's email-confirm detour
 * can't lose it), then accept — the edge function seats them and grants
 * the entitlement, so the paywall guard opens on the next entitlement
 * read. Ends at "who are you?", the companion's one onboarding question.
 */
export default function JoinScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const { restore } = usePurchases();
  const { refresh, selectTree } = useActiveTree();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [peek, setPeek] = useState<InvitePeek | null | 'missing'>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validToken = typeof token === 'string' && /^[0-9a-f]{32}$/.test(token);

  useEffect(() => {
    if (!validToken) {
      setPeek('missing');
      return;
    }
    // Survive the sign-up detour (email confirmation lands the person back
    // at sign-in, not here): the root layout re-routes to this screen when
    // a session appears with a stashed invite.
    if (!session) void stashPendingInvite(token);
    let cancelled = false;
    peekInvite(token)
      .then((data) => {
        if (!cancelled) setPeek(data ?? 'missing');
      })
      .catch(() => {
        if (!cancelled) setPeek('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [validToken, token, session]);

  async function join() {
    if (!validToken) return;
    setJoining(true);
    setError(null);
    try {
      const result = await acceptInvite(token);
      // The seat was granted over a running store trial — say so, or the
      // trial quietly converts into a bill for what the seat covers free.
      if (result.trialCovered) {
        showAlert(
          'Your seat is free',
          'This family seat covers your access on its own. If you started a free trial, you can cancel it in Settings — your seat keeps you in, and nothing will lapse.',
        );
      }
      // The seat came with an entitlement — re-read it so the router's
      // paywall guard opens without a relaunch. Failure is fine: the guard
      // re-checks on next launch, and the seat itself is already real.
      await restore().catch(() => false);
      invalidateRelationshipCache();
      await refresh();
      await selectTree(result.treeId);
      // The companion's one onboarding question, on the tree they joined.
      router.replace({ pathname: '/home-person', params: { treeId: result.treeId } });
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : String(joinError));
      setJoining(false);
    }
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <View style={{ ...WideContent, flex: 1, justifyContent: 'center', padding: 24, gap: 10 }}>
        <ThemedText type="smallBold" themeColor="accent" style={{ letterSpacing: 4 }}>
          WITNESS
        </ThemedText>

        {peek === null ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : peek === 'missing' ? (
          <>
            <ThemedText type="title">This invitation has gone quiet.</ThemedText>
            <ThemedText>
              It may have been used already, taken back, or simply expired — invitations work once
              and last seven days. Ask your family member to send a fresh one.
            </ThemedText>
          </>
        ) : (
          <>
            <ThemedText
              style={{
                fontFamily: BrandFonts.serif.semiBold,
                fontSize: 30,
                lineHeight: 38,
                color: theme.text,
              }}
            >
              {peek.inviterName
                ? `${peek.inviterName} has kept a seat for you.`
                : 'A seat has been kept for you.'}
            </ThemedText>
            <ThemedText>
              You&rsquo;re invited into the {peek.treeName} on Witness —{' '}
              {peek.individualCount.toLocaleString()} people, their places, and their stories, with
              every relationship told from where you sit in the family.
            </ThemedText>

            {error && (
              <ThemedText type="small" themeColor="accent" style={{ marginTop: 4 }}>
                {error}
              </ThemedText>
            )}

            <View style={{ marginTop: 20, gap: 10 }}>
              {session ? (
                <Button
                  title={joining ? 'Taking your seat…' : 'Take your seat'}
                  onPress={joining ? undefined : join}
                />
              ) : (
                <>
                  <Button
                    title="Create your account"
                    onPress={() => router.push('/sign-up')}
                  />
                  <ThemedText
                    type="link"
                    style={{ textAlign: 'center' }}
                    onPress={() =>
                      router.push({ pathname: '/sign-in', params: { next: `/join/${token}` } })
                    }
                  >
                    Already have Witness? Sign in ›
                  </ThemedText>
                </>
              )}
            </View>
          </>
        )}
      </View>
    </ThemedView>
  );
}
