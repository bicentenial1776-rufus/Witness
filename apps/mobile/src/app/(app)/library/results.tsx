import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import type { LibraryCatalogEntry, LibraryMatch } from '@witness/core/query';

import { ThemedText } from '@/components/themed-text';
import { KinReveal } from '@/components/kin-reveal';
import { ThemedView } from '@/components/themed-view';
import { getPinnedIds, runLibraryQuery, setPinned } from '@/lib/library-cache';
import { getKinMap, type Kin } from '@/lib/relationship-cache';
import { useTheme } from '@/hooks/use-theme';
import { WideContent } from '@/constants/theme';

const MAX_ROWS = 600;

/**
 * A Library question answered: the matching ancestors, each a door into
 * their own page — where the lived-through tags open the next question.
 */
export default function LibraryResultsScreen() {
  const theme = useTheme();
  const { queryId, treeId } = useLocalSearchParams<{ queryId: string; treeId: string }>();
  const [entry, setEntry] = useState<LibraryCatalogEntry | null>(null);
  const [matches, setMatches] = useState<LibraryMatch[] | null>(null);
  const [relationships, setRelationships] = useState<Map<string, Kin>>(new Map());
  const [pinned, setPinnedState] = useState(false);

  useEffect(() => {
    if (!queryId || !treeId) return;
    let cancelled = false;
    runLibraryQuery(treeId, queryId).then((result) => {
      if (cancelled || !result) return;
      setEntry(result.entry);
      setMatches(result.matches);
    });
    getKinMap(treeId).then((map) => !cancelled && setRelationships(map));
    getPinnedIds().then((p) => !cancelled && setPinnedState(p.has(queryId)));
    return () => {
      cancelled = true;
    };
  }, [queryId, treeId]);

  async function togglePin() {
    const next = !pinned;
    setPinnedState(next);
    await setPinned(queryId!, next).catch(() => {});
  }

  const shown = matches?.slice(0, MAX_ROWS) ?? [];

  return (
    <ThemedView style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48 }}
        data={shown}
        keyExtractor={(item) => item.individual.id}
        ListHeaderComponent={
          <View style={{ gap: 6, marginBottom: 12 }}>
            <ThemedText type="title">{entry?.title ?? '…'}</ThemedText>
            {entry?.detail && <ThemedText type="small">{entry.detail}</ThemedText>}
            {matches && (
              <ThemedText type="subtitle" themeColor="accent">
                {matches.length.toLocaleString()}{' '}
                {matches.length === 1 ? 'ancestor' : 'ancestors'}
              </ThemedText>
            )}
            {matches && matches.length > MAX_ROWS && (
              <ThemedText type="small">Showing the first {MAX_ROWS}.</ThemedText>
            )}
            {matches && matches.length === 0 && (
              <ThemedText type="small">
                No one in your tree answers this question yet — that’s an answer too. As your
                research grows, a fresh import may change it.
              </ThemedText>
            )}
            <Pressable onPress={togglePin} hitSlop={8}>
              <ThemedText type="small" themeColor="accent">
                {pinned ? '★ Pinned' : '☆ Pin this question'}
              </ThemedText>
            </Pressable>
            {!matches && <ActivityIndicator style={{ marginVertical: 24 }} />}
          </View>
        }
        renderItem={({ item }) => {
          const relationship = relationships.get(item.individual.id);
          return (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })
              }
              style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              <ThemedText>{item.individual.full_name}</ThemedText>
              {relationship ? <KinReveal tier={relationship.tier} label={relationship.label} /> : null}
              <ThemedText type="small">
                {item.individual.birth_year ?? '?'}–
                {item.individual.living ? '' : (item.individual.death_year ?? '?')}
                {item.note ? ` · ${item.note}` : ''}
              </ThemedText>
            </Pressable>
          );
        }}
      />
    </ThemedView>
  );
}
