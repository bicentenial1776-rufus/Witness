import { Stack } from 'expo-router';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Tabs carry the five destinations; everything else is a pushed detail
 * screen with a native header (swipe-back, safe areas for free). Detail
 * screens keep taking treeId params so deep links — like the digest
 * notification — work without any tab state.
 */

// Anchor deep links on the tabs: opening a detail screen directly (a
// notification tap, a dev-client link) still puts Home beneath it, so
// there is always a back chevron and a tab bar to return to.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function AppLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.accent,
        headerTitleStyle: {
          fontFamily: Fonts.serif,
          fontWeight: '600',
          color: theme.text,
        },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="digest" options={{ title: 'This Week in Your Family' }} />
      <Stack.Screen name="import" options={{ title: 'Import a Tree' }} />
      <Stack.Screen name="import-guide/index" options={{ title: 'Get Your Tree' }} />
      <Stack.Screen name="import-guide/[platform]" options={{ title: '' }} />
      <Stack.Screen name="home-person" options={{ title: 'Who Are You?' }} />
      <Stack.Screen name="you" options={{ title: 'You' }} />
      <Stack.Screen name="faq" options={{ title: 'Questions & Answers' }} />
      <Stack.Screen name="migrations" options={{ title: 'Migration Paths' }} />
      <Stack.Screen name="kindred" options={{ title: 'Kindred Couples' }} />
      <Stack.Screen name="places/index" options={{ title: 'Where They Lived' }} />
      <Stack.Screen name="places/[region]" options={{ title: '' }} />
      <Stack.Screen name="place/[placeId]" options={{ title: '' }} />
      <Stack.Screen name="query/[eventId]" options={{ title: '' }} />
      <Stack.Screen name="research/[briefId]" options={{ title: 'Research Brief' }} />
      <Stack.Screen name="ancestor/[id]" options={{ title: '' }} />
      <Stack.Screen name="relationship/[individualId]" options={{ title: '' }} />
    </Stack>
  );
}
