import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { armDigestNotification } from '@/lib/digest-notifications';
import { WideContent } from '@/constants/theme';

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
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingTop: 72, paddingBottom: 48, gap: 12 }}>
        <ThemedText type="title">Witness</ThemedText>
        <ThemedText type="small" style={{ marginTop: -8 }}>
          Witnesses to history
        </ThemedText>

        {trees === null ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : trees.length === 0 ? (
          <Card onPress={() => router.push('/import-guide')} style={{ marginTop: 12 }}>
            <ThemedText type="subtitle">Bring your family in</ThemedText>
            <ThemedText>
              Your tree lives on Ancestry, FamilySearch, or another platform — Witness will walk
              you through getting it out and bringing it to life.
            </ThemedText>
            <ThemedText type="link">Show me how ›</ThemedText>
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
