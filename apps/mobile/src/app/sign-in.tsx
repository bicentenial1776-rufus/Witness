import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Button, TextInput } from 'react-native';

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
      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12 }}
      />
      <TextInput
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12 }}
      />
      <Button title={isSubmitting ? 'Signing in…' : 'Sign in'} onPress={handleSignIn} disabled={isSubmitting} />
      <Link href="/sign-up">
        <ThemedText type="link">Need an account? Sign up</ThemedText>
      </Link>
    </ThemedView>
  );
}
