import { Stack, router, useLocalSearchParams } from 'expo-router';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WideContent } from '@/constants/theme';
import { useActiveTree } from '@/lib/active-tree';

/**
 * Four computed shapes a family makes over time, gathered under one roof.
 *
 * These shipped as four equal cards on the Explore shelf, where each read as a
 * separate small tool a user had to already know about. They are not tools —
 * they are findings, and a finding on its own screen can only be found by
 * someone who went looking for it. Collapsing them here is the first place in
 * the app where several features are presented as one thing
 * (docs/cohesion-design-brief.md).
 */
const PATTERNS = [
  {
    key: 'origins',
    path: '/origins' as const,
    title: 'Where your family began',
    detail: 'The earliest places your tree reaches back to',
  },
  {
    key: 'migrations',
    path: '/migrations' as const,
    title: 'The moves they made',
    detail: 'Migration paths, generation by generation',
  },
  {
    key: 'crossings',
    path: '/crossings' as const,
    title: 'Ocean crossings',
    detail: 'Ancestors who crossed the Atlantic or the Pacific',
  },
  {
    key: 'kindred',
    path: '/kindred' as const,
    title: 'Kindred couples',
    detail: 'Spouses who turned out to share an ancestor — however far back',
  },
];

export default function PatternsScreen() {
  const { activeTree } = useActiveTree();
  const { treeId: paramTreeId } = useLocalSearchParams<{ treeId?: string }>();
  const treeId = paramTreeId ?? activeTree?.id;

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Patterns' }} />
      <ThemedView style={{ ...WideContent, padding: 24, gap: 8 }}>
        <ThemedText type="small">
          Four shapes a family makes over generations — where it started, where it went, what
          it crossed, and who it turned out to already be related to.
        </ThemedText>
        {PATTERNS.map((pattern) => (
          <Card
            key={pattern.key}
            onPress={() => router.push({ pathname: pattern.path, params: { treeId } })}
          >
            <ThemedText type="subtitle">{pattern.title}</ThemedText>
            <ThemedText type="small">{pattern.detail}</ThemedText>
          </Card>
        ))}
      </ThemedView>
    </ThemedView>
  );
}
