import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { armDigestNotification } from '@/lib/digest-notifications';

/**
 * The habit surface. Tree management lives on the You tab; Home is what's
 * new in your family's history right now.
 */
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
          activeTree && (
            <Card
              onPress={() => router.push({ pathname: '/digest', params: { treeId: activeTree.id } })}
            >
              <ThemedText type="smallBold" themeColor="accent">
                THIS WEEK
              </ThemedText>
              <ThemedText type="subtitle">This week in your family</ThemedText>
              <ThemedText>The anniversaries your tree marks over the next seven days.</ThemedText>
              <ThemedText type="link">Read the week ›</ThemedText>
            </Card>
          )
        )}
      </ScrollView>
    </ThemedView>
  );
}
