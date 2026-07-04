import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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

  async function handleSignIn() {
    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);
    if (error) Alert.alert('Sign in failed', error.message);
  }

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <ThemedText type="title">Witness</ThemedText>
      <TextField
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title="Sign in" busy={isSubmitting} onPress={handleSignIn} />
      <Link href="/sign-up">
        <ThemedText type="link">Need an account? Sign up</ThemedText>
      </Link>
    </ThemedView>
  );
}
