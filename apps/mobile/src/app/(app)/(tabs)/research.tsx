import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

interface BriefRow {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'resolved' | 'archived';
  created_at: string;
}

export const STATUS_LABELS: Record<BriefRow['status'], string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  archived: 'Archived',
};

export default function ResearchTab() {
  const [briefs, setBriefs] = useState<BriefRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      supabase
        .from('research_briefs')
        .select('id, title, status, created_at')
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (!cancelled) setBriefs(data ?? []);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <ThemedView style={{ flex: 1, padding: 24, paddingTop: 72, gap: 8 }}>
      <ThemedText type="title">Research</ThemedText>
      <ThemedText type="small">Your open brick walls and the briefs to break them</ThemedText>

      {briefs === null ? (
        <ActivityIndicator style={{ marginVertical: 24 }} />
      ) : briefs.length === 0 ? (
        <ThemedText style={{ marginTop: 12 }}>
          No open briefs. Start one from any ancestor whose record has gaps.
        </ThemedText>
      ) : (
        <FlatList
          data={briefs}
          keyExtractor={(brief) => brief.id}
          style={{ marginTop: 12 }}
          renderItem={({ item }) => (
            <Card
              onPress={() =>
                router.push({ pathname: '/research/[briefId]', params: { briefId: item.id } })
              }
              style={{ marginBottom: 8 }}
            >
              <ThemedText>{item.title}</ThemedText>
              <ThemedText type="small">
                {STATUS_LABELS[item.status]} · {new Date(item.created_at).toLocaleDateString()}
              </ThemedText>
            </Card>
          )}
        />
      )}
    </ThemedView>
  );
}
