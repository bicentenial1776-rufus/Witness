import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
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

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Simulator-driven verification can't type; a gitignored .env opts into
  // signing in as the dev account automatically. Dev builds only.
  useEffect(() => {
    const email = process.env.EXPO_PUBLIC_DEV_EMAIL;
    const password = process.env.EXPO_PUBLIC_DEV_PASSWORD;
    if (__DEV__ && process.env.EXPO_PUBLIC_DEV_AUTOLOGIN === '1' && email && password) {
      supabase.auth.signInWithPassword({ email, password });
    }
  }, []);

  const passwordRef = useRef<TextInput>(null);

  async function handleSignIn() {
    Keyboard.dismiss();
    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);
    if (error) showAlert('Sign in failed', error.message);
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <ThemedText type="title">Witness</ThemedText>
            <TextField
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              value={email}
              onChangeText={setEmail}
            />
            <TextField
              ref={passwordRef}
              placeholder="Password"
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={handleSignIn}
              value={password}
              onChangeText={setPassword}
            />
            <Button title="Sign in" busy={isSubmitting} onPress={handleSignIn} />
            <Link href="/sign-up">
              <ThemedText type="link">Need an account? Sign up</ThemedText>
            </Link>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
