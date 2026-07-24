import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Masthead, PageShell, useBroadsheet } from '@/components/broadsheet';
import { Card } from '@/components/card';
import { RecordText } from '@/components/record-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Broadsheet, BrandFonts } from '@/constants/theme';
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
  const broadsheet = useBroadsheet();

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

  if (broadsheet) {
    const C = Broadsheet.color;
    const openCount = briefs?.filter((b) => b.status === 'open').length ?? 0;
    return (
      <PageShell
        masthead={
          <Masthead
            title="Research"
            metaMono={briefs ? `${briefs.length} BRIEFS · ${openCount} OPEN` : ''}
            metaCaption="Your brick walls, and the briefs to break them"
          />
        }
      >
        {briefs === null ? (
          <ActivityIndicator style={{ marginVertical: 40 }} />
        ) : briefs.length === 0 ? (
          <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 18, color: C.inkSecondary }}>
            No open briefs. Start one from any ancestor whose record has gaps — the Research tab on
            their page writes it for you.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
            {briefs.map((brief) => (
              <Pressable
                key={brief.id}
                onPress={() =>
                  router.push({ pathname: '/research/[briefId]', params: { briefId: brief.id } })
                }
                style={{
                  width: '31%',
                  minWidth: 240,
                  backgroundColor: C.paperRaised,
                  borderWidth: 1,
                  borderColor: C.rule,
                  borderRadius: 3,
                  padding: 18,
                  gap: 10,
                  minHeight: 130,
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    fontFamily: BrandFonts.serif.regular,
                    fontSize: 20,
                    lineHeight: 27,
                    color: C.ink,
                  }}
                >
                  {brief.title}
                </Text>
                <RecordText accent={brief.status === 'open'} muted={brief.status !== 'open'}>
                  {STATUS_LABELS[brief.status]} · {new Date(brief.created_at).toLocaleDateString()}
                </RecordText>
              </Pressable>
            ))}
          </View>
        )}
      </PageShell>
    );
  }

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
