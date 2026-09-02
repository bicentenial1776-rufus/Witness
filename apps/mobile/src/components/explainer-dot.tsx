import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The "?" behind a label (Rufus's spec, 2026-09-02): a small ringed mark
 * that opens a short, dismissible historical note explaining what the
 * label means. An overlay rather than an inline fold because the labels
 * live in tightly packed header rows and cards — expanding in place would
 * shove the record around.
 */
export function ExplainerDot({ title, text }: { title: string; text: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={(event) => {
          // Labels often sit inside pressable rows; the tap must not
          // bubble into them (the KinReveal lesson).
          event?.stopPropagation?.();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`What does ${title} mean?`}
        hitSlop={8}
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ThemedText
          style={{ fontFamily: Fonts.mono, fontSize: 10, lineHeight: 12, color: theme.accent }}
        >
          ?
        </ThemedText>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{
            flex: 1,
            backgroundColor: 'rgba(28, 25, 23, 0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          {/* Stop the backdrop press so taps on the card itself don't dismiss. */}
          <Pressable onPress={(e) => e?.stopPropagation?.()} style={{ maxWidth: 440, width: '100%' }}>
            <Card style={{ gap: 8 }}>
              <ThemedText type="smallBold" themeColor="accent" style={{ letterSpacing: 2 }}>
                {title.toUpperCase()}
              </ThemedText>
              <ThemedText type="small">{text}</ThemedText>
              <ThemedText
                type="link"
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                style={{ marginTop: 4 }}
              >
                Got it
              </ThemedText>
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
