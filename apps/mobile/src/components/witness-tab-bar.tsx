import { SymbolView, type SFSymbol } from 'expo-symbols';
import { router, usePathname } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBroadsheet } from '@/components/broadsheet';
import { BrandFonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The persistent bottom bar — rendered by the (app) layout OUTSIDE the
 * tab navigator, so the four doors stay on screen on every detail page
 * (Rufus, 2026-08-24: deep stacks meant endless back-tapping to change
 * section). Tapping a door rewinds to that tab; the native Tabs bar is
 * hidden and this one carries the job everywhere below the broadsheet
 * breakpoint.
 */

const TABS: { title: string; icon: SFSymbol; href: string; match: (p: string) => boolean }[] = [
  { title: 'Home', icon: 'house.fill', href: '/', match: (p) => p === '/' || p === '/index' },
  { title: 'Tree', icon: 'tree.fill', href: '/tree', match: (p) => p === '/tree' },
  { title: 'Explore', icon: 'hourglass', href: '/explore', match: (p) => p === '/explore' },
  { title: 'Map', icon: 'map.fill', href: '/map', match: (p) => p === '/map' },
];

export function WitnessTabBar() {
  const theme = useTheme();
  const broadsheet = useBroadsheet();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Broadsheet web keeps its persistent left rail instead.
  if (broadsheet) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.backgroundElement,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 6 : 0),
        paddingTop: 6,
      }}
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        const color = active ? theme.accent : theme.textSecondary;
        return (
          <Pressable
            key={tab.title}
            accessibilityRole="button"
            accessibilityLabel={tab.title}
            onPress={() => router.navigate(tab.href as never)}
            style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 }}
          >
            <SymbolView name={tab.icon} tintColor={String(color)} size={24} />
            <Text
              style={{
                fontFamily: BrandFonts.sans.regular,
                fontSize: 12.5,
                fontWeight: active ? '600' : '400',
                color,
              }}
            >
              {tab.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
