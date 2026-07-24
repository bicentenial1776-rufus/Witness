import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { RecordText } from '@/components/record-text';
import { useActiveTree } from '@/lib/active-tree';
import { Broadsheet, BrandFonts } from '@/constants/theme';

/**
 * The persistent left rail (redesign §2, structure rule 1): wordmark, tree
 * name, six destinations, and a contextual block. Rendered only under the
 * broadsheet layout — the phone tab bar takes over below 900px.
 */

const C = Broadsheet.color;

const DESTINATIONS: { label: string; href: string; match: (p: string) => boolean }[] = [
  { label: 'Home', href: '/', match: (p) => p === '/' || p === '/index' },
  { label: 'This week', href: '/digest', match: (p) => p.startsWith('/digest') },
  { label: 'Explore', href: '/explore', match: (p) => p.startsWith('/explore') },
  { label: 'Map', href: '/map', match: (p) => p.startsWith('/map') },
  { label: 'Nearby', href: '/proximity', match: (p) => p.startsWith('/proximity') },
  { label: 'Research', href: '/research', match: (p) => p.startsWith('/research') },
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
