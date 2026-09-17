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
    border: '#CFC5B2', // Large Print pass 2026-08-24: structure must be visible
    accent: '#A54A08', // amber, darkened for real AA margin (was #B45309 at 4.55:1)
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
    // Large Print pass 2026-08-24: muted was 3.68:1 and faint 2.60:1 on
    // paper — below AA. Muted now passes for normal text; faint passes
    // large-text and is banned below 14px.
    inkMuted: '#6B6257',
    inkFaint: '#847A6C',
    accent: '#B4501A',
    accentHover: '#8E3D11',
    rule: '#C9BEAA',
    ruleLight: '#D8CFBE',
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
    caption: 15, // Large Print pass 2026-08-24 (was 14)
    monoEyebrow: 13, // (was 12)
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
  /** Raised card surface on paper. */
  raised: '#ffffff',
  /** Recessed surface — chips, wells. */
  well: '#f4efe6',
  ink: '#1a1815',
  // Large Print pass 2026-08-24: the old #b0741f measured 3.72:1 as text —
  // the Home tab's links failed AA. Darkened so amber text passes (5.6:1)
  // and paper-on-amber fills pass too; the warmth survives.
  amber: '#8f5a10',
  // Darkened 2026-08-23 (Rufus, daylight field test): the browns washed
  // out in sunlight. Sex inks decoupled from the text tokens so a woman's
  // ribbon and a caption are no longer the same pigment.
  deepAmber: '#6b4306',
  muted: '#57524a',
  /** Sex inks (grey for unrecorded — carried rule). */
  inkMen: '#2f2c26',
  inkWomen: '#744b0b',
  inkUnrecorded: '#5f5a51',
  /** Died before 18 — the pale ribbon of the legend. */
  pale: '#efe8da',
  /** Hairline — same value as Broadsheet.color.rule so the two carriers share rules. */
  rule: '#C9BEAA',
} as const;

/**
 * The ink world — dark-mode letterpress (Large Print phase 2, 2026-08-24).
 * The metaphor inverts honestly: parchment text on ink paper, the ribbons
 * printed in parchment so their names (set in `paper`, now dark) still
 * read. Every text token measured ≥6:1 on the dark paper.
 */
export type LetterpressPalette = Record<keyof typeof Letterpress, string>;

export const LetterpressDark: LetterpressPalette = {
  paper: '#1b1814',
  raised: '#26221b',
  well: '#2e2921',
  ink: '#f0eade',
  amber: '#d99b42',
  deepAmber: '#c9994f',
  muted: '#a69d90',
  inkMen: '#ddd5c4',
  inkWomen: '#d3a049',
  inkUnrecorded: '#98918a',
  pale: '#332f28',
  rule: '#453f35',
} as const;

/**
 * The letterpress record voice, shared — one definition instead of seven
 * per-file copies (Large Print pass, 2026-08-24), with a hard floor: no
 * mono text renders below 12px, ever.
 */
export const mono = (size: number, color: string = Letterpress.ink) => ({
  fontFamily: BrandFonts.mono.regular,
  fontSize: Math.max(size, 12),
  color,
});

// A tappable mono label — the one convention for everything that responds
// (Rufus, 2026-09-17): accent color plus an underline, same as ThemedText's
// link presets.
export const monoLink = (size: number, color: string = Letterpress.deepAmber) => ({
  ...mono(size, color),
  textDecorationLine: 'underline' as const,
});

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
