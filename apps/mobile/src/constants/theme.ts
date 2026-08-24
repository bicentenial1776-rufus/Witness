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
  /** Record data — every date, year, count, distance, era label, eyebrow. */
  mono: {
    regular: 'IBMPlexMono_400Regular',
    medium: 'IBMPlexMono_500Medium',
    semiBold: 'IBMPlexMono_600SemiBold',
  },
} as const;

/**
 * The Broadsheet design system (docs/Witness_web_redesign) — the wide-canvas
 * identity for web ≥900px. Two neutrals and one accent; orange is reserved
 * for kickers, links, leading bars, and active marks. Native and narrow
 * viewports keep the existing card system, so these tokens are consumed
 * only by the broadsheet components.
 */
export const Broadsheet = {
  color: {
    paperBg: '#F5F2EC',
    paperRaised: '#FCFAF6',
    railBg: '#F0ECE3',
    ink: '#17140F',
    inkSecondary: '#4A443B',
    inkMuted: '#857C6F',
    inkFaint: '#A0968A',
    accent: '#B4501A',
    accentHover: '#8E3D11',
    rule: '#DDD6C9',
    ruleLight: '#E7E1D5',
    barInactive: '#D8CFC0',
  },
  // Calibrated down ~10% on 2026-07-26 (Rufus: web ran a little large);
  // one edit, uniform across every broadsheet component that reads the scale.
  type: {
    display: 42,
    displaySmall: 36,
    featuredName: 52,
    sectionHead: 27,
    ledgerName: 22,
    body: 18,
    ui: 16,
    caption: 14,
    monoEyebrow: 12,
  },
  railWidth: 210,
  marginColumn: 300,
  /** Broadsheet layout activates at and above this viewport width, web only. */
  minWidth: 900,
} as const;

/**
 * The letterpress system from design panel 4g (the Family Stage's palette),
 * adopted 2026-07-25 as the one visual system everywhere (docs/
 * phone-ia-design-brief.md, decision 1): paper, warm ink, amber — carried
 * in the letterpress manner: hairline rules, squared corners, mono
 * eyebrows, Playfair display. Phone screens build on these; the wider
 * Broadsheet tokens above remain the web ≥900px carrier.
 */
export const Letterpress = {
  paper: '#fbf9f5',
  ink: '#1a1815',
  amber: '#b0741f',
  // Darkened 2026-08-23 (Rufus, daylight field test): the browns washed
  // out in sunlight. Sex inks decoupled from the text tokens so a woman's
  // ribbon and a caption are no longer the same pigment.
  deepAmber: '#6b4306',
  muted: '#57524a',
  /** Sex inks (grey for unrecorded — carried rule). */
  inkMen: '#2f2c26',
  inkWomen: '#744b0b',
  inkUnrecorded: '#5f5a51',
  /** Hairline — same value as Broadsheet.color.rule so the two carriers share rules. */
  rule: '#DDD6C9',
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
