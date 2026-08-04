import { SymbolView } from 'expo-symbols';

import type { LineageTier } from '@/lib/relationship-cache';

/**
 * The lineage mark — a small glyph tiering a person by their relation to
 * the home person: ⇅ for the direct line, a drop for blood relatives
 * beyond it (collaterals). Non-blood people carry no mark — absence is
 * the marker.
 */
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
  return (
    <SymbolView name={tier === 'direct' ? 'arrow.up.and.down' : 'drop'} size={size} tintColor={color} />
  );
}
