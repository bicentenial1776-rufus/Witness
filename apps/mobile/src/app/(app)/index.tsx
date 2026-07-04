import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Button, FlatList, Pressable, View } from 'react-native';

import { HISTORICAL_EVENTS, type HistoricalEvent } from '@witness/core/history';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { invalidateGeographyCache } from '@/lib/geography-cache';
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
            else {
              invalidateGeographyCache();
              loadTrees();
            }
          },
        },
      ],
    );
  }

  // Until there's an active-tree selector, everything queries the richest tree.
  const activeTree = trees?.length
    ? [...trees].sort((a, b) => b.individual_count - a.individual_count)[0]
    : undefined;

  function openEvent(event: HistoricalEvent) {
    if (!activeTree) return;
    router.push({
      pathname: '/query/[eventId]',
      params: { eventId: event.id, treeId: activeTree.id },
    });
  }

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <ThemedText type="title">Witness</ThemedText>
      <ThemedText type="small">Signed in as {session?.user.email}</ThemedText>

      {trees === null ? (
        <ActivityIndicator style={{ marginVertical: 24 }} />
      ) : trees.length === 0 ? (
        <View style={{ gap: 12, marginVertical: 12 }}>
          <ThemedText type="subtitle">No tree yet</ThemedText>
          <ThemedText>Import a GEDCOM file to bring your family history into Witness.</ThemedText>
        </View>
      ) : (
        trees.map((tree) => (
          <View
            key={tree.id}
            style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, gap: 4 }}
          >
            <ThemedText type="subtitle">{tree.name}</ThemedText>
            <ThemedText type="small">
              {tree.individual_count.toLocaleString()} people ·{' '}
              {tree.family_count.toLocaleString()} families ·{' '}
              {tree.place_count.toLocaleString()} places
            </ThemedText>
            <ThemedText type="small">
              Imported {new Date(tree.imported_at).toLocaleDateString()}
            </ThemedText>
            <Pressable onPress={() => confirmDelete(tree)}>
              <ThemedText type="link">Delete</ThemedText>
            </Pressable>
          </View>
        ))
      )}

      <Link href="/import" asChild>
        <Button title="Import GEDCOM file" />
      </Link>
      <Button title="Sign out" onPress={() => supabase.auth.signOut()} />

      {activeTree && (
        <>
          <ThemedText type="subtitle" style={{ marginTop: 12 }}>
            Explore
          </ThemedText>
          <Pressable
            onPress={() => router.push({ pathname: '/places', params: { treeId: activeTree.id } })}
            style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, gap: 2 }}
          >
            <ThemedText>Where your family lived</ThemedText>
            <ThemedText type="small">Every state, province, and country in your tree</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/migrations', params: { treeId: activeTree.id } })}
            style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, gap: 2 }}
          >
            <ThemedText>Migration paths</ThemedText>
            <ThemedText type="small">The moves your family made, generation by generation</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/research')}
            style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, gap: 2 }}
          >
            <ThemedText>Research queue</ThemedText>
            <ThemedText type="small">Your open brick walls and the briefs to break them</ThemedText>
          </Pressable>

          <ThemedText type="subtitle" style={{ marginTop: 12 }}>
            Who was alive during…
          </ThemedText>
        </>
      )}
    </View>
  );

  return (
    <ThemedView style={{ flex: 1, paddingTop: 72 }}>
      <FlatList
        data={trees?.length ? HISTORICAL_EVENTS : []}
        keyExtractor={(event) => event.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openEvent(item)}
            style={{ borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, marginBottom: 8, gap: 2 }}
          >
            <ThemedText>{item.name}</ThemedText>
            <ThemedText type="small">
              {item.startYear === item.endYear ? item.startYear : `${item.startYear}–${item.endYear}`} ·{' '}
              {item.region}
            </ThemedText>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}
