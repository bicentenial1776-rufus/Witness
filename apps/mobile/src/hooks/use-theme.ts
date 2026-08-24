/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, Letterpress, LetterpressDark, type LetterpressPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;

  return Colors[theme];
}

/**
 * The letterpress palette, theme-aware (Large Print phase 2, 2026-08-24):
 * paper world in light, ink world in dark. Screens take `const L =
 * useLetterpress()` inside the component instead of the static import —
 * the eight flagship screens used to hardcode light and ignore the dark
 * toggle entirely.
 */
export function useLetterpress(): LetterpressPalette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? LetterpressDark : Letterpress;
}
