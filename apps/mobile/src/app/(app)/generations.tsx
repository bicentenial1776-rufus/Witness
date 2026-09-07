import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { ancestorGenerations, coupleUp, generationKnown, type CoupleUnit, type Generation } from '@witness/core/family';
import type { TreeFamily, TreeIndividual } from '@witness/core/query';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { KinLine, KinName } from '@/components/kin-line';
import { SeenFromBand, useSeenFrom } from '@/components/seen-from';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandFonts, WideContent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
import { getRowsSeenFrom, type PerspectiveRow } from '@/lib/perspective-rows';
import type { Kin } from '@/lib/relationship-cache';
import { getTreeIndex } from '@/lib/tree-index-cache';

/**
 * One generation at a time (a reader, 2026-09-06: "if I could see just 3
 * generations back that would be manageable. Or one generation at a
 * time."). Parents, then grandparents, then the greats — each a page the
 * reader can finish, split by the side of the family, with how many of
 * the generation's slots the record has filled. Seen from you by default;
 * the band re-anchors it on anyone.
 */
export default function GenerationsScreen() {
  const theme = useTheme();
  const { activeTree, loadFailed } = useActiveTree();
  const treeId = activeTree?.id;
  const perspective = useSeenFrom();
  const [rows, setRows] = useState<PerspectiveRow[] | null>(null);
  const [people, setPeople] = useState<Map<string, TreeIndividual>>(new Map());
  const [families, setFamilies] = useState<TreeFamily[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(1);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    Promise.all([getRowsSeenFrom(treeId, perspective?.id ?? null), getTreeIndex(treeId)])
      .then(([next, index]) => {
        if (cancelled) return;
        setRows(next);
        setPeople(index.individuals);
        setFamilies(index.families);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [treeId, perspective?.id]);

  const generations = useMemo(() => (rows ? ancestorGenerations(rows) : []), [rows]);
  const kin = useMemo(() => {
    const map = new Map<string, Kin>();
    for (const row of rows ?? []) map.set(row.individual_id, { label: row.label, tier: row.tier as Kin['tier'] });
    return map;
  }, [rows]);
  const current: Generation | undefined = generations[n - 1];
  const known = current ? generationKnown(current) : 0;
  const whose = perspective ? perspective.name.split(' ')[0] : 'you';

  if (!activeTree) {
    return (
      <ThemedView style={{ flex: 1, padding: 24 }}>
        <ThemedText>{noTreeMessage(loadFailed, 'to walk its generations')}</ThemedText>
      </ThemedView>
    );
  }

  const years = (p: TreeIndividual) => `${p.birth_year ?? '?'}–${p.living ? '' : (p.death_year ?? '?')}`;
  const open = (id: string) => router.push({ pathname: '/ancestor/[id]', params: { id } });

  const personRow = (p: TreeIndividual) => (
    <Pressable key={p.id} onPress={() => open(p.id)} accessibilityRole="button" style={{ gap: 2 }}>
      <KinName kin={kin.get(p.id)}>
        <ThemedText>{p.full_name}</ThemedText>
      </KinName>
      <KinLine kin={kin.get(p.id)} />
      <ThemedText type="small">{years(p)}</ThemedText>
    </Pressable>
  );

  // A couple is one card: the two people joined by a hairline down the
  // left, the marriage year at the join; later marriages of either
  // partner hang beneath, dashed, so the line's spouse and the others
  // read as different things (Rufus, 2026-09-06).
  const unitCard = (unit: CoupleUnit) => {
    const partners = unit.partners.map((id) => people.get(id)).filter((p): p is TreeIndividual => Boolean(p));
    if (partners.length === 0) return null;
    return (
      <Card key={unit.partners.join('+')} style={{ paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {partners.length > 1 && (
            <View style={{ width: 14, alignItems: 'center' }}>
              <View style={{ width: 1, flex: 1, backgroundColor: theme.accent }} />
              <Text style={{ color: theme.accent, fontSize: 13, lineHeight: 16 }}>⚭</Text>
              <View style={{ width: 1, flex: 1, backgroundColor: theme.accent }} />
            </View>
          )}
          <View style={{ flex: 1, gap: 10 }}>
            {partners[0] && personRow(partners[0])}
            {partners.length > 1 && (
              <Text style={{ fontFamily: BrandFonts.mono.regular, fontSize: 12, letterSpacing: 0.5, color: theme.textSecondary }}>
                {unit.marriageYear ? `MARRIED ${unit.marriageYear}` : 'MARRIED, YEAR UNRECORDED'}
              </Text>
            )}
            {partners[1] && personRow(partners[1])}
          </View>
        </View>
        {unit.laterMarriages.length > 0 && (
          <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: theme.border, gap: 6 }}>
            {unit.laterMarriages.map((m) => {
              const of = people.get(m.ofId);
              const spouse = people.get(m.spouseId);
              if (!spouse) return null;
              return (
                <Pressable key={`${m.ofId}-${m.spouseId}`} onPress={() => open(spouse.id)} accessibilityRole="button">
                  <ThemedText type="small">
                    {of ? `${of.full_name.split(' ')[0]} also married ` : 'Also married '}
                    <ThemedText type="smallBold">{spouse.full_name}</ThemedText>
                    {m.marriageYear ? ` · ${m.marriageYear}` : ''} · {years(spouse)} ›
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>
    );
  };

  const side = (title: string, ids: string[]) => {
    if (ids.length === 0) return null;
    const units = coupleUp(ids, families).sort((a, b) => {
      const ya = Math.min(...a.partners.map((id) => people.get(id)?.birth_year ?? 9999));
      const yb = Math.min(...b.partners.map((id) => people.get(id)?.birth_year ?? 9999));
      return ya - yb;
    });
    return (
      <View style={{ gap: 8 }}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {title.toUpperCase()}
        </ThemedText>
        {units.map(unitCard)}
      </View>
    );
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'One Generation at a Time' }} />
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 12 }}>
        <SeenFromBand treeId={activeTree.id} />
        {error && <ThemedText>Something went wrong: {error}</ThemedText>}
        {!rows && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}
        {rows && generations.length === 0 && (
          <ThemedText>
            No parents are recorded for {whose} in this tree, so there is no line to walk. Set who you are from the
            You tab if that is the problem.
          </ThemedText>
        )}
        {current && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
              {generations.map((g) => (
                <Chip
                  key={g.n}
                  label={String(g.n)}
                  active={g.n === n}
                  activeColor={theme.accent}
                  accessibilityLabel={`Generation ${g.n}, ${g.title}`}
                  onPress={() => setN(g.n)}
                />
              ))}
            </ScrollView>
            <ThemedText type="title">{current.title}</ThemedText>
            <ThemedText type="small">
              Generation {current.n} back from {whose} · {known.toLocaleString()} of {current.expected.toLocaleString()} known
              {known < current.expected ? ' — the rest are still to be found' : ''}
            </ThemedText>
            {known === 0 && <ThemedText type="small">None recorded yet at this depth.</ThemedText>}
            {current.n === 1 ? (
              // The parents are the one generation that spans both sides —
              // one paternal, one maternal — so they pair as a couple here.
              side('Your parents', [...current.paternal, ...current.maternal, ...current.unplaced])
            ) : (
              <>
                {side("Father's side", current.paternal)}
                {side("Mother's side", current.maternal)}
                {side('Unplaced', current.unplaced)}
              </>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginTop: 8 }}>
              <Pressable disabled={n <= 1} onPress={() => setN(n - 1)} hitSlop={8} style={{ opacity: n <= 1 ? 0.35 : 1 }}>
                <ThemedText type="link">‹ Closer</ThemedText>
              </Pressable>
              <ThemedText type="small" style={{ textAlign: 'center', flexShrink: 1 }}>
                {generations.length} generations recorded
              </ThemedText>
              <Pressable
                disabled={n >= generations.length}
                onPress={() => setN(n + 1)}
                hitSlop={8}
                style={{ opacity: n >= generations.length ? 0.35 : 1 }}
              >
                <ThemedText type="link">Further back ›</ThemedText>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}
