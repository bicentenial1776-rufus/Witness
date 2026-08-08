import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/button';
import { BrandFonts, WideContent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

interface ShareData {
  kind: string;
  sharer_name: string | null;
  payload: { fullName: string; years: string; lines: string[] };
}

/**
 * The public landing for a shared story — the one page a stranger can see
 * without an account (registered unguarded in the root layout). It renders
 * a snapshot fetched by token through the get_share RPC: one ancestor's
 * card, attributed to the sharer, expiring in 90 days — and ends where the
 * growth funnel begins.
 */
export default function SharedStoryScreen() {
  const theme = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [share, setShare] = useState<ShareData | null | 'missing'>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    supabase
      .rpc('get_share', { p_token: token })
      .then(({ data }) => {
        if (!cancelled) setShare((data as unknown as ShareData | null) ?? 'missing');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <View style={{ ...WideContent, flex: 1, justifyContent: 'center', padding: 24, gap: 10 }}>
        <ThemedText type="smallBold" themeColor="accent" style={{ letterSpacing: 4 }}>
          WITNESS
        </ThemedText>

        {share === null ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : share === 'missing' ? (
          <>
            <ThemedText type="title">This story has gone quiet.</ThemedText>
            <ThemedText>
              The link has expired or was taken back by the person who shared it.
            </ThemedText>
          </>
        ) : (
          <>
            <ThemedText style={{ fontFamily: BrandFonts.serif.semiBold, fontSize: 34, lineHeight: 40, color: theme.text }}>
              {share.payload.fullName}
            </ThemedText>
            <ThemedText type="subtitle" themeColor="accent">
              {share.payload.years}
            </ThemedText>
            <View style={{ gap: 6, marginTop: 6 }}>
              {share.payload.lines.map((line) => (
                <ThemedText key={line}>{line}</ThemedText>
              ))}
            </View>
            {share.sharer_name && (
              <ThemedText type="small" style={{ marginTop: 10 }}>
                Shared from {share.sharer_name}&rsquo;s family tree.
              </ThemedText>
            )}
          </>
        )}

        <View style={{ marginTop: 28, gap: 10 }}>
          <ThemedText type="small">
            Witness turns the family tree you already have into discoveries like this — who was
            alive for what, where they lived, and the records that prove it.
          </ThemedText>
          <Button
            title="Discover your family's history"
            onPress={() => Linking.openURL('https://witnesslives.com')}
          />
          {/* The token rides along so sign-in can land back on this story —
              a cousin moved to join by a particular ancestor should arrive
              at that ancestor, not a generic Home (audit G6). */}
          <ThemedText
            type="link"
            style={{ textAlign: 'center' }}
            onPress={() =>
              router.push({ pathname: '/sign-in', params: { next: `/shared/${token}` } })
            }
          >
            Already have Witness? Sign in ›
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}
