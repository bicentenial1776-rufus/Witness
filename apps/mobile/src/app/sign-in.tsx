import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppleSignInButton } from '@/components/apple-sign-in';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandFonts } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

// Fixed brand colors, not the device theme: this is the same hero image and
// wordmark treatment as the marketing site (apps/preview-site/index.html),
// so it should look like Witness everywhere rather than follow the reader's
// light/dark preference. See (onboarding)/index.tsx for the same rationale.
const INK = '#1C1917';
const PARCHMENT = '#F7F3EE';
const PARCHMENT_MUTED = 'rgba(247,243,238,0.78)';
const AMBER = '#B45309';

export default function SignIn() {
  // Sign-up hands its email over so a just-confirmed reader types it once,
  // not twice — and `confirm` carries the "check your email" notice that
  // used to strand them on the sign-up form (ux audit batch 4).
  const { next, email: handedEmail, confirm } = useLocalSearchParams<{
    next?: string;
    email?: string;
    confirm?: string;
  }>();
  const [email, setEmail] = useState(typeof handedEmail === 'string' ? handedEmail : '');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Where to land after sign-in. Allowlisted to the two flows that arrive
  // here carrying a destination: shared stories (audit G6: a cousin moved
  // to join by a particular ancestor should land back on that ancestor)
  // and family invites (the seat is accepted on /join, which needs the
  // session first). Both are public and outside the auth guards, so the
  // replace can't race the guard flip.
  const safeNext = next && /^\/(shared|join)\/[A-Za-z0-9_-]+$/.test(next) ? next : null;

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
    if (error) {
      showAlert('Sign in failed', error.message);
      return;
    }
    if (safeNext) router.replace(safeNext as never);
  }

  const form = (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <View style={styles.wordmarkRow}>
        <Text style={styles.wordmark}>WITNESS</Text>
        <View style={styles.wordmarkDot} />
      </View>
      <Text style={styles.tagline}>
        Your ancestors witnessed history. Witness helps you see them.
      </Text>

      <ThemedView type="backgroundElement" style={[styles.card, styles.cardWidth]}>
        <ThemedText type="subtitle">Sign in</ThemedText>
        {confirm === 'sent' && (
          <ThemedText type="small">
            Check your email to confirm your account — then sign in right here.
          </ThemedText>
        )}
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
          placeholder="Password"
          secureTextEntry={!showPassword}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={handleSignIn}
          value={password}
          onChangeText={setPassword}
        />
        <ThemedText type="link" onPress={() => setShowPassword((s) => !s)} style={{ alignSelf: 'flex-end' }}>
          {showPassword ? 'Hide password' : 'Show password'}
        </ThemedText>
        <Button title="Sign in" busy={isSubmitting} onPress={handleSignIn} />
        <AppleSignInButton intent="sign-in" />
        <Link href="/forgot-password">
          <ThemedText type="link">Forgot password?</ThemedText>
        </Link>
        <Link href="/sign-up">
          <ThemedText type="link">Need an account? Sign up</ThemedText>
        </Link>
      </ThemedView>
    </ScrollView>
  );

  return (
    <View style={styles.flex}>
      {/* Not absoluteFill: react-native-web keeps the image's intrinsic
          height under it, leaving a bare band below the hero. */}
      <Image
        source={require('@/assets/images/hero.png')}
        style={styles.hero}
        resizeMode="cover"
      />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  scrim: { backgroundColor: 'rgba(20,17,15,0.62)' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  wordmark: {
    fontFamily: BrandFonts.serif.semiBold,
    color: PARCHMENT,
    fontSize: 26,
    letterSpacing: 4,
  },
  wordmarkDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: AMBER },
  tagline: {
    fontFamily: BrandFonts.sans.regular,
    color: PARCHMENT_MUTED,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  // Capped so email/password inputs stay a normal reading width on a wide
  // browser window instead of stretching edge to edge.
  cardWidth: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
});
