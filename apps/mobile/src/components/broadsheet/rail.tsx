import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { openFieldGuide } from '@/components/field-guide';
import { RecordText } from '@/components/record-text';
import { Broadsheet, BrandFonts } from '@/constants/theme';

/**
 * The persistent left rail (redesign §2, structure rule 1): wordmark, tree
 * name, the five phone-tab destinations, and a contextual block. Rendered
 * only under the broadsheet layout — the phone tab bar takes over below 900px.
 */

const C = Broadsheet.color;

// The four destinations mirror the phone tabs exactly (docs/
// phone-ia-design-brief.md decision 2, amended 2026-08-08 by audit G4:
// Nearby folded into Map). Home is the feed, This Week lives behind it
// at /digest, and Research folds into Tree.
const TREE_ROUTES = [
  '/tree',
  '/research',
  '/archives',
  '/register',
  '/family-stage',
  '/orphan-records',
  '/getting-to-work',
  '/punch-list',
];
// The Explore shelf's own destinations. Without these the rail highlighted
// nothing once a reader followed a card off the shelf, which read as having
// left the app rather than having gone one level down.
const EXPLORE_ROUTES = [
  '/explore',
  '/library',
  '/places',
  '/patterns',
  '/origins',
  '/migrations',
  '/migration',
  '/crossings',
  '/kindred',
  '/query',
];
const DESTINATIONS: { label: string; href: string; match: (p: string) => boolean }[] = [
  { label: 'Home', href: '/', match: (p) => p === '/' || p === '/index' || p.startsWith('/digest') },
  { label: 'Tree', href: '/tree', match: (p) => TREE_ROUTES.some((route) => p.startsWith(route)) },
  {
    label: 'Explore',
    href: '/explore',
    match: (p) => EXPLORE_ROUTES.some((route) => p.startsWith(route)),
  },
  {
    label: 'Map',
    href: '/map',
    match: (p) => p.startsWith('/map') || p.startsWith('/nearby'),
  },
];

export function Rail() {
  const pathname = usePathname();

  return (
    <View
      style={{
        width: Broadsheet.railWidth,
        backgroundColor: C.railBg,
        borderRightWidth: 1,
        borderRightColor: C.rule,
        paddingTop: 28,
        paddingBottom: 20,
      }}
    >
      {/* Wordmark only (Rufus, 2026-09-17): the tree's name and figures
          moved to the Tree tab's own heading; the rail is the four doors. */}
      <View style={{ paddingHorizontal: 18, marginBottom: 26 }}>
        <RecordText eyebrow accent>
          Witness
        </RecordText>
      </View>

      {DESTINATIONS.map((destination) => {
        const active = destination.match(pathname);
        return (
          <Pressable
            key={destination.href}
            onPress={() => router.push(destination.href as never)}
            style={{
              paddingVertical: 11,
              paddingHorizontal: 18,
              backgroundColor: active ? C.paperRaised : 'transparent',
              borderLeftWidth: 3,
              borderLeftColor: active ? C.accent : 'transparent',
            }}
          >
            <Text
              style={{
                fontFamily: active ? BrandFonts.sans.semiBold : BrandFonts.sans.regular,
                fontSize: Broadsheet.type.ui,
                color: active ? C.ink : C.inkSecondary,
              }}
            >
              {destination.label}
            </Text>
          </Pressable>
        );
      })}

      {/* Below the four doors: the guides and family sharing (Rufus,
          2026-09-17), plain links in the one tappable convention. */}
      <View
        style={{
          marginTop: 30,
          marginHorizontal: 18,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopColor: C.rule,
          gap: 12,
        }}
      >
        {(
          [
            ['Family sharing', () => router.push('/you' as never)],
            ['Questions & answers', () => router.push('/faq' as never)],
            ['The Field Guide', () => openFieldGuide()],
          ] as const
        ).map(([label, go]) => (
          <Pressable key={label} onPress={go} hitSlop={6}>
            <Text
              style={{
                fontFamily: BrandFonts.sans.regular,
                fontSize: 14.5,
                color: C.accent,
                textDecorationLine: 'underline',
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flex: 1 }} />
      <Pressable onPress={() => router.push('/you')} style={{ paddingHorizontal: 18, paddingTop: 16 }}>
        <RecordText eyebrow muted>
          Account →
        </RecordText>
      </Pressable>
    </View>
  );
}
