import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useState } from 'react';

import { Broadsheet } from '@/constants/theme';

const C = Broadsheet.color;

/**
 * A ledger row (structure rule 5): repeating column grid, hairline
 * separator, hover tint. No per-item borders, radius, or padding boxes —
 * hierarchy comes from type, rules, and whitespace.
 */
export function LedgerRow({
  onPress,
  first = false,
  children,
}: {
  onPress?: () => void;
  first?: boolean;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
        paddingVertical: 13,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: C.ruleLight,
        backgroundColor: hovered && onPress ? C.paperRaised : 'transparent',
      }}
    >
      {children}
    </Pressable>
  );
}

/**
 * A margin inset panel (structure rule 4): raised paper, 1px rule, near-
 * square corners — one of the two boxes allowed to survive the redesign.
 */
export function MarginPanel({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: C.paperRaised,
        borderWidth: 1,
        borderColor: C.rule,
        borderRadius: 3,
        padding: 16,
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}

/**
 * A data bar (structure rule 7): counts get drawn. Inactive sand unless
 * this is the leader, which is the page's only orange.
 */
export function DataBar({ value, max, leader = false }: { value: number; max: number; leader?: boolean }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <View style={{ height: 6, backgroundColor: 'transparent', flex: 1 }}>
      <View
        style={{
          height: 6,
          width: `${width}%`,
          backgroundColor: leader ? C.accent : C.barInactive,
        }}
      />
    </View>
  );
}
