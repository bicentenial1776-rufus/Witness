import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { SessionProvider, useSession } from '@/auth/session-provider';
import { ActiveTreeProvider } from '@/lib/active-tree';
import { ProfileProvider, useProfile } from '@/lib/profile';
import { PurchasesProvider, usePurchases } from '@/lib/purchases';

SplashScreen.preventAutoHideAsync();

// Show digest notifications even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function RootNavigator() {
  const { session, isLoading: isSessionLoading } = useSession();
  const { onboardingCompleted, isLoading: isProfileLoading } = useProfile();
  const { isEntitled, isLoading: isPurchasesLoading } = usePurchases();

  // Profile/entitlement only resolve once there's a session to key them on.
  const isLoading =
    isSessionLoading || (Boolean(session) && (isProfileLoading || isPurchasesLoading));

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  // Tapping a notification deep-links to the screen named in its data.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    });
    return () => subscription.remove();
  }, []);

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
            <ActiveTreeProvider>
              <RootNavigator />
            </ActiveTreeProvider>
          </PurchasesProvider>
        </ProfileProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
