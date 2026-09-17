import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

/**
 * Type scale: serif display (titles/subtitles — the historical-document
 * voice), sans body. Body sizes lean large; the audience skews 55+.
 */
export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  const defaultColor =
    themeColor ??
    (type === 'small' || type === 'smallBold'
      ? 'textSecondary'
      : type === 'link' || type === 'linkPrimary'
        ? 'accent'
        : 'text');

  return (
    <Text
      style={[
        { color: theme[defaultColor] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

// Large Print pass 2026-08-24: the whole scale up one notch — small
// 14→15.5, body 17→18 — the audience skews 55+, and this preset sheet is
// most of the app's rendered text.
const styles = StyleSheet.create({
  small: {
    fontSize: 15.5,
    lineHeight: 22,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 15.5,
    lineHeight: 22,
    fontWeight: 700,
  },
  default: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: 400,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 34,
    lineHeight: 41,
    fontWeight: 700,
  },
  subtitle: {
    fontFamily: Fonts.serif,
    fontSize: 23,
    lineHeight: 30,
    fontWeight: 600,
  },
  // One convention for everything tappable (Rufus, 2026-09-17): the accent
  // color AND an underline, so a reader never has to guess what responds.
  link: {
    lineHeight: 26,
    fontSize: 18,
    fontWeight: 500,
    textDecorationLine: 'underline',
  },
  linkPrimary: {
    lineHeight: 26,
    fontSize: 18,
    fontWeight: 600,
    textDecorationLine: 'underline',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
