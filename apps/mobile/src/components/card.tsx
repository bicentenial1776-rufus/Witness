import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * The one card surface: raised parchment/ink panel with a hairline border.
 * Pass onPress to make it tappable (with pressed feedback); omit it for a
 * static panel. Replaces the hand-rolled borderWidth/#999 boxes everywhere.
 */
export function Card({
  style,
  onPress,
  children,
  ...rest
}: ViewProps & { onPress?: PressableProps['onPress'] }) {
  const theme = useTheme();
  const surface = {
    backgroundColor: theme.backgroundElement,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  } as const;

  if (!onPress) {
    return (
      <View style={[surface, style]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        surface,
        pressed && { backgroundColor: theme.backgroundSelected },
        style as object,
      ]}
      {...(rest as PressableProps)}
    >
      {children}
    </Pressable>
  );
}
