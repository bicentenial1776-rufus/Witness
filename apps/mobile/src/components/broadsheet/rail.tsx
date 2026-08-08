import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { RecordText } from '@/components/record-text';
import { useActiveTree } from '@/lib/active-tree';
import { Broadsheet, BrandFonts } from '@/constants/theme';

/**
 * The persistent left rail (redesign §2, structure rule 1): wordmark, tree
 * name, the five phone-tab destinations, and a contextual block. Rendered
 * only under the broadsheet layout — the phone tab bar takes over below 900px.
 */

const C = Broadsheet.color;

// The five destinations mirror the phone tabs exactly (docs/
// phone-ia-design-brief.md, decision 2): Home is the feed, This Week
// lives behind it at /digest, and Research folds into Tree.
const TREE_ROUTES = [
  '/tree',
  '/research',
  '/archives',
  '/register',
  '/family-stage',
  '/orphan-records',
  '/getting-to-work',
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
  { label: 'Map', href: '/map', match: (p) => p.startsWith('/map') },
  { label: 'Nearby', href: '/proximity', match: (p) => p.startsWith('/proximity') },
];

export function Rail() {
  const pathname = usePathname();
  const { activeTree } = useActiveTree();

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
      <View style={{ paddingHorizontal: 18, marginBottom: 26 }}>
        <RecordText eyebrow accent>
          Witness
        </RecordText>
        {activeTree && (
          <Text
            style={{
              fontFamily: BrandFonts.serif.regular,
              fontSize: 15,
              color: C.inkSecondary,
              marginTop: 6,
            }}
            numberOfLines={2}
          >
            {activeTree.name}
          </Text>
        )}
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

      {activeTree && (
        <View
          style={{
            marginTop: 30,
            marginHorizontal: 18,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: C.rule,
            gap: 10,
          }}
        >
          <RecordText eyebrow muted>
            The tree
          </RecordText>
          {[
            [activeTree.individual_count, 'people'],
            [activeTree.family_count, 'families'],
            [activeTree.place_count, 'places'],
          ].map(([count, label]) => (
            <View key={String(label)} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14, color: C.inkSecondary }}>
                {label}
              </Text>
              <RecordText>{Number(count).toLocaleString()}</RecordText>
            </View>
          ))}
        </View>
      )}

      <View style={{ flex: 1 }} />
      <Pressable onPress={() => router.push('/you')} style={{ paddingHorizontal: 18, paddingTop: 16 }}>
        <RecordText eyebrow muted>
          Account →
        </RecordText>
      </Pressable>
    </View>
  );
}
