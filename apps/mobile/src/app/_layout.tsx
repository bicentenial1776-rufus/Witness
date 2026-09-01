import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { SessionProvider, useSession } from '@/auth/session-provider';
import { ActiveTreeProvider } from '@/lib/active-tree';
import {
  installNotificationHandler,
  useNotificationDeepLinks,
} from '@/lib/notification-routing';
import { consumePendingInvite } from '@/lib/family-sharing';
import { NarrativeProvider, useNarrative } from '@/lib/narrative';
import { consumePendingImportUri } from '@/lib/pending-import';
import { PurchasesProvider, usePurchases } from '@/lib/purchases';
import { SuperwallGate } from '@/lib/superwall';

SplashScreen.preventAutoHideAsync();

installNotificationHandler();

function RootNavigator() {
  const { session, isLoading: isSessionLoading } = useSession();
  const { seen: narrativeSeen } = useNarrative();
  const { isEntitled, isLoading: isPurchasesLoading } = usePurchases();
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_400Regular_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  // Entitlement only resolves once there's a session to key it on; the
  // narrative flag is a device read and resolves for everyone.
  const isLoading =
    !fontsLoaded ||
    isSessionLoading ||
    narrativeSeen === null ||
    (Boolean(session) && isPurchasesLoading);

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  useNotificationDeepLinks();

  // "Open in Witness" on a .ged/.gdz (see +native-intent.ts) stashes the file
  // before the router knows whether the reader can reach /import. Once
  // they're fully through the gauntlet, pick it up — on this render and
  // again whenever the app returns to the foreground, since the OS brings
  // Witness forward for "Open In" without necessarily remounting anything.
  const isReady = Boolean(session) && isEntitled;
  useEffect(() => {
    if (isLoading || !isReady) return;

    function checkPendingImport() {
      consumePendingImportUri().then((uri) => {
        if (uri) router.push({ pathname: '/import', params: { fileUri: uri } });
      });
    }

    checkPendingImport();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPendingImport();
    });
    return () => subscription.remove();
  }, [isLoading, isReady]);

  // A family invite stashed before sign-up (join/[token] stashes it; the
  // email-confirm detour would otherwise lose the destination): as soon as
  // there's a session — entitled or not, /join is public — land back on
  // the invitation. One-shot: consuming clears the stash.
  const hasSession = Boolean(session);
  useEffect(() => {
    if (isLoading || !hasSession) return;
    consumePendingInvite().then((token) => {
      if (token) router.replace(`/join/${token}` as never);
    });
  }, [isLoading, hasSession]);

  if (isLoading) return null;

  // The gauntlet, reordered by the ux audit (batch 4): the transformation
  // narrative plays FIRST, before any account exists — value and price
  // shown before the wall asks for an email. Then sign-up/sign-in, then the
  // hard paywall (every relaunch until subscribed), then the app itself.
  // The narrative is once per device; a signed-in reader never sees it.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session && narrativeSeen === false}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>

      <Stack.Protected guard={Boolean(session) && !isEntitled}>
        <Stack.Screen name="paywall" />
      </Stack.Protected>

      <Stack.Protected guard={Boolean(session) && isEntitled}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      {/* Any signed-in reader, subscribed or not: the person standing at the
          paywall wanting out is exactly who account deletion exists for, so
          it cannot live inside the entitled group. Declared after the groups
          above so it is never the initial route. */}
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="delete-account" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>

      {/* Public: a shared story renders for anyone, signed in or not.
          reset-password is here too — the emailed link lands while signed
          out, but exchanging its tokens establishes a session mid-visit, so
          it can't sit behind the !session guard above. Declared LAST — the
          first declared screen becomes the router's initial route, and
          neither of these must ever be it. */}
      <Stack.Screen name="shared/[token]" />
      <Stack.Screen name="join/[token]" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <NarrativeProvider>
          <PurchasesProvider>
            <SuperwallGate>
              <ActiveTreeProvider>
                <RootNavigator />
              </ActiveTreeProvider>
            </SuperwallGate>
          </PurchasesProvider>
        </NarrativeProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
