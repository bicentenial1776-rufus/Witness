import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Button, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
