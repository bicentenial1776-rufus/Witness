import { Button } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const { session } = useSession();

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <ThemedText type="title">Witness</ThemedText>
      <ThemedText>Signed in as {session?.user.email}</ThemedText>
      <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
    </ThemedView>
  );
}
