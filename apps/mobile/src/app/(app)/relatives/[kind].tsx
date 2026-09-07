import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { classifyLabel, coupleUp, type CoupleUnit } from '@witness/core/family';
import type { TreeFamily, TreeIndividual } from '@witness/core/query';

import { CoupleCard } from '@/components/couple-card';
import { usePeopleList } from '@/components/people-list';
import { SeenFromBand, useSeenFrom } from '@/components/seen-from';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WideContent } from '@/constants/theme';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
import { getRowsSeenFrom, type PerspectiveRow } from '@/lib/perspective-rows';
import type { Kin } from '@/lib/relationship-cache';
import { getTreeIndex } from '@/lib/tree-index-cache';

interface Member {
  person: TreeIndividual;
  row: PerspectiveRow;
}

/** One kind of relative, as a list — with the filter every long list has. */
export default function RelativesOfKindScreen() {
  const { kind, title } = useLocalSearchParams<{ kind: string; title?: string }>();
  const { activeTree, loadFailed } = useActiveTree();
  const treeId = activeTree?.id;
  const perspective = useSeenFrom();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [people, setPeople] = useState<Map<string, TreeIndividual>>(new Map());
  const [families, setFamilies] = useState<TreeFamily[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId || !kind) return;
    let cancelled = false;
    setMembers(null);
    Promise.all([getRowsSeenFrom(treeId, perspective?.id ?? null), getTreeIndex(treeId)])
      .then(([rows, index]) => {
        if (cancelled) return;
        const next: Member[] = [];
        for (const row of rows) {
          if (classifyLabel(row.label).key !== kind) continue;
          const person = index.individuals.get(row.individual_id);
          if (person) next.push({ person, row });
        }
        next.sort((a, b) => (a.person.birth_year ?? 9999) - (b.person.birth_year ?? 9999));
        setMembers(next);
        setPeople(index.individuals);
        setFamilies(index.families);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [treeId, kind, perspective?.id]);

  // The kind's own rows carry the labels; the list's kin map comes from
  // them rather than the home-person cache so a lensed view stays lensed.
  const list = usePeopleList({
    listKey: `relatives-${kind ?? 'kind'}`,
    treeId,
    rows: members,
    person: (m) => ({
      id: m.person.id,
      fullName: m.person.full_name,
      surname: m.person.surname,
      birthYear: m.person.birth_year,
      deathYear: m.person.death_year,
    }),
  });
  const kin = useMemo(() => {
    const map = new Map<string, Kin>();
    for (const m of members ?? []) map.set(m.person.id, { label: m.row.label, tier: m.row.tier as Kin['tier'] });
    return map;
  }, [members]);

  // Where couples belong — the ancestor kinds and the aunts and uncles —
  // a pair in the list stands as one card, the way the generation walk
  // draws them. The filter and the stacked sorts still rule: a couple
  // takes the place of whichever partner the sort put first, and a
  // partner the filter dropped leaves the other standing alone.
  const coupled = /^(ancestors|aunts)-\d+$/.test(kind ?? '');
  const units = useMemo<CoupleUnit[]>(() => {
    const ids = list.rows.map((m) => m.person.id);
    if (!coupled) return ids.map((id) => ({ partners: [id], familyId: null, marriageYear: null, laterMarriages: [] }));
    const at = new Map(ids.map((id, i) => [id, i]));
    return coupleUp(ids, families).sort(
      (a, b) => Math.min(...a.partners.map((id) => at.get(id) ?? 0)) - Math.min(...b.partners.map((id) => at.get(id) ?? 0)),
    );
  }, [list.rows, coupled, families]);

  if (!activeTree) {
    return (
      <ThemedView style={{ flex: 1, padding: 24 }}>
        <ThemedText>{noTreeMessage(loadFailed, 'to see its relatives')}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: title ?? 'Relatives' }} />
      <FlatList
        contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48 }}
        data={units}
        keyExtractor={(u) => u.partners.join('+')}
        ListHeaderComponent={
          <>
            <SeenFromBand treeId={activeTree.id} />
            {members && (
              <ThemedText type="subtitle">
                {members.length.toLocaleString()} {title?.toLowerCase() ?? 'relatives'}
              </ThemedText>
            )}
            {error && <ThemedText>Something went wrong: {error}</ThemedText>}
            {!members && !error && <ActivityIndicator style={{ marginVertical: 24 }} />}
            {list.bar}
          </>
        }
        renderItem={({ item }) => (
          <View style={{ marginTop: 8 }}>
            <CoupleCard unit={item} people={people} kin={kin} onOpen={(id) => router.push({ pathname: '/ancestor/[id]', params: { id } })} />
          </View>
        )}
      />
    </ThemedView>
  );
}
