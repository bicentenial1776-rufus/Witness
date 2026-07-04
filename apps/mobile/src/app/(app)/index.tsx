import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { supabase } from '@/lib/supabase';

interface TreeRow {
  id: string;
  name: string;
  individual_count: number;
  family_count: number;
  place_count: number;
  imported_at: string;
}

export default function Home() {
  const { session } = useSession();
  const [trees, setTrees] = useState<TreeRow[] | null>(null);

  const loadTrees = useCallback(async () => {
    const { data, error } = await supabase
      .from('trees')
      .select('id, name, individual_count, family_count, place_count, imported_at')
      .order('imported_at', { ascending: false });
    if (error) {
      Alert.alert('Could not load trees', error.message);
      return;
    }
    setTrees(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTrees();
    }, [loadTrees]),
  );

  function confirmDelete(tree: TreeRow) {
    Alert.alert(
      `Delete "${tree.name}"?`,
      `This removes the imported copy (${tree.individual_count.toLocaleString()} people) from Witness. Your GEDCOM file is untouched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('trees').delete().eq('id', tree.id);
            if (error) Alert.alert('Delete failed', error.message);
            else loadTrees();
          },
        },
      ],
    );
  }

  return (
    <ThemedView style={{ flex: 1, padding: 24, paddingTop: 72, gap: 12 }}>
      <ThemedText type="title">Witness</ThemedText>
      <ThemedText>Signed in as {session?.user.email}</ThemedText>

      {trees === null ? (
        <ActivityIndicator style={{ marginVertical: 24 }} />
      ) : trees.length === 0 ? (
        <View style={{ gap: 12, marginVertical: 24 }}>
          <ThemedText type="subtitle">No tree yet</ThemedText>
          <ThemedText>Import a GEDCOM file to bring your family history into Witness.</ThemedText>
        </View>
      ) : (
        <FlatList
          data={trees}
          keyExtractor={(tree) => tree.id}
          style={{ flexGrow: 0, marginVertical: 12 }}
          renderItem={({ item }) => (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#999',
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                gap: 4,
              }}
            >
              <ThemedText type="subtitle">{item.name}</ThemedText>
              <ThemedText>
                {item.individual_count.toLocaleString()} people ·{' '}
                {item.family_count.toLocaleString()} families ·{' '}
                {item.place_count.toLocaleString()} places
              </ThemedText>
              <ThemedText>Imported {new Date(item.imported_at).toLocaleDateString()}</ThemedText>
              <Pressable onPress={() => confirmDelete(item)}>
                <ThemedText type="link">Delete</ThemedText>
              </Pressable>
            </View>
          )}
        />
      )}

      <Link href="/import" asChild>
        <Button title="Import GEDCOM file" />
      </Link>
      <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
    </ThemedView>
  );
}
