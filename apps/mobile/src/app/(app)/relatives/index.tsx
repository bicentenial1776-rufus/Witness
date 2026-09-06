import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { groupByKind, type KinGroup } from '@witness/core/family';

import { SeenFromBand, useSeenFrom } from '@/components/seen-from';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WideContent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
import { getRowsSeenFrom, type PerspectiveRow } from '@/lib/perspective-rows';

/**
 * Relatives by kind (a reader, 2026-09-06: "Show me my first cousins.
 * Show me my mom's first cousins."). Every relationship the engine has
 * labelled, shelved by kind and closest first, with a count; a kind opens
 * as a list. The band at the top changes whose relatives these are.
 */
export default function RelativesScreen() {
  const theme = useTheme();
  const { activeTree, loadFailed } = useActiveTree();
  const treeId = activeTree?.id;
  const perspective = useSeenFrom();
  const [rows, setRows] = useState<PerspectiveRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    getRowsSeenFrom(treeId, perspective?.id ?? null)
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [treeId, perspective?.id]);

  const groups = useMemo(() => (rows ? groupByKind(rows) : []), [rows]);
  const own = groups.filter((g) => !g.key.startsWith('spouse:'));
  const spouses = groups.filter((g) => g.key.startsWith('spouse:'));
  const whose = perspective ? `${perspective.name.split(' ')[0]}’s` : 'your';

  if (!activeTree) {
    return (
      <ThemedView style={{ flex: 1, padding: 24 }}>
        <ThemedText>{noTreeMessage(loadFailed, 'to see its relatives by kind')}</ThemedText>
      </ThemedView>
    );
  }

  const open = (group: KinGroup) =>
    router.push({ pathname: '/relatives/[kind]', params: { kind: group.key, title: group.title } } as never);

  const row = (group: KinGroup) => (
    <Pressable
      key={group.key}
      onPress={() => open(group)}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      }}
    >
      <ThemedText style={{ flexShrink: 1 }}>{group.title}</ThemedText>
      <ThemedText type="small">
        {group.ids.length.toLocaleString()} ›
      </ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Relatives by Kind' }} />
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 8 }}>
        <SeenFromBand treeId={activeTree.id} />
        {error && <ThemedText>Something went wrong: {error}</ThemedText>}
        {!rows && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}
        {rows && groups.length === 0 && (
          <ThemedText>No relationships are computed for this person yet.</ThemedText>
        )}
        {own.length > 0 && (
          <View>
            <ThemedText type="subtitle" style={{ marginBottom: 4 }}>
              {whose.charAt(0).toUpperCase() + whose.slice(1)} own family
            </ThemedText>
            {own.map(row)}
          </View>
        )}
        {spouses.length > 0 && (
          <View style={{ marginTop: 18 }}>
            <ThemedText type="subtitle" style={{ marginBottom: 4 }}>
              By marriage
            </ThemedText>
            {spouses.map(row)}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}
