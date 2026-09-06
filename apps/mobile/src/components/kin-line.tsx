import type { ReactNode } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { KinReveal } from '@/components/kin-reveal';
import { LineageMark } from '@/components/lineage-mark';
import type { ThemedTextProps } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { Kin } from '@/lib/relationship-cache';

/**
 * The relationship symbol every list row carries (Rufus, 2026-09-06: "the
 * same symbol treatment" everywhere), in two parts that the Portrait lede
 * and the who-was-alive cards already used together:
 *
 * - `KinName` wraps the name and sets the lineage mark right after it —
 *   ⇅ for the direct line, a drop for blood beyond it, a link for everyone
 *   married in.
 * - `KinLine` is the category word beneath, with the exact relationship
 *   one tap away ("Blood ▾" → "Blood · your 3rd cousin twice removed").
 *
 * Absence is the marker — a person with no relationship to the home
 * person shows neither, so a row never has to know whether the map has
 * landed yet.
 */
export function KinLine({
  kin,
  type,
  style,
}: {
  kin: Kin | undefined;
  type?: ThemedTextProps['type'];
  style?: StyleProp<TextStyle>;
}) {
  if (!kin) return null;
  return <KinReveal tier={kin.tier} label={kin.label} type={type} style={style} />;
}

export function KinName({
  kin,
  children,
  style,
  size = 12,
}: {
  kin: Kin | undefined;
  /** The name element, styled however the row styles names. */
  children: ReactNode;
  /** Pass `{ flex: 1 }` when the name element itself used to flex. */
  style?: StyleProp<ViewStyle>;
  size?: number;
}) {
  const theme = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }, style]}>
      {children}
      <LineageMark tier={kin?.tier} size={size} color={theme.accent} />
    </View>
  );
}
