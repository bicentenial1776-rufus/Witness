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
import { supabase } from '@/lib/supabase';

type Status = 'checking' | 'ready' | 'invalid' | 'done';

/**
 * Lands here from the emailed reset link (app.witnesslives.com/reset-password
 * only — see forgot-password.tsx; no universal-link entitlement means this
 * always opens in a browser, never the native app). The client has
 * detectSessionInUrl: false (see lib/supabase.ts), so Supabase's implicit-flow
 * recovery tokens in the URL hash have to be picked up and exchanged by hand.
 */
export default function ResetPassword() {
  const [status, setStatus] = useState<Status>(Platform.OS === 'web' ? 'checking' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      setStatus('invalid');
      return;
    }

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(
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
    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
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
        <ThemedText type="small">You&apos;re signed in with your new password.</ThemedText>
        <Button title="Continue" onPress={() => router.replace('/')} />
      </>
    );
  } else {
    content = (
      <>
        <ThemedText type="title">Choose a new password</ThemedText>
        <TextField
          placeholder="New password"
          secureTextEntry
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
