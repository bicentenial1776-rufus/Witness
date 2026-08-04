import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { Pressable } from 'react-native';

export const FIELD_GUIDE_URL = 'https://witnesslives.com/guide/';

/** Opens the Field Guide in the in-app browser sheet — the reader stays in
    Witness and swipes back down to where they were. */
export function openFieldGuide(page = ''): void {
  WebBrowser.openBrowserAsync(FIELD_GUIDE_URL + page).catch(() => {});
}

/** The header "?" — help that arrives on the screen that confused you.
    Reserved for the symbol-heavy screens; a "?" everywhere reads as an
    apology. */
export function GuideHelpButton({ page, color }: { page: string; color: string }) {
  return (
    <Pressable
      onPress={() => openFieldGuide(page)}
      hitSlop={10}
      accessibilityLabel="Open the field guide for this screen"
    >
      <SymbolView name="questionmark.circle" size={20} tintColor={color} />
    </Pressable>
  );
}
