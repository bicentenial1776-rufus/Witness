import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { View, type ColorValue } from 'react-native';

import { Rail, useBroadsheet } from '@/components/broadsheet';
import { useTheme } from '@/hooks/use-theme';

function tabIcon(name: SFSymbol) {
  return ({ color }: { color: ColorValue }) => (
    <SymbolView name={name} tintColor={String(color)} size={24} />
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  // Broadsheet layout (web ≥900px): the persistent left rail replaces the
  // phone tab bar (docs/Witness_web_redesign §2, structure rule 1).
  const broadsheet = useBroadsheet();

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {broadsheet && <Rail />}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.accent,
            tabBarInactiveTintColor: theme.textSecondary,
            // The native bar is retired everywhere: the (app) layout's
            // WitnessTabBar persists across detail screens instead, and
            // the broadsheet rail covers wide web.
            tabBarStyle: { display: 'none' },
            sceneStyle: { backgroundColor: theme.background },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('house.fill') }} />
          <Tabs.Screen name="tree" options={{ title: 'Tree', tabBarIcon: tabIcon('tree.fill') }} />
          <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: tabIcon('hourglass') }} />
          {/* Four tabs since 2026-08-08 (audit G4): Nearby folded into Map as
              its NEAR ME mode — the two tabs were one question ("where?")
              split by which coordinate was held fixed. The freed slot stays
              deliberately empty; Street View is its strongest claimant. */}
          <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: tabIcon('map.fill') }} />
        </Tabs>
      </View>
    </View>
  );
}
