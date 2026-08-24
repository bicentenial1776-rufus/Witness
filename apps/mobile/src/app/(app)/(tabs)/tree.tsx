import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { buildFamilyStages, fetchNaraCounts, treeGenerationSpan, type NaraCounts } from '@witness/core/query';

import { Masthead, PageShell, useBroadsheet } from '@/components/broadsheet';
import { FamilyStage } from '@/components/broadsheet/family-stage';
import { RecordText } from '@/components/record-text';
import { BrandFonts, Letterpress, WideContent } from '@/constants/theme';
import { useActiveTree } from '@/lib/active-tree';
import { getCuriosities, type CuriositySummary } from '@/lib/curiosities-cache';
import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';

const L = Letterpress;

const mono = (size: number, color: string = L.ink) => ({
  fontFamily: BrandFonts.mono.regular,
  fontSize: size,
  color,
});

function Section({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
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
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingVertical: 8 }}
    >
      <View style={{ flexShrink: 1, gap: 3 }}>
        <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 19, color: L.ink }}>{title}</Text>
        {detail ? <Text style={mono(10.5, L.muted)}>{detail.toUpperCase()}</Text> : null}
      </View>
      <Text style={mono(12, L.amber)}>›</Text>
    </Pressable>
  );
}

/**
 * The Tree tab — the "about your tree" home (docs/phone-ia-design-brief.md).
 * Never a tree drawing: header stats, curiosities in the gentle voice —
 * a curiosity is a prompt, not a problem — the Family Stage's door, the
 * research desk, and a look at what's coming. Research folded here from
 * its old tab in the 2026-07-26 restructure.
 */
export default function TreeTab() {
  const { activeTree, loadFailed, refresh } = useActiveTree();
  const broadsheet = useBroadsheet();
  const [generations, setGenerations] = useState<number | null>(null);
  const [households, setHouseholds] = useState<number | null>(null);
  const [curiosities, setCuriosities] = useState<CuriositySummary | null>(null);
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

      // Re-read on every focus: a "Mark fixed" on the workbench should
      // reflect here on the way back (the heavy audit itself is cached).
      getCuriosities(treeId)
        .then((summary) => {
          if (!cancelled) setCuriosities(summary);
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

  const curiositiesSection = (
    <Section eyebrow="Curiosities">
          {curiosities === null ? (
            <Text style={mono(11, L.muted)}>READING THE RECORD…</Text>
          ) : curiosities.total === 0 ? (
            <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 17, color: L.ink }}>
              The record reads clean — nothing curious to show.
            </Text>
          ) : (
            <>
              <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 17, lineHeight: 24, color: L.ink }}>
                {curiosities.total.toLocaleString()} curiosities in the record
                {curiosities.lineName ? `, most in the ${curiosities.lineName} line` : ''} — worth a
                look, nothing urgent.
              </Text>
              {curiosities.top.map((curiosity) => (
                <Pressable
                  key={curiosity.key}
                  onPress={() =>
                    router.push({ pathname: '/ancestor/[id]', params: { id: curiosity.individualId } })
                  }
                  style={{ borderLeftWidth: 2, borderLeftColor: L.rule, paddingLeft: 10, paddingVertical: 2 }}
                >
                  <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 15, lineHeight: 21, color: L.ink }}>
                    {curiosity.prompt}
                  </Text>
                </Pressable>
              ))}
            </>
          )}
    </Section>
  );

  const familyStageDoor = (
    <Section eyebrow="The family graph">
          <Pressable
            onPress={() => router.push('/family-stage/root' as never)}
            style={{
              borderWidth: 1,
              borderColor: L.rule,
              backgroundColor: '#ffffff',
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
            <Text style={mono(10.5, L.muted)}>ONE HOUSEHOLD DRAWN AS A LENGTH OF TIME</Text>
            <Pressable onPress={() => router.push('/register' as never)} hitSlop={8}>
              <Text style={{ ...mono(10.5, L.deepAmber), marginTop: 4 }}>
                {households !== null ? `THE REGISTER — ALL ${households.toLocaleString()} HOUSEHOLDS ›` : 'THE REGISTER ›'}
              </Text>
            </Pressable>
          </Pressable>
    </Section>
  );

  const researchSection = (
    <Section eyebrow="Research">
          <Row
            title="Research briefs"
            detail={
              briefCounts
                ? `${briefCounts.total} briefs · ${briefCounts.open} open`
                : 'Your brick walls, and the briefs to break them'
            }
            onPress={() => router.push('/research' as never)}
          />
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

  const streetViewTeaser = (
    <View style={{ borderWidth: 1, borderColor: L.rule, borderStyle: 'dashed' as never, padding: 16, gap: 5 }}>
      <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 19, color: L.inkUnrecorded }}>
        Family Street View
      </Text>
      <Text style={mono(10.5, L.muted)}>COMING SOON — A WALK THROUGH THE PLACES THEY LIVED</Text>
    </View>
  );

  // Broadsheet carrier (web ≥900px): masthead from the tree itself, the
  // stage drawn live in the main column where the phone shows its door,
  // the coming-soon teaser in the margin.
  if (broadsheet) {
    return (
      <PageShell
        masthead={
          <Masthead title={activeTree.name} metaMono={stats.toUpperCase()} metaCaption="The tree" />
        }
        margin={
          <View style={{ gap: 10 }}>
            <RecordText eyebrow muted>
              Visual views
            </RecordText>
            {streetViewTeaser}
          </View>
        }
      >
        <View style={{ maxWidth: 680 }}>{curiositiesSection}</View>
        <View style={{ marginTop: 36 }}>
          <FamilyStage treeId={activeTree.id} />
        </View>
        <View style={{ maxWidth: 680 }}>{researchSection}</View>
        <View style={{ maxWidth: 680 }}>{treeHealthSection}</View>
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
        <Text style={{ ...mono(11, L.muted), marginTop: 8 }}>{stats.toUpperCase()}</Text>

        {curiositiesSection}
        {familyStageDoor}
        {researchSection}
        {treeHealthSection}

        <Section eyebrow="Visual views">{streetViewTeaser}</Section>
      </ScrollView>
    </View>
  );
}
