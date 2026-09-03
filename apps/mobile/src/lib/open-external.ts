import { Linking, Platform } from 'react-native';

import { showAlert } from '@/lib/alert';

/**
 * External links open in a NEW tab on web: a same-tab navigation unloads
 * the SPA, so the browser's Back button cold-reloads Witness onto Home
 * and loses the user's place. A new tab keeps the page alive — returning
 * is a tab switch, not a restart. (Extracted from the Portrait, which
 * keeps its own copy until its next tidy.)
 */
export function openExternal(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener');
  } else {
    // Never fail silently — a malformed stored URL should say so.
    Linking.openURL(url).catch(() => {
      showAlert('Could not open the link', 'The stored link looks malformed — try re-checking it.');
    });
  }
}
