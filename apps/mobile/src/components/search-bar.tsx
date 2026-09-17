import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { BrandFonts, Letterpress } from '@/constants/theme';
import { useLetterpress } from '@/hooks/use-theme';

/**
 * The one search box (Rufus, 2026-09-17): the same control across the top
 * of Home, Tree, Explore and Map. A label OUTSIDE the box — words inside
 * the field read as something already typed — a clear boundary, and a
 * button. Explore owns the results: on the other tabs the box hands the
 * query to /explore?q=… so there is one place to learn.
 */
export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  label = 'Search your tree',
  hint = 'A name, a place, or a year',
  autoFocus,
  style,
}: {
  value?: string;
  onChangeText?: (text: string) => void;
  /** Omit to hand the query to Explore. */
  onSubmit?: (text: string) => void;
  label?: string;
  hint?: string;
  autoFocus?: boolean;
  style?: TextInputProps['style'];
}) {
  const L = useLetterpress();
  const [local, setLocal] = useState('');
  const [focused, setFocused] = useState(false);
  const controlled = value !== undefined;
  const text = controlled ? value : local;
  const submit = () => {
    const q = text.trim();
    if (onSubmit) onSubmit(q);
    else if (q) router.push({ pathname: '/explore', params: { q } } as never);
  };

  return (
    <View style={[{ gap: 6 }, style as object]}>
      <Text style={{ fontFamily: BrandFonts.mono.regular, fontSize: 12, letterSpacing: 1.4, color: L.deepAmber }}>
        {label.toUpperCase()}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          borderWidth: 1.5,
          borderColor: focused ? L.deepAmber : L.rule,
          borderRadius: 8,
          backgroundColor: L.raised ?? Letterpress.raised,
          overflow: 'hidden',
        }}
      >
        <TextInput
          value={text}
          onChangeText={(next) => {
            if (!controlled) setLocal(next);
            onChangeText?.(next);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={submit}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          accessibilityLabel={label}
          style={{
            flex: 1,
            fontFamily: BrandFonts.sans.regular,
            fontSize: 18,
            color: L.ink,
            paddingVertical: 12,
            paddingHorizontal: 14,
            ...({ outlineStyle: 'none' } as object),
          }}
        />
        <Pressable
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel="Search"
          style={{ justifyContent: 'center', paddingHorizontal: 16, backgroundColor: L.deepAmber }}
        >
          <Text style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 15, color: '#fff' }}>Search</Text>
        </Pressable>
      </View>
      <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13.5, color: L.muted }}>{hint}</Text>
    </View>
  );
}
