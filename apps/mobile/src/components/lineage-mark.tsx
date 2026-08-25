import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import type { LineageTier } from '@/lib/relationship-cache';

/**
 * The lineage mark — a small glyph tiering a person by their relation to
 * the home person: ⇅ for the direct line, a drop for blood relatives
 * beyond it (collaterals), a link for everyone married in. People with no
 * relationship carry no mark — absence is the marker.
 */
const GLYPH: Record<LineageTier, SymbolViewProps['name']> = {
  direct: 'arrow.up.and.down',
  blood: 'drop',
  distant: 'link',
};

export function LineageMark({
  tier,
  size = 12,
  color,
}: {
  tier: LineageTier | undefined;
  size?: number;
  color: string;
}) {
  if (!tier) return null;
  return <SymbolView name={GLYPH[tier]} size={size} tintColor={color} />;
}
