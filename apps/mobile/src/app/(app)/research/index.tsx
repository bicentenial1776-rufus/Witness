import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Masthead, PageShell, useBroadsheet } from '@/components/broadsheet';
import { Card } from '@/components/card';
import { RecordText } from '@/components/record-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Broadsheet, BrandFonts } from '@/constants/theme';
import { useActiveTree } from '@/lib/active-tree';
import { formatDate } from '@/lib/format-date';
import { ledgerEntries, ledgerHeading, useResearchLedger } from '@/lib/research-ledger';
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

type BriefFilter = 'all' | 'open' | 'resolved';

export default function ResearchTab() {
  const { activeTree } = useActiveTree();
  const [briefs, setBriefs] = useState<BriefRow[] | null>(null);
  const [filter, setFilter] = useState<BriefFilter>('all');
  const broadsheet = useBroadsheet();
  const { ledger, reload: reloadLedger } = useResearchLedger(activeTree?.id);
  const entries = ledger ? ledgerEntries(ledger) : [];

  // Judgments are made on other screens, so the ledger is stale by the time
  // the reader comes back to it — refresh on focus, not just on mount.
  useFocusEffect(
    useCallback(() => {
      reloadLedger();
    }, [reloadLedger]),
  );

  useFocusEffect(
    useCallback(() => {
      // Briefs belong to a tree — without the filter a second imported
      // tree's briefs would interleave here unlabeled.
      if (!activeTree) return;
      let cancelled = false;
      supabase
        .from('research_briefs')
        .select('id, title, status, created_at')
        .eq('tree_id', activeTree.id)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (!cancelled) setBriefs(data ?? []);
        });
      return () => {
        cancelled = true;
      };
    }, [activeTree?.id]),
  );

  if (broadsheet) {
    const C = Broadsheet.color;
    const openCount = briefs?.filter((b) => b.status === 'open').length ?? 0;
    // "Open" is everything not yet resolved; "Resolved" is the shelf of wins.
    const shown = (briefs ?? []).filter((b) =>
      filter === 'all' ? true : filter === 'resolved' ? b.status === 'resolved' : b.status !== 'resolved',
    );
    const FILTERS: { key: BriefFilter; label: string; count: number }[] = [
      { key: 'all', label: 'All', count: briefs?.length ?? 0 },
      { key: 'open', label: 'Open', count: (briefs ?? []).filter((b) => b.status !== 'resolved').length },
      { key: 'resolved', label: 'Resolved', count: (briefs ?? []).filter((b) => b.status === 'resolved').length },
    ];
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
        {ledger?.pulse && (
          <View
            style={{
              marginBottom: 26,
              backgroundColor: C.paperRaised,
              borderWidth: 1,
              borderColor: C.accent,
              borderRadius: 3,
              padding: 20,
              gap: 6,
            }}
          >
            <Text
              style={{
                fontFamily: BrandFonts.sans.semiBold,
                fontSize: 12,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: C.accent,
              }}
            >
              Tree Pulse · {formatDate(ledger.pulse.at)}
            </Text>
            <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 21, color: C.ink }}>
              {ledger.pulse.summary}
            </Text>
            {/* A caption, not an eyebrow — RecordText is mono uppercase, which
                turned this sentence into a shouted label. */}
            <Text
              style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13, color: C.inkMuted }}
            >
              What your last upload changed.
            </Text>
          </View>
        )}

        {entries.length > 0 && (
          <View style={{ marginBottom: 30 }}>
            <Text
              style={{
                fontFamily: BrandFonts.sans.semiBold,
                fontSize: 12,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: C.inkSecondary,
                marginBottom: 14,
              }}
            >
              {ledger ? ledgerHeading(ledger) : ''}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
              {entries.map((entry) => (
                <Pressable
                  key={entry.key}
                  onPress={() => router.push(entry.route)}
                  style={{
                    flex: 1,
                    minWidth: 220,
                    backgroundColor: C.paperRaised,
                    borderWidth: 1,
                    borderColor: C.rule,
                    borderRadius: 3,
                    padding: 18,
                    gap: 8,
                  }}
                >
                  <Text
                    style={{ fontFamily: BrandFonts.serif.regular, fontSize: 19, color: C.ink }}
                  >
                    {entry.label}
                  </Text>
                  <RecordText muted>{entry.detail}</RecordText>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* The ledger above counts judgments; the punch list is the other
            half — what is still open (research-ledger.ts names the gap). */}
        <Pressable onPress={() => router.push('/punch-list' as never)} style={{ marginBottom: 22 }}>
          <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 17, color: C.ink }}>
            The punch list — what’s still open <Text style={{ color: C.accent }}>›</Text>
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 24, marginBottom: 22 }}>
          {FILTERS.map(({ key, label, count }) => {
            const active = filter === key;
            return (
              <Pressable key={key} onPress={() => setFilter(key)}>
                <View
                  style={{
                    borderBottomWidth: 2,
                    borderBottomColor: active ? C.accent : 'transparent',
                    paddingBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: active ? BrandFonts.sans.semiBold : BrandFonts.sans.regular,
                      fontSize: 16,
                      color: active ? C.ink : C.inkSecondary,
                    }}
                  >
                    {label} <RecordText muted>{count}</RecordText>
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {briefs === null ? (
          <ActivityIndicator style={{ marginVertical: 40 }} />
        ) : shown.length === 0 ? (
          <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 18, color: C.inkSecondary }}>
            {filter === 'resolved'
              ? 'Nothing resolved yet — the first broken brick wall lands here.'
              : 'No open briefs. Start one from any ancestor whose record has gaps — the Research tab on their page writes it for you.'}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
            {shown.map((brief) => (
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
                  {STATUS_LABELS[brief.status]} · {formatDate(brief.created_at)}
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

      {ledger?.pulse && (
        <Card style={{ marginTop: 12 }}>
          <ThemedText type="smallBold" themeColor="accent">
            TREE PULSE · {formatDate(ledger.pulse.at)}
          </ThemedText>
          <ThemedText>{ledger.pulse.summary}</ThemedText>
          <ThemedText type="small">What your last upload changed.</ThemedText>
        </Card>
      )}

      {entries.length > 0 && (
        <View style={{ marginTop: 12, gap: 8 }}>
          <ThemedText type="smallBold" style={{ opacity: 0.7 }}>
            {ledger ? ledgerHeading(ledger).toUpperCase() : ''}
          </ThemedText>
          {entries.map((entry) => (
            <Card key={entry.key} onPress={() => router.push(entry.route)}>
              <ThemedText>{entry.label}</ThemedText>
              <ThemedText type="small">{entry.detail}</ThemedText>
            </Card>
          ))}
        </View>
      )}

      <Card style={{ marginTop: 12 }} onPress={() => router.push('/punch-list' as never)}>
        <ThemedText>The punch list — what’s still open ›</ThemedText>
        <ThemedText type="small">
          Findings, orphans, and your margin corrections, each with its road back to the source.
        </ThemedText>
      </Card>

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
                {STATUS_LABELS[item.status]} · {formatDate(item.created_at)}
              </ThemedText>
            </Card>
          )}
        />
      )}
    </ThemedView>
  );
}
