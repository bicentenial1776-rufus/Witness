import { Platform, useWindowDimensions } from 'react-native';

import { Broadsheet } from '@/constants/theme';

/**
 * True when the broadsheet layout applies: any web surface ≥900px, and the
 * native iPad at the same width (audit G7 — the reading device was the one
 * place the reading layout couldn't reach; Safari on the same iPad got a
 * better Witness than the installed app). Landscape phones stay on the
 * phone carrier: `isPad` is the guard, not width alone — an iPhone Pro Max
 * sideways is 932pt of the wrong reading posture.
 */
export function useBroadsheet(): boolean {
  const { width } = useWindowDimensions();
  if (width < Broadsheet.minWidth) return false;
  return Platform.OS === 'web' || (Platform.OS === 'ios' && Platform.isPad === true);
}

/** True when the margin column renders beside content (≥1200px); below, it trails. */
export function useMarginColumn(): boolean {
  const { width } = useWindowDimensions();
  if (width < 1200) return false;
  return Platform.OS === 'web' || (Platform.OS === 'ios' && Platform.isPad === true);
}
