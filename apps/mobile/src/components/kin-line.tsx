import type { StyleProp, TextStyle } from 'react-native';

import { KinReveal } from '@/components/kin-reveal';
import type { ThemedTextProps } from '@/components/themed-text';
import type { Kin } from '@/lib/relationship-cache';

/**
 * The relationship symbol every list row carries after the name (Rufus,
 * 2026-09-06: "the same symbol treatment" everywhere): the category
 * word with the exact relationship one tap away. Absence is the marker —
 * a person with no relationship to the home person shows nothing, so a
 * row never has to know whether the map has landed yet.
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
