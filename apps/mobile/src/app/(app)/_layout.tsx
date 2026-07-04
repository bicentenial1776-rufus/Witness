import { Stack } from 'expo-router';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Tabs carry the five destinations; everything else is a pushed detail
 * screen with a native header (swipe-back, safe areas for free). Detail
 * screens keep taking treeId params so deep links — like the digest
 * notification — work without any tab state.
 */
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
      <Stack.Screen name="home-person" options={{ title: 'Who Are You?' }} />
      <Stack.Screen name="here" options={{ title: 'I’m Here' }} />
      <Stack.Screen name="migrations" options={{ title: 'Migration Paths' }} />
      <Stack.Screen name="places/index" options={{ title: 'Where They Lived' }} />
      <Stack.Screen name="places/[region]" options={{ title: '' }} />
      <Stack.Screen name="place/[placeId]" options={{ title: '' }} />
      <Stack.Screen name="query/[eventId]" options={{ title: '' }} />
      <Stack.Screen name="research/[briefId]" options={{ title: 'Research Brief' }} />
      <Stack.Screen name="ancestor/[id]" options={{ title: '' }} />
    </Stack>
  );
}
