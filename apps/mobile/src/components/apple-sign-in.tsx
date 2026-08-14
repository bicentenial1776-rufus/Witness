import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { showAlert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

/**
 * One-tap account creation and sign-in via Apple (ux audit batch 4): no
 * email round-trip, no password to invent — the single biggest ability cut
 * in the funnel for a reader base that skews older. The button is Apple's
 * own (the HIG requires their design, not ours). iOS only; the web bundle
 * resolves apple-sign-in.web.tsx instead.
 *
 * Server side: Supabase's Apple provider must be enabled with the app's
 * bundle id (com.witnesslives.witness) among its authorized client ids.
 * Until then the tap fails with the server's message rather than silently.
 */
export function AppleSignInButton({ intent }: { intent: 'sign-in' | 'sign-up' }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => {});
  }, []);

  if (!available) return null;

  async function handlePress() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple returned no identity token.');
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      // The router's session guard takes it from here.
    } catch (error) {
      const raised = error as { code?: string; message?: string };
      if (raised.code === 'ERR_REQUEST_CANCELED') return;
      showAlert('Sign in with Apple failed', raised.message ?? String(error));
    }
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={
        intent === 'sign-up'
          ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
          : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
      }
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={12}
      style={{ height: 48 }}
      onPress={handlePress}
    />
  );
}
