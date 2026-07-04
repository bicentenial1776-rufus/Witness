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

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: 400,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: 700,
  },
  subtitle: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 600,
  },
  link: {
    lineHeight: 25,
    fontSize: 17,
    fontWeight: 500,
  },
  linkPrimary: {
    lineHeight: 25,
    fontSize: 17,
    fontWeight: 600,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
