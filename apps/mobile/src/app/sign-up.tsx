import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { AppleSignInButton } from '@/components/apple-sign-in';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showAlert } from '@/lib/alert';
import { peekPendingInvite } from '@/lib/family-sharing';
import { supabase } from '@/lib/supabase';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function handleSignUp() {
    Keyboard.dismiss();
    // The same floor reset-password enforces — stated here, not discovered
    // later as a server rejection.
    if (password.length < 8) {
      showAlert('Password too short', 'Use at least 8 characters.');
      return;
    }
    setIsSubmitting(true);
    // Without this, Supabase falls back to the project's dashboard-configured
    // Site URL for the confirmation link — which is witnesslives.com's
    // marketing homepage, not anything that tells the reader what to do
    // next. This page just says "you're confirmed, go open the app" — and
    // when an invitation is waiting, it carries the invite forward so the
    // page's Open Witness button lands back on /join, not a blank app.
    const pendingInvite = await peekPendingInvite();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: pendingInvite
          ? `https://witnesslives.com/confirmed?next=/join/${pendingInvite}`
          : 'https://witnesslives.com/confirmed',
      },
    });
    setIsSubmitting(false);
    if (error) {
      showAlert('Sign up failed', error.message);
      return;
    }
    // Land on sign-in with the email already filled and the next step in
    // words — this form used to hold an alert and make the reader retype
    // everything (ux audit batch 4).
    router.replace({ pathname: '/sign-in', params: { email, confirm: 'sent' } });
  }

  const form = (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {/* Capped so email/password inputs stay a normal reading width on a
          wide browser window instead of stretching edge to edge. */}
      <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: 12 }}>
        <ThemedText type="title">Create account</ThemedText>
        <TextField
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          value={email}
          onChangeText={setEmail}
        />
        <TextField
          ref={passwordRef}
          placeholder="Password (at least 8 characters)"
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          passwordRules="minlength: 8;"
          returnKeyType="go"
          onSubmitEditing={handleSignUp}
          value={password}
          onChangeText={setPassword}
        />
        <Button title="Sign up" busy={isSubmitting} onPress={handleSignUp} />
        <AppleSignInButton intent="sign-up" />
        <Link href="/sign-in">
          <ThemedText type="link">Already have an account? Sign in</ThemedText>
        </Link>
      </View>
    </ScrollView>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {Platform.OS === 'web' ? (
          form
        ) : (
          // react-native-web has no real software keyboard to dismiss, and its
          // TouchableWithoutFeedback doesn't exclude presses on nested focusable
          // elements — tapping a TextField would focus it, then this handler's
          // Keyboard.dismiss() (which blurs the focused field on web) would fire
          // on the same click, making the fields untypable. Native-only.
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            {form}
          </TouchableWithoutFeedback>
        )}
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
