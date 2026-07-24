import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, View } from 'react-native';

import { BriefMarkdown } from '@/components/brief-markdown';
import { Button } from '@/components/button';
import { RecordText } from '@/components/record-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

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
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 8 }}>
        <ThemedText type="title">{brief.title}</ThemedText>
        <RecordText>
          {brief.status.replace('_', ' ')} · {new Date(brief.created_at).toLocaleDateString()}
        </RecordText>

        {/* One primary action; status changes are a small control group,
            not a stack of full-width buttons (redesign §3.5). */}
        <View style={{ marginTop: 6 }}>
          <Button
            title="Share this brief"
            onPress={() => Share.share({ message: `${brief.title}\n\n${brief.content}` })}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 22, marginTop: 2, marginBottom: 6 }}>
          {NEXT_STATUS[brief.status].map((action) => (
            <ThemedText key={action.to} type="link" onPress={() => setStatus(action.to)}>
              {action.label}
            </ThemedText>
          ))}
        </View>

        <BriefMarkdown content={brief.content} />
      </ScrollView>
    </ThemedView>
  );
}
