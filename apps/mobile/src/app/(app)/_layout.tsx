import { Stack, router, useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { GuideHelpButton } from '@/components/field-guide';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackResumePoint } from '@/lib/resume';

const RESUME_KEY = 'witness_last_route';
const RESUME_TTL_MS = 6 * 60 * 60 * 1000; // a working session, not forever

/**
 * Web resume: browsers end SPA sessions without asking — tabs get
 * jettisoned, closed and reopened, re-entered via bookmark — and every
 * one of those cold-starts at "/" landed the user on Home, mid-task
 * (the Tree Check → Ancestry → "mark fixed" round trip broke exactly
 * this way). So the last route is saved on every navigation, and a
 * fresh arrival at the front door within the TTL is put back where
 * they were. A deliberate visit that ends on Home saves "/", which
 * restores nothing. Native never auto-restores: it tracks the last
 * nameable detail screen for Home's "pick up where you left off" card.
 */
function useResume() {
  // The router hooks, not window.location: the browser URL is synced a
  // beat AFTER navigation commits, so reading it from an effect records
  // the route you just LEFT — the tracker ran one step behind until it
  // switched to usePathname.
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const search = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      value == null ? [] : (Array.isArray(value) ? value : [value]).map((v) => [key, String(v)]),
    ),
  ).toString();
  const restoreChecked = useRef(false);

  // Restore — declared before the tracker so it reads last session's
  // route before this session's "/" overwrites it.
  useEffect(() => {
    if (restoreChecked.current || Platform.OS !== 'web') return;
    restoreChecked.current = true;
    try {
      if (pathname !== '/') return;
      const raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { path?: string; ts?: number };
      if (saved.path && saved.path !== '/' && Date.now() - (saved.ts ?? 0) < RESUME_TTL_MS) {
        // PUSH, never replace: replace swaps out the Home anchor beneath
        // the restored screen, leaving no back-chevron, no rail, and no
        // way out — every fresh entry at "/" resumed right back into the
        // trap. Push keeps Home underneath, so back always works.
        router.push(saved.path as never);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      // Native: no auto-restore — the last nameable detail screen is saved
      // for the Home feed's "Pick up where you left off" card instead.
      trackResumePoint(pathname + (search ? `?${search}` : '')).catch(() => {});
      return;
    }
    try {
      localStorage.setItem(
        RESUME_KEY,
        JSON.stringify({ path: pathname + (search ? `?${search}` : ''), ts: Date.now() }),
      );
    } catch {}
  }, [pathname, search]);
}

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
  useResume();

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
      <Stack.Screen
        name="digest"
        options={{
          title: 'This Week in Your Family',
          headerRight: () => <GuideHelpButton page="this-week.html" color={theme.accent} />,
        }}
      />
      <Stack.Screen name="import" options={{ title: 'Import a Tree' }} />
      <Stack.Screen name="import-guide/index" options={{ title: 'Get Your Tree' }} />
      <Stack.Screen name="import-guide/[platform]" options={{ title: '' }} />
      <Stack.Screen name="home-person" options={{ title: 'Who Are You?' }} />
      <Stack.Screen name="you" options={{ title: 'You' }} />
      <Stack.Screen name="recovery-code" options={{ title: 'Recovery Code' }} />
      <Stack.Screen name="register" options={{ title: 'The Register' }} />
      <Stack.Screen
        name="tree-health"
        options={{
          title: 'Tree Health',
          headerRight: () => <GuideHelpButton page="tree-health.html" color={theme.accent} />,
        }}
      />
      <Stack.Screen name="orphan-records" options={{ title: 'Orphan Records' }} />
      <Stack.Screen name="family-stage/[key]" options={{ headerShown: false }} />
      <Stack.Screen name="faq" options={{ title: 'Questions & Answers' }} />
      <Stack.Screen name="nearby" options={{ title: 'Near me' }} />
      <Stack.Screen name="patterns" options={{ title: 'Patterns' }} />
      <Stack.Screen name="origins" options={{ title: 'Where It Began' }} />
      <Stack.Screen name="crossings" options={{ title: 'Ocean Crossings' }} />
      <Stack.Screen name="migrations" options={{ title: 'Migration Paths' }} />
      <Stack.Screen name="migration" options={{ title: '' }} />
      <Stack.Screen name="kindred" options={{ title: 'Kindred Couples' }} />
      <Stack.Screen name="places/index" options={{ title: 'Where They Lived' }} />
      <Stack.Screen name="places/[region]" options={{ title: '' }} />
      <Stack.Screen name="place/[placeId]" options={{ title: '' }} />
      <Stack.Screen
        name="query/[eventId]"
        options={{
          title: '',
          headerRight: () => <GuideHelpButton page="explore.html#results" color={theme.accent} />,
        }}
      />
      <Stack.Screen name="library/index" options={{ title: 'The Library' }} />
      <Stack.Screen name="library/[category]" options={{ title: '' }} />
      <Stack.Screen name="library/results" options={{ title: '' }} />
      <Stack.Screen name="research/index" options={{ title: 'Research' }} />
      <Stack.Screen name="research/[briefId]" options={{ title: 'Research Brief' }} />
      <Stack.Screen name="ancestor/[id]" options={{ title: '' }} />
      <Stack.Screen name="relationship/[individualId]" options={{ title: '' }} />
    </Stack>
  );
}
