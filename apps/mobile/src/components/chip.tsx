import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/**
 * The one filter chip (lifted from Near Me 2026-09-06 so every list's
 * filter bar reads the same). Slimmed 2026-08-27 (Rufus: the filter stack
 * ate the screen) — the text keeps its Large Print size; only the
 * padding thinned.
 */
export function Chip({
  label,
  active,
  onPress,
  activeColor,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor: string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      style={{
        backgroundColor: active ? activeColor : theme.text,
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <ThemedText type="small" style={{ color: theme.background }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Hairline between chip groups in a single filter row. */
export function ChipDivider() {
  const theme = useTheme();
  return <View style={{ width: 1, height: 18, backgroundColor: theme.border, alignSelf: 'center' }} />;
}
