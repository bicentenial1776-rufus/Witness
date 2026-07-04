import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type ButtonProps = Omit<PressableProps, 'style'> & {
  title: string;
  /** primary — filled amber, the one main action; secondary — quiet outline. */
  variant?: 'primary' | 'secondary';
  busy?: boolean;
};

/**
 * The app's button, replacing React Native's default (blue, un-themeable
 * on iOS). One primary per screen; everything else secondary.
 */
export function Button({ title, variant = 'primary', busy, disabled, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      style={({ pressed }) => ({
        backgroundColor: isPrimary ? theme.accent : theme.backgroundElement,
        borderWidth: 1,
        borderColor: isPrimary ? theme.accent : theme.border,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: 'center',
        opacity: disabled || busy ? 0.5 : pressed ? 0.85 : 1,
      })}
      {...rest}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? theme.onAccent : theme.text} />
      ) : (
        <ThemedText
          style={{ color: isPrimary ? theme.onAccent : theme.text, fontWeight: 600 }}
        >
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}
