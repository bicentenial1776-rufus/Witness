import { TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Themed text input: raised surface, hairline border, 17pt body type. */
export function TextField({ style, ...rest }: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      style={[
        {
          backgroundColor: theme.backgroundElement,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 12,
          padding: 14,
          fontSize: 17,
          color: theme.text,
        },
        style,
      ]}
      {...rest}
    />
  );
}
