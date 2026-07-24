import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';

import { LIBRARY_CATEGORIES, type LibraryCatalogEntry } from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { getCatalog, getLibraryCounts, getPinnedIds } from '@/lib/library-cache';
import { useTheme } from '@/hooks/use-theme';
import { WideContent } from '@/constants/theme';

/**
 * The Library index: search across every question, pinned questions first,
 * then the categories. Every entry shows its live count for this tree —
 * the reader browses their family's answers, not a generic menu.
 */
export default function LibraryScreen() {
  const theme = useTheme();
  const { activeTree } = useActiveTree();
  const [catalog, setCatalog] = useState<LibraryCatalogEntry[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [needle, setNeedle] = useState('');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getCatalog().then((c) => !cancelled && setCatalog(c)).catch(() => {});
      getPinnedIds().then((p) => !cancelled && setPinned(p));
      if (activeTree) {
        getLibraryCounts(activeTree.id).then((c) => !cancelled && setCounts(c)).catch(() => {});
      }
      return () => {
        cancelled = true;
      };
    }, [activeTree?.id]),
  );

  const query = needle.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!catalog || query.length < 2) return null;
    return catalog.filter(
      (entry) =>
        entry.title.toLowerCase().includes(query) ||
        entry.keywords.some((k) => k.toLowerCase().includes(query)) ||
        entry.category.includes(query),
    );
  }, [catalog, query]);

  const openQuery = (id: string) =>
    activeTree &&
    router.push({ pathname: '/library/results', params: { queryId: id, treeId: activeTree.id } });

  const renderRow = (entry: LibraryCatalogEntry) => {
    const count = counts?.get(entry.id);
    return (
      <Card key={entry.id} onPress={() => openQuery(entry.id)} style={{ paddingVertical: 12 }}>
        <ThemedText>
          {pinned.has(entry.id) ? '★ ' : ''}
          {entry.title}
        </ThemedText>
        <ThemedText type="small" themeColor={count ? 'accent' : undefined}>
          {count === undefined
            ? '…'
            : count === 0
              ? 'no answers in your tree yet'
              : `${count.toLocaleString()} ${count === 1 ? 'ancestor' : 'ancestors'}`}
        </ThemedText>
      </Card>
    );
  };

  const pinnedEntries = catalog?.filter((entry) => pinned.has(entry.id)) ?? [];

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 12 }}>
        <ThemedText type="title">The Library</ThemedText>
        <ThemedText type="small">
          Every question Witness can ask of your tree — with your family&rsquo;s answers.
        </ThemedText>

        <TextInput
          value={needle}
          onChangeText={setNeedle}
          placeholder="Search — war, Ireland, longevity…"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 16,
            color: theme.text,
            backgroundColor: theme.backgroundElement,
          }}
        />

        {!catalog && <ActivityIndicator style={{ marginVertical: 24 }} />}

        {searchResults ? (
          searchResults.length === 0 ? (
            <ThemedText type="small">Nothing matches — try a broader word.</ThemedText>
          ) : (
            searchResults.map(renderRow)
          )
        ) : (
          <>
            {pinnedEntries.length > 0 && (
              <>
                <ThemedText type="smallBold" themeColor="accent" style={{ marginTop: 8 }}>
                  PINNED
                </ThemedText>
                {pinnedEntries.map(renderRow)}
              </>
            )}

            {activeTree && (
              <Card
                onPress={() =>
                  router.push({ pathname: '/library/moments', params: { treeId: activeTree.id } })
                }
              >
                <ThemedText type="subtitle">Moments in history</ThemedText>
                <ThemedText type="small">
                  The whole timeline, oldest first — wars, crossings, gold rushes — and who in
                  your family was alive for each.
                </ThemedText>
                <ThemedText type="smallBold" themeColor="accent">
                  Browse the timeline ›
                </ThemedText>
              </Card>
            )}

            {catalog &&
              LIBRARY_CATEGORIES.map((category) => {
                const entries = catalog.filter((e) => e.category === category.id);
                if (entries.length === 0) return null;
                const answered = entries.filter((e) => (counts?.get(e.id) ?? 0) > 0).length;
                return (
                  <Card
                    key={category.id}
                    onPress={() =>
                      router.push({
                        pathname: '/library/[category]',
                        params: { category: category.id },
                      })
                    }
                  >
                    <ThemedText type="subtitle">{category.title}</ThemedText>
                    <ThemedText type="small">{category.blurb}</ThemedText>
                    {counts && (
                      <ThemedText type="small">
                        {answered} of {entries.length} questions have answers in your tree
                      </ThemedText>
                    )}
                    <ThemedText type="smallBold" themeColor="accent">
                      Browse all {entries.length} questions ›
                    </ThemedText>
                  </Card>
                );
              })}
          </>
        )}

        <View style={{ marginTop: 8 }}>
          <ThemedText type="small">
            The Library grows — new questions appear here without an app update.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}
