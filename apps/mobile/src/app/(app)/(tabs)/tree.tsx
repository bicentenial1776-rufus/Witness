import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { buildFamilyStages, fetchNaraCounts, treeGenerationSpan, type NaraCounts } from '@witness/core/query';

import { Masthead, PageShell, useBroadsheet } from '@/components/broadsheet';
import { FamilyStage } from '@/components/broadsheet/family-stage';
import { RecordText } from '@/components/record-text';
import { BrandFonts, Letterpress, WideContent, mono } from '@/constants/theme';
import { useLetterpress } from '@/hooks/use-theme';
import { useActiveTree } from '@/lib/active-tree';
import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';


function Section({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  const L = useLetterpress();
  return (
    <View style={{ marginTop: 28, borderTopWidth: 1, borderTopColor: L.rule, paddingTop: 14, gap: 10 }}>
      <RecordText eyebrow style={{ color: L.deepAmber }}>
        {eyebrow}
      </RecordText>
      {children}
    </View>
  );
}

function Row({ title, detail, onPress }: { title: string; detail?: string; onPress: () => void }) {
  const L = useLetterpress();
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingVertical: 8 }}
    >
      <View style={{ flexShrink: 1, gap: 3 }}>
        <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 19, color: L.ink }}>{title}</Text>
        {detail ? <Text style={mono(13, L.muted)}>{detail.toUpperCase()}</Text> : null}
      </View>
      <Text style={mono(13, L.amber)}>›</Text>
    </Pressable>
  );
}

/**
 * The Tree tab — the "about your tree" home (docs/phone-ia-design-brief.md;
 * tightened 2026-08-27). Never a tree drawing. Four sections in order:
 * Family register (the graph's door), Your tree health, The National
 * Archives, Research briefs. Curiosities left the tab — they are the Tree
 * Check's findings re-voiced, and two surfaces for one audit read as
 * clutter; the stats line and the coming-soon teaser left with them.
 */
