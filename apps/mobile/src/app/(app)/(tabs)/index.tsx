import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree, type TreeRow } from '@/lib/active-tree';
import { armDigestNotification } from '@/lib/digest-notifications';
import { invalidateGeographyCache } from '@/lib/geography-cache';
import { invalidateRelationshipCache } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const { trees, activeTree, refresh } = useActiveTree();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Keep next Sunday's digest notification armed with fresh content.
  useEffect(() => {
    if (activeTree) armDigestNotification(activeTree.id).catch(() => {});
  }, [activeTree?.id]);

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
              invalidateRelationshipCache();
              refresh();
            }
          },
        },
      ],
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72, paddingBottom: 48, gap: 12 }}>
        <ThemedText type="title">Witness</ThemedText>
        <ThemedText type="small" style={{ marginTop: -8 }}>
          Witnesses to history
        </ThemedText>

        {trees === null ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : trees.length === 0 ? (
          <Card onPress={() => router.push('/import')} style={{ marginTop: 12 }}>
            <ThemedText type="subtitle">Bring your family in</ThemedText>
            <ThemedText>
              Import the GEDCOM file from Ancestry, FamilySearch, or any tree you’ve built, and
              Witness will start connecting it to history.
            </ThemedText>
            <ThemedText type="link">Import a GEDCOM file ›</ThemedText>
          </Card>
        ) : (
          <>
            {activeTree && (
              <Card
                onPress={() =>
                  router.push({ pathname: '/digest', params: { treeId: activeTree.id } })
                }
              >
                <ThemedText type="smallBold" themeColor="accent">
                  THIS WEEK
                </ThemedText>
                <ThemedText type="subtitle">This week in your family</ThemedText>
                <ThemedText>The anniversaries your tree marks over the next seven days.</ThemedText>
                <ThemedText type="link">Read the week ›</ThemedText>
              </Card>
            )}

            {trees.map((tree) => (
              <Card key={tree.id}>
                <ThemedText type="subtitle">{tree.name}</ThemedText>
                <ThemedText type="small">
                  {tree.individual_count.toLocaleString()} people ·{' '}
                  {tree.family_count.toLocaleString()} families ·{' '}
                  {tree.place_count.toLocaleString()} places
                </ThemedText>
                <ThemedText type="small">
                  Imported {new Date(tree.imported_at).toLocaleDateString()}
                </ThemedText>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                  <ThemedText
                    type="link"
                    onPress={() =>
                      router.push({ pathname: '/home-person', params: { treeId: tree.id } })
                    }
                  >
                    {tree.home_person ? `You are ${tree.home_person.full_name}` : 'Tell us who you are'}
                  </ThemedText>
                  <ThemedText type="link" onPress={() => confirmDelete(tree)}>
                    Delete
                  </ThemedText>
                </View>
              </Card>
            ))}

            <ThemedText type="link" style={{ marginTop: 4 }} onPress={() => router.push('/import')}>
              Import another tree ›
            </ThemedText>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}
