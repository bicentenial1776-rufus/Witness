import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
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
import { supabase } from '@/lib/supabase';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function handleSignUp() {
    Keyboard.dismiss();
    setIsSubmitting(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setIsSubmitting(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else {
      Alert.alert('Check your email', 'Confirm your account, then sign in.');
    }
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
            <ThemedText type="title">Create account</ThemedText>
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
              onSubmitEditing={handleSignUp}
              value={password}
              onChangeText={setPassword}
            />
            <Button title="Sign up" busy={isSubmitting} onPress={handleSignUp} />
            <Link href="/sign-in">
              <ThemedText type="link">Already have an account? Sign in</ThemedText>
            </Link>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
