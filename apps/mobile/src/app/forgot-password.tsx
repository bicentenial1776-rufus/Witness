import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showAlert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    Keyboard.dismiss();
    setIsSubmitting(true);
    // The reset link lands on the web app regardless of which platform the
    // reader requested it from — same pattern as sign-up confirmation.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://app.witnesslives.com/reset-password',
    });
    setIsSubmitting(false);
    if (error) {
      showAlert("Couldn't send reset link", error.message);
    } else {
      showAlert('Check your email', 'Follow the link to choose a new password.');
      router.back();
    }
  }

  const form = (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <ThemedText type="title">Reset password</ThemedText>
      <ThemedText type="small">
        Enter your account email and we&apos;ll send a link to choose a new password.
      </ThemedText>
      <TextField
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        returnKeyType="go"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={handleSubmit}
      />
      <Button
        title="Send reset link"
        busy={isSubmitting}
        disabled={!email}
        onPress={handleSubmit}
      />
      <Link href="/sign-in">
        <ThemedText type="link">Back to sign in</ThemedText>
      </Link>
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
