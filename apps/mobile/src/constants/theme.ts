/**
 * The brand system from BRIEF.md. Light mode is the parchment world — warm
 * paper surfaces with ink text; dark mode is the ink world — deep ink
 * surfaces with parchment text. Amber is the single accent everywhere for
 * now; the per-feature lens colors (plum, moss, dawn blue) arrive later as
 * section accents.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1C1917', // deep ink
    textSecondary: '#6B6157',
    background: '#F7F3EE', // parchment
    backgroundElement: '#FFFDF9', // raised card surface
    backgroundSelected: '#ECE4D8',
    border: '#E2D9CC',
    accent: '#B45309', // amber
    onAccent: '#FFFDF9',
  },
  dark: {
    text: '#F7F3EE',
    textSecondary: '#B0A69A',
    background: '#1C1917',
    backgroundElement: '#2A2018',
    backgroundSelected: '#3A2E20',
    border: '#3E362C',
    accent: '#E08D2F', // amber, lifted for contrast on ink
    onAccent: '#1C1917',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Brand display faces for the onboarding + paywall flow (witness-onboarding-
 * screens.md: "Playfair Display for headlines, Inter for body"). Loaded via
 * expo-font in the root layout — RootLayout gates rendering on them the same
 * way it gates on session/profile/purchases, so these names are always
 * resolvable wherever they're used.
 */
export const BrandFonts = {
  serif: {
    regular: 'PlayfairDisplay_400Regular',
    medium: 'PlayfairDisplay_500Medium',
    semiBold: 'PlayfairDisplay_600SemiBold',
    bold: 'PlayfairDisplay_700Bold',
    italic: 'PlayfairDisplay_400Regular_Italic',
  },
  sans: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/**
 * Cap scrolling content on wide screens (iPad): a centered readable
 * column instead of edge-to-edge stretched cards. Spread into any
 * ScrollView/FlatList contentContainerStyle.
 */
export const WideContent = {
  maxWidth: MaxContentWidth,
  width: '100%' as const,
  alignSelf: 'center' as const,
};
