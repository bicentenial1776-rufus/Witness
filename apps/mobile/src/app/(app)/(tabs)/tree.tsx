import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { treeGenerationSpan } from '@witness/core/query';

import { RecordText } from '@/components/record-text';
import { BrandFonts, Letterpress, WideContent } from '@/constants/theme';
import { useActiveTree } from '@/lib/active-tree';
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
 * Never a tree drawing: header stats, then doors into the record — the
 * Family Stage and Register, research, and the forensic workbenches.
 * Research folded here from its old tab in the 2026-07-26 restructure.
 */
export default function TreeTab() {
  const { activeTree, refresh } = useActiveTree();
  const [generations, setGenerations] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!activeTree) return;
    let cancelled = false;
    getTreeIndex(activeTree.id)
      .then((index) => {
        if (!cancelled) setGenerations(treeGenerationSpan(index));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTree?.id]);

  if (!activeTree) {
    return (
      <View style={{ flex: 1, backgroundColor: L.paper, padding: 24, paddingTop: 72 }}>
        <RecordText eyebrow style={{ color: L.deepAmber }}>
          The tree
        </RecordText>
        <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 22, color: L.ink, marginTop: 10 }}>
          No tree yet — bring your family in from the Home tab.
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

        <Section eyebrow="The family stage">
          <Row
            title="The Register"
            detail="Every household, ordered by time, name, or place"
            onPress={() => router.push('/register' as never)}
          />
        </Section>

        <Section eyebrow="Research">
          <Row
            title="Research briefs"
            detail="Your brick walls, and the briefs to break them"
            onPress={() => router.push('/research' as never)}
          />
          <Row
            title="In the National Archives"
            detail="Candidate records matched to your people"
            onPress={() => router.push('/archives' as never)}
          />
        </Section>

        <Section eyebrow="The record">
          <Row
            title="Tree Check"
            detail="The forensic register, adapted from FTAnalyzer"
            onPress={() => router.push('/tree-health' as never)}
          />
          <Row
            title="Orphan Records"
            detail="Islands and strays, counted and pointed home"
            onPress={() => router.push('/orphan-records' as never)}
          />
        </Section>
      </ScrollView>
    </View>
  );
}
