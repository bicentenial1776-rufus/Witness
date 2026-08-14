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
import { consumePendingImportUri } from '@/lib/pending-import';
import { ProfileProvider, useProfile } from '@/lib/profile';
import { PurchasesProvider, usePurchases } from '@/lib/purchases';
import { SuperwallGate } from '@/lib/superwall';

SplashScreen.preventAutoHideAsync();

installNotificationHandler();

function RootNavigator() {
  const { session, isLoading: isSessionLoading } = useSession();
  const { onboardingCompleted, isLoading: isProfileLoading } = useProfile();
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

  // Profile/entitlement only resolve once there's a session to key them on.
  const isLoading =
    !fontsLoaded ||
    isSessionLoading ||
    (Boolean(session) && (isProfileLoading || isPurchasesLoading));

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  useNotificationDeepLinks();

  // "Open in Witness" on a .ged/.gdz (see +native-intent.ts) stashes the file
  // before the router knows whether the reader can reach /import. Once
  // they're fully through the gauntlet, pick it up — on this render and
  // again whenever the app returns to the foreground, since the OS brings
  // Witness forward for "Open In" without necessarily remounting anything.
  const isReady = Boolean(session) && onboardingCompleted && isEntitled;
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

  if (isLoading) return null;

  // The gauntlet a signed-in user walks once, in order: the transformation
  // narrative (once per account), then the hard paywall (every relaunch
  // until subscribed), then the app itself.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={Boolean(session) && !onboardingCompleted}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>

      <Stack.Protected guard={Boolean(session) && onboardingCompleted && !isEntitled}>
        <Stack.Screen name="paywall" />
      </Stack.Protected>

      <Stack.Protected guard={Boolean(session) && onboardingCompleted && isEntitled}>
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
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <ProfileProvider>
          <PurchasesProvider>
            <SuperwallGate>
              <ActiveTreeProvider>
                <RootNavigator />
              </ActiveTreeProvider>
            </SuperwallGate>
          </PurchasesProvider>
        </ProfileProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
