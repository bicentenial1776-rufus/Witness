import { Text, type TextProps, type TextStyle } from 'react-native';

import { Broadsheet, BrandFonts } from '@/constants/theme';

/**
 * Record data treatment (docs/Witness_web_redesign §2): every date, year,
 * count, distance, and era label renders in IBM Plex Mono, uppercase,
 * letterspaced — the single cheapest move that makes the app read as an
 * archive and makes columns line up.
 */
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
  const base: TextStyle = {
    fontFamily: eyebrow ? BrandFonts.mono.semiBold : BrandFonts.mono.regular,
    fontSize: eyebrow ? Broadsheet.type.monoEyebrow : Broadsheet.type.caption,
    letterSpacing: eyebrow ? 2 : 1.2,
    textTransform: 'uppercase',
    color: accent
      ? Broadsheet.color.accent
      : muted
        ? Broadsheet.color.inkMuted
        : Broadsheet.color.inkSecondary,
  };
  return (
    <Text {...rest} style={[base, style]}>
      {children}
    </Text>
  );
}
