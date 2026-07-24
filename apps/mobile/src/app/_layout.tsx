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
      {/* Public: a shared story renders for anyone, signed in or not. */}
      <Stack.Screen name="shared/[token]" />

      <Stack.Protected guard={Boolean(session) && !onboardingCompleted}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>

      <Stack.Protected guard={Boolean(session) && onboardingCompleted && !isEntitled}>
        <Stack.Screen name="paywall" />
      </Stack.Protected>

      <Stack.Protected guard={Boolean(session) && onboardingCompleted && isEntitled}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
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
