import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

function tabIcon(name: SFSymbol) {
  return ({ color }: { color: ColorValue }) => (
    <SymbolView name={name} tintColor={String(color)} size={24} />
  );
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
        },
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('house.fill') }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: tabIcon('hourglass') }} />
      <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: tabIcon('map.fill') }} />
      <Tabs.Screen
        name="research"
        options={{ title: 'Research', tabBarIcon: tabIcon('books.vertical.fill') }}
      />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: tabIcon('person.crop.circle') }} />
    </Tabs>
  );
}
