import { Platform, useWindowDimensions } from 'react-native';

import { Broadsheet } from '@/constants/theme';

/** True when the broadsheet layout applies: web, ≥900px. */
export function useBroadsheet(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= Broadsheet.minWidth;
}

/** True when the margin column renders beside content (≥1200px); below, it trails. */
export function useMarginColumn(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 1200;
}
