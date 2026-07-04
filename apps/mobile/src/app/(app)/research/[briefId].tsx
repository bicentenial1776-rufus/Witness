import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, Share, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

interface Brief {
  id: string;
  title: string;
  content: string;
  status: 'open' | 'in_progress' | 'resolved' | 'archived';
  created_at: string;
}

const NEXT_STATUS: Record<Brief['status'], { label: string; to: Brief['status'] }[]> = {
  open: [
    { label: 'Mark in progress', to: 'in_progress' },
    { label: 'Mark resolved', to: 'resolved' },
  ],
  in_progress: [
    { label: 'Mark resolved', to: 'resolved' },
    { label: 'Back to open', to: 'open' },
  ],
  resolved: [{ label: 'Reopen', to: 'open' }],
  archived: [{ label: 'Reopen', to: 'open' }],
};

export default function BriefScreen() {
  const { briefId } = useLocalSearchParams<{ briefId: string }>();
  const [brief, setBrief] = useState<Brief | null>(null);

  useEffect(() => {
    if (!briefId) return;
    let cancelled = false;
    supabase
      .from('research_briefs')
      .select('id, title, content, status, created_at')
      .eq('id', briefId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setBrief(data);
      });
    return () => {
      cancelled = true;
    };
  }, [briefId]);

  async function setStatus(status: Brief['status']) {
    if (!brief) return;
    const { error } = await supabase
      .from('research_briefs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', brief.id);
    if (!error) setBrief({ ...brief, status });
  }

  if (!brief) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, paddingTop: 72 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48, gap: 8 }}>
        <ThemedText type="link" onPress={() => router.back()}>
          ‹ Back
        </ThemedText>
        <ThemedText type="title">{brief.title}</ThemedText>
        <ThemedText type="small">
          {brief.status.replace('_', ' ')} · generated {new Date(brief.created_at).toLocaleDateString()}
        </ThemedText>

        <Button
          title="Share this brief"
          onPress={() => Share.share({ message: `${brief.title}\n\n${brief.content}` })}
        />
        <View style={{ gap: 8 }}>
          {NEXT_STATUS[brief.status].map((action) => (
            <Button key={action.to} title={action.label} onPress={() => setStatus(action.to)} />
          ))}
        </View>

        <ThemedText style={{ marginTop: 8 }}>{brief.content}</ThemedText>
      </ScrollView>
    </ThemedView>
  );
}
