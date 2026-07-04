import { router } from 'expo-router';
import { FlatList, View } from 'react-native';

import { HISTORICAL_EVENTS, type HistoricalEvent } from '@witness/core/history';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';

export default function ExploreTab() {
  const { activeTree } = useActiveTree();

  function openEvent(event: HistoricalEvent) {
    if (!activeTree) return;
    router.push({ pathname: '/query/[eventId]', params: { eventId: event.id, treeId: activeTree.id } });
  }

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <ThemedText type="title">Explore</ThemedText>

      {activeTree ? (
        <>
          <Card
            onPress={() => router.push({ pathname: '/places', params: { treeId: activeTree.id } })}
          >
            <ThemedText type="subtitle">Where your family lived</ThemedText>
            <ThemedText type="small">Every state, province, and country in your tree</ThemedText>
          </Card>
          <Card
            onPress={() =>
              router.push({ pathname: '/migrations', params: { treeId: activeTree.id } })
            }
          >
            <ThemedText type="subtitle">Migration paths</ThemedText>
            <ThemedText type="small">The moves your family made, generation by generation</ThemedText>
          </Card>

          <ThemedText type="subtitle" style={{ marginTop: 12 }}>
            Who was alive during…
          </ThemedText>
        </>
      ) : (
        <ThemedText>Import a tree to start exploring.</ThemedText>
      )}
    </View>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <FlatList
        data={activeTree ? HISTORICAL_EVENTS : []}
        keyExtractor={(event) => event.id}
        contentContainerStyle={{ padding: 24, paddingTop: 72, paddingBottom: 48 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <Card onPress={() => openEvent(item)} style={{ marginBottom: 8 }}>
            <ThemedText>{item.name}</ThemedText>
            <ThemedText type="small">
              {item.startYear === item.endYear ? item.startYear : `${item.startYear}–${item.endYear}`} ·{' '}
              {item.region}
            </ThemedText>
          </Card>
        )}
      />
    </ThemedView>
  );
}