export default function TreeTab() {
  const L = useLetterpress();
  const { activeTree, loadFailed, refresh } = useActiveTree();
  const broadsheet = useBroadsheet();
  const [generations, setGenerations] = useState<number | null>(null);
  const [households, setHouseholds] = useState<number | null>(null);
  const [briefCounts, setBriefCounts] = useState<{ total: number; open: number } | null>(null);
  const [naraCounts, setNaraCounts] = useState<NaraCounts | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
      if (!activeTree) return;
      let cancelled = false;
      const treeId = activeTree.id;

      getTreeIndex(treeId)
        .then((index) => {
          if (cancelled) return;
          setGenerations(treeGenerationSpan(index));
          setHouseholds(buildFamilyStages(index, { currentYear: new Date().getFullYear() }).byKey.size);
        })
        .catch(() => {});

      supabase
        .from('research_briefs')
        .select('status')
        .eq('tree_id', treeId)
        .neq('status', 'archived')
        .then(({ data }) => {
          if (cancelled || !data) return;
          setBriefCounts({
            total: data.length,
            open: data.filter((b) => b.status !== 'resolved').length,
          });
        });

      fetchNaraCounts(supabase, treeId)
        .then((counts) => {
          if (!cancelled) setNaraCounts(counts);
        })
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    }, [activeTree?.id, refresh]),
  );

  if (!activeTree) {
    return (
      <View style={{ flex: 1, backgroundColor: L.paper, padding: 24, paddingTop: 72 }}>
        <RecordText eyebrow style={{ color: L.deepAmber }}>
          The tree
        </RecordText>
        <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 22, color: L.ink, marginTop: 10 }}>
          {loadFailed
            ? 'Couldn’t reach your trees just now — nothing has been lost.'
            : 'No tree yet — bring your family in from the Home tab.'}
        </Text>
      </View>
    );
  }

  const stats = [
    `${Number(activeTree.individual_count).toLocaleString()} people`,
    `${Number(activeTree.family_count).toLocaleString()} families`,
    generations !== null ? `${generations} generations` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Curiosities left this tab 2026-08-27: they are the Tree Check's own
  // findings re-voiced (curiosities-cache.ts says so outright), and two
  // surfaces for one audit read as clutter. The workbench under Tree
  // health is the audit's home; the Portrait keeps its per-person prompts.
  const familyStageDoor = (
    <Section eyebrow="Family register">
          <Pressable
            onPress={() => router.push('/family-stage/root' as never)}
            style={{
              borderWidth: 1,
              borderColor: L.rule,
              backgroundColor: L.raised,
              padding: 16,
              gap: 6,
              shadowColor: L.ink,
              shadowOpacity: 0.05,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
            }}
          >
            <Text style={{ fontFamily: BrandFonts.serif.semiBold, fontSize: 21, color: L.ink }}>
              The Family Graph
            </Text>
            <Text style={mono(13, L.muted)}>ONE HOUSEHOLD DRAWN AS A LENGTH OF TIME</Text>
            <Pressable onPress={() => router.push('/register' as never)} hitSlop={8}>
              <Text style={{ ...mono(13, L.deepAmber), marginTop: 4 }}>
                {households !== null ? `THE REGISTER — ALL ${households.toLocaleString()} HOUSEHOLDS ›` : 'THE REGISTER ›'}
              </Text>
            </Pressable>
          </Pressable>
    </Section>
  );

  const archivesSection = (
    <Section eyebrow="The National Archives">
          <Row
            title="In the National Archives"
            detail={
              naraCounts && (naraCounts.pending > 0 || naraCounts.confirmed > 0)
                ? `${naraCounts.pending} awaiting review · ${naraCounts.confirmed} confirmed`
                : 'Candidate records matched to your people'
            }
            onPress={() => router.push('/archives' as never)}
          />
    </Section>
  );

  const briefsSection = (
    <Section eyebrow="Research briefs">
          <Row
            title="Research briefs"
            detail={
              briefCounts
                ? `${briefCounts.total} briefs · ${briefCounts.open} open`
                : 'Your brick walls, and the briefs to break them'
            }
            onPress={() => router.push('/research' as never)}
          />
    </Section>
  );

  const treeHealthSection = (
    <Section eyebrow="Your tree health">
      <Row
        title="Getting To Work"
        detail="The shape of your tree in figures — lifespans across the centuries, deaths by decade, marriage ages, and your commonest names"
        onPress={() => router.push('/getting-to-work' as never)}
      />
      <Row
        title="FTAnalyzer Tree Check"
        detail="Twenty-two data-integrity checks across your whole tree — impossible dates, merged generations, duplicate children, and more"
        onPress={() => router.push('/tree-health' as never)}
      />
      <Row
        title="Orphan records"
        detail="Records with no connection to your tree — islands, solo strays, and the ancestors they might belong near"
        onPress={() => router.push('/orphan-records' as never)}
      />
      <Row
        title="The punch list"
        detail="Everything still open — findings, orphans, and your margin corrections, each with its road back to Ancestry"
        onPress={() => router.push('/punch-list' as never)}
      />
    </Section>
  );

  // Broadsheet carrier (web ≥900px): masthead from the tree itself, the
  // stage drawn live in the main column where the phone shows its door,
  // the coming-soon teaser in the margin.
  // A companion on a shared tree reads; the work surfaces — the audit,
  // the archives review, the research desk — are the owner's and stay off
  // the page entirely (never disabled-looking; design brief §6).
  const owned = activeTree.owned;

  if (broadsheet) {
    return (
      <PageShell
        masthead={
          <Masthead title={activeTree.name} metaMono={stats.toUpperCase()} metaCaption="The tree" />
        }
      >
        <View style={{ marginTop: 36 }}>
          <FamilyStage treeId={activeTree.id} />
        </View>
        {owned && <View style={{ maxWidth: 680 }}>{treeHealthSection}</View>}
        {owned && <View style={{ maxWidth: 680 }}>{archivesSection}</View>}
        {owned && <View style={{ maxWidth: 680 }}>{briefsSection}</View>}
      </PageShell>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: L.paper }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingTop: 72, paddingBottom: 48 }}>
        <RecordText eyebrow style={{ color: L.deepAmber }}>
          The tree
        </RecordText>
        <Text
          style={{ fontFamily: BrandFonts.serif.semiBold, fontSize: 28, lineHeight: 34, color: L.ink, marginTop: 8 }}
        >
          {activeTree.name}
        </Text>
        {familyStageDoor}
        {owned && treeHealthSection}
        {owned && archivesSection}
        {owned && briefsSection}
      </ScrollView>
    </View>
  );
}
