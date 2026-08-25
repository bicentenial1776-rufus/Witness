import { useState, type ReactNode } from 'react';
import { Pressable, type StyleProp, type TextStyle } from 'react-native';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import type { LineageTier } from '@/lib/relationship-cache';

/** The four categories, plus the affirmative absence the Portrait states. */
export type KinTier = LineageTier | 'none';

/** The category words, exactly as the guide teaches them (concepts §2). */
export const TIER_WORD: Record<KinTier, string> = {
  direct: 'Direct line',
  blood: 'Blood',
  distant: 'Distant',
  none: 'No relation',
};

/**
 * The relationship beside a name, category first: the broad word is what
 * you read ("Blood ▾"), and a tap reveals the exact wording beneath it
 * ("Blood · your 3rd cousin twice removed ▴"). One calculation, two
 * altitudes — the guide's four categories become the visible layer, and
 * the specific label stays one tap away everywhere a name appears.
 *
 * `none` renders the word alone, unpressable — there is nothing more to
 * reveal. List rows keep absence as their marker (the blank is the
 * answer); only the Portrait states "No relation" outright.
 */
export function KinReveal({
  tier,
  label,
  type = 'small',
  style,
  uppercase = false,
  trailing,
}: {
  tier: KinTier;
  label?: string | null;
  /** ThemedText preset — carries the themed color when `style` sets none. */
  type?: ThemedTextProps['type'];
  /** Site typography; a color here overrides the themed default. */
  style?: StyleProp<TextStyle>;
  uppercase?: boolean;
  /** Rendered after the revealed label — e.g. a "See the path ›" link. */
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const word = TIER_WORD[tier];
  const cased = (text: string) => (uppercase ? text.toUpperCase() : text);

  if (tier === 'none' || !label) {
    return (
      <ThemedText type={type} style={style}>
        {cased(word)}
      </ThemedText>
    );
  }

  return (
    <Pressable
      onPress={(event) => {
        // Rows are often pressable cards; on web the click would bubble.
        event?.stopPropagation?.();
        setOpen((o) => !o);
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={
        open ? `${word} — hide the exact relationship` : `${word} — show the exact relationship`
      }
    >
      <ThemedText type={type} style={style}>
        {open ? `${cased(`${word} · your ${label}`)} ▴` : `${cased(word)} ▾`}
        {open ? trailing : null}
      </ThemedText>
    </Pressable>
  );
}
