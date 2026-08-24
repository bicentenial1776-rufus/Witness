import { Text, type TextProps, type TextStyle } from 'react-native';

import { useBroadsheet } from '@/components/broadsheet';
import { Broadsheet, BrandFonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Record data treatment (docs/Witness_web_redesign §2): every date, year,
 * count, distance, and era label renders in IBM Plex Mono, uppercase,
 * letterspaced — the single cheapest move that makes the app read as an
 * archive and makes columns line up.
 *
 * Colors follow the color scheme everywhere EXCEPT the broadsheet carrier
 * (web ≥900px), which stays a deliberately light print object — the phone
 * and narrow web go to the ink world in dark mode (Large Print phase 2,
 * 2026-08-24).
 */
const DARK_INK = { accent: '#D99B42', muted: '#A69D90', secondary: '#C9C0B2' };

export function RecordText({
  eyebrow = false,
  accent = false,
  muted = false,
  style,
  children,
  ...rest
}: TextProps & {
  /** Smaller, wider-tracked — section kickers and labels. */
  eyebrow?: boolean;
  accent?: boolean;
  muted?: boolean;
}) {
  const broadsheet = useBroadsheet();
  const dark = useColorScheme() === 'dark' && !broadsheet;
  const base: TextStyle = {
    fontFamily: eyebrow ? BrandFonts.mono.semiBold : BrandFonts.mono.regular,
    fontSize: eyebrow ? Broadsheet.type.monoEyebrow : Broadsheet.type.caption,
    letterSpacing: eyebrow ? 2 : 1.2,
    textTransform: 'uppercase',
    color: accent
      ? dark
        ? DARK_INK.accent
        : Broadsheet.color.accent
      : muted
        ? dark
          ? DARK_INK.muted
          : Broadsheet.color.inkMuted
        : dark
          ? DARK_INK.secondary
          : Broadsheet.color.inkSecondary,
  };
  return (
    <Text {...rest} style={[base, style]}>
      {children}
    </Text>
  );
}
