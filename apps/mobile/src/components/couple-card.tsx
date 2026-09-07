import { Pressable, Text, View } from 'react-native';

import type { CoupleUnit } from '@witness/core/family';
import type { TreeIndividual } from '@witness/core/query';

import { Card } from '@/components/card';
import { KinLine, KinName } from '@/components/kin-line';
import { ThemedText } from '@/components/themed-text';
import { BrandFonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Kin } from '@/lib/relationship-cache';

/**
 * A couple is one card: the two people joined by a hairline down the
 * left, the marriage year at the join; later marriages of either partner
 * hang beneath, dashed, so the line's spouse and the others read as
 * different things (Rufus, 2026-09-06). One partner alone is the same
 * card without the join. Shared by the generation walk and the
 * relatives-by-kind lists (Rufus, 2026-09-07: "this feature is very
 * helpful").
 */
export function CoupleCard({
  unit,
  people,
  kin,
  onOpen,
}: {
  unit: CoupleUnit;
  people: Map<string, TreeIndividual>;
  kin: Map<string, Kin>;
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();
  const partners = unit.partners.map((id) => people.get(id)).filter((p): p is TreeIndividual => Boolean(p));
  if (partners.length === 0) return null;
  const years = (p: TreeIndividual) => `${p.birth_year ?? '?'}–${p.living ? '' : (p.death_year ?? '?')}`;
  const personRow = (p: TreeIndividual) => (
    <Pressable key={p.id} onPress={() => onOpen(p.id)} accessibilityRole="button" style={{ gap: 2 }}>
      <KinName kin={kin.get(p.id)}>
        <ThemedText>{p.full_name}</ThemedText>
      </KinName>
      <KinLine kin={kin.get(p.id)} />
      <ThemedText type="small">{years(p)}</ThemedText>
    </Pressable>
  );

  return (
    <Card style={{ paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {partners.length > 1 && (
          <View style={{ width: 14, alignItems: 'center' }}>
            <View style={{ width: 1, flex: 1, backgroundColor: theme.accent }} />
            <Text style={{ color: theme.accent, fontSize: 13, lineHeight: 16 }}>⚭</Text>
            <View style={{ width: 1, flex: 1, backgroundColor: theme.accent }} />
          </View>
        )}
        <View style={{ flex: 1, gap: 10 }}>
          {partners[0] && personRow(partners[0])}
          {partners.length > 1 && (
            <Text style={{ fontFamily: BrandFonts.mono.regular, fontSize: 12, letterSpacing: 0.5, color: theme.textSecondary }}>
              {unit.marriageYear ? `MARRIED ${unit.marriageYear}` : 'MARRIED, YEAR UNRECORDED'}
            </Text>
          )}
          {partners[1] && personRow(partners[1])}
        </View>
      </View>
      {unit.laterMarriages.length > 0 && (
        <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: theme.border, gap: 6 }}>
          {unit.laterMarriages.map((m) => {
            const of = people.get(m.ofId);
            const spouse = people.get(m.spouseId);
            if (!spouse) return null;
            return (
              <Pressable key={`${m.ofId}-${m.spouseId}`} onPress={() => onOpen(spouse.id)} accessibilityRole="button">
                <ThemedText type="small">
                  {of ? `${of.full_name.split(' ')[0]} also married ` : 'Also married '}
                  <ThemedText type="smallBold">{spouse.full_name}</ThemedText>
                  {m.marriageYear ? ` · ${m.marriageYear}` : ''} · {years(spouse)} ›
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}
