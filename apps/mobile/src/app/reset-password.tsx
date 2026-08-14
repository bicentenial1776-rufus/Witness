import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showAlert } from '@/lib/alert';

type Status = 'checking' | 'ready' | 'invalid' | 'done';

/**
 * The recovery tokens must NOT touch the app's shared client: the moment a
 * session lands there, the root layout's guards re-route — an unentitled
 * account got yanked to the paywall mid-reset. This throwaway client holds
 * the recovery session in memory only (nothing persisted, nothing global),
 * so the router stays on this screen until the reader is done.
 */
function makeRecoveryClient(): SupabaseClient {
  return createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

/**
 * Lands here from the emailed reset link (app.witnesslives.com/reset-password
 * only — see forgot-password.tsx; no universal-link entitlement means this
 * always opens in a browser, never the native app). Supabase's implicit-flow
 * recovery tokens arrive in the URL hash and are exchanged by hand on the
 * recovery client above.
 */
export default function ResetPassword() {
  const [status, setStatus] = useState<Status>(Platform.OS === 'web' ? 'checking' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmRef = useRef<TextInput>(null);
  const recoveryClient = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      setStatus('invalid');
      return;
    }

    const client = makeRecoveryClient();
    recoveryClient.current = client;
    client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(
      ({ error }) => {
        // Tokens are single-use and shouldn't linger in the address bar.
        window.history.replaceState(null, '', window.location.pathname);
        setStatus(error ? 'invalid' : 'ready');
      },
    );
  }, []);

  async function handleSubmit() {
    Keyboard.dismiss();
    if (password.length < 8) {
      showAlert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      showAlert("Passwords don't match", 'Re-enter both fields to match.');
      return;
    }
    if (!recoveryClient.current) {
      setStatus('invalid');
      return;
    }
    setIsSubmitting(true);
    const { error } = await recoveryClient.current.auth.updateUser({ password });
    setIsSubmitting(false);
    if (error) {
      showAlert("Couldn't update password", error.message);
    } else {
      setStatus('done');
    }
  }

  let content;
  if (status === 'checking') {
    content = <ThemedText>Checking your link…</ThemedText>;
  } else if (status === 'invalid') {
    content = (
      <>
        <ThemedText type="title">Link expired</ThemedText>
        <ThemedText type="small">
          This reset link is invalid or has already been used. Request a new one.
        </ThemedText>
        <Link href="/forgot-password">
          <ThemedText type="link">Request a new link</ThemedText>
        </Link>
      </>
    );
  } else if (status === 'done') {
    content = (
      <>
        <ThemedText type="title">Password updated</ThemedText>
        <ThemedText type="small">Sign in with your new password.</ThemedText>
        <Button title="Go to sign in" onPress={() => router.replace('/sign-in')} />
      </>
    );
  } else {
    content = (
      <>
        <ThemedText type="title">Choose a new password</ThemedText>
        <TextField
          placeholder="New password"
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          passwordRules="minlength: 8;"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
          value={password}
          onChangeText={setPassword}
        />
        <TextField
          ref={confirmRef}
          placeholder="Confirm new password"
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        <Button title="Update password" busy={isSubmitting} onPress={handleSubmit} />
      </>
    );
  }

  const form = (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {content}
    </ScrollView>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {Platform.OS === 'web' ? (
          form
        ) : (
          // See sign-in.tsx: TouchableWithoutFeedback + Keyboard.dismiss is
          // native-only, it makes web fields untypable.
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            {form}
          </TouchableWithoutFeedback>
        )}
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
