import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView } from 'react-native';

import { LIBRARY_CATEGORIES, type LibraryCatalogEntry } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { getCatalog, getLibraryCounts, getPinnedIds, setPinned } from '@/lib/library-cache';
import { WideContent } from '@/constants/theme';

/**
 * One category of the Library: its questions with live counts, strongest
 * answers first. Questions the tree can't answer sink to the bottom,
 * grayed — data gaps read as research motivation, not dead ends.
 */
export default function LibraryCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const { activeTree } = useActiveTree();
  const [catalog, setCatalog] = useState<LibraryCatalogEntry[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [pins, setPins] = useState<Set<string>>(new Set());

  const meta = LIBRARY_CATEGORIES.find((c) => c.id === category);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getCatalog().then((c) => !cancelled && setCatalog(c)).catch(() => {});
      getPinnedIds().then((p) => !cancelled && setPins(p));
      if (activeTree) {
        getLibraryCounts(activeTree.id).then((c) => !cancelled && setCounts(c)).catch(() => {});
      }
      return () => {
        cancelled = true;
      };
    }, [activeTree?.id]),
  );

  async function togglePin(id: string) {
    const next = new Set(pins);
    const pinning = !next.has(id);
    if (pinning) next.add(id);
    else next.delete(id);
    setPins(next);
    await setPinned(id, pinning).catch(() => {});
  }

  const entries = (catalog ?? [])
    .filter((entry) => entry.category === category)
    .sort((a, b) => {
      const ca = counts?.get(a.id) ?? 0;
      const cb = counts?.get(b.id) ?? 0;
      // Answered questions first (by catalog order); unanswered sink.
      if ((ca > 0) !== (cb > 0)) return ca > 0 ? -1 : 1;
      return a.sort_order - b.sort_order;
    });

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 12 }}>
        <ThemedText type="title">{meta?.title ?? 'Library'}</ThemedText>
        {meta && <ThemedText type="small">{meta.blurb}</ThemedText>}

        {!catalog && <ActivityIndicator style={{ marginVertical: 24 }} />}

        {entries.map((entry) => {
          const count = counts?.get(entry.id);
          const empty = count === 0;
          return (
            <Card
              key={entry.id}
              onPress={() =>
                activeTree &&
                router.push({
                  pathname: '/library/results',
                  params: { queryId: entry.id, treeId: activeTree.id },
                })
              }
              style={{ paddingVertical: 12, opacity: empty ? 0.55 : 1 }}
            >
              <ThemedText>{entry.title}</ThemedText>
              {entry.detail && <ThemedText type="small">{entry.detail}</ThemedText>}
              <ThemedText type="small" themeColor={empty ? undefined : 'accent'}>
                {count === undefined
                  ? '…'
                  : empty
                    ? 'no answers in your tree yet'
                    : `${count.toLocaleString()} ${count === 1 ? 'ancestor' : 'ancestors'} ›`}
              </ThemedText>
              <Pressable onPress={() => togglePin(entry.id)} hitSlop={8}>
                <ThemedText type="small" themeColor="accent">
                  {pins.has(entry.id) ? '★ Pinned' : '☆ Pin this question'}
                </ThemedText>
              </Pressable>
            </Card>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}
