import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { getRelationshipPath, type RelationshipPath } from '@witness/core/family';

import { Card } from '@/components/card';
import { KinLine, KinName } from '@/components/kin-line';
import { TIER_WORD } from '@/components/kin-reveal';
import { ThemedText } from '@/components/themed-text';
import { useKinMap } from '@/hooks/use-kin-map';
import { useTheme } from '@/hooks/use-theme';
import { getParentageMap } from '@/lib/parentage';
import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';

/**
 * The direct-line timeline, inlined on the Portrait (2B redesign): the
 * person-by-person chain that proves the relationship label, opened in
 * place by the caret beside the relationship lede instead of a separate
 * screen. Under the perspective lens the chain re-anchors on the lens
 * person via a live walk — the cached rows all assume the home person.
 *
 * A cousin's chain climbs to the ancestor the two share and comes back
 * down the other branch. That turn used to be invisible — one straight
 * list (Rufus, 2026-09-17) — so each step now says which way it goes,
 * and the shared ancestor is named as the turning point.
 */

type Step = 'up' | 'down' | 'across';

/** Which way the chain moves from one person to the next. */
function stepKinds(
  people: RelationshipPath['people'],
  parentsOf: Map<string, Set<string>>,
): Step[] {
  const steps: Step[] = [];
  for (let i = 1; i < people.length; i++) {
    const from = people[i - 1]!.id;
    const to = people[i]!.id;
    if (parentsOf.get(from)?.has(to)) steps.push('up');
    else if (parentsOf.get(to)?.has(from)) steps.push('down');
    else steps.push('across');
  }
  return steps;
}

export function LineagePanel({
  individualId,
  treeId,
  fromPersonId,
  fromName,
}: {
  individualId: string;
  treeId: string;
  /** Perspective lens: anchor the walk here instead of the home person. */
  fromPersonId?: string;
  fromName?: string;
}) {
  const theme = useTheme();
  const kin = useKinMap(treeId);
  const [path, setPath] = useState<RelationshipPath | null | 'loading'>('loading');
  const [parentage, setParentage] = useState<Map<string, string>>(new Map());
  const [parentsOf, setParentsOf] = useState<Map<string, Set<string>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPath('loading');
    getParentageMap(treeId)
      .then((map) => {
        if (!cancelled) setParentage(map);
      })
      .catch(() => {});
    // Child → parents, from the session's tree index (already fetched for
    // the Tree tab; instant thereafter). Only needed to label the steps.
    getTreeIndex(treeId)
      .then((index) => {
        if (cancelled) return;
        const map = new Map<string, Set<string>>();
        for (const family of index.families) {
          for (const child of family.children) {
            const parents = map.get(child) ?? new Set<string>();
            if (family.husband_id) parents.add(family.husband_id);
            if (family.wife_id) parents.add(family.wife_id);
            map.set(child, parents);
          }
        }
        setParentsOf(map);
      })
      .catch(() => {});
    getRelationshipPath(supabase, treeId, individualId, fromPersonId)
      .then((result) => {
        if (!cancelled) setPath(result);
      })
      .catch(() => {
        if (!cancelled) setPath(null);
      });
    return () => {
      cancelled = true;
    };
  }, [individualId, treeId, fromPersonId]);

  if (path === 'loading') {
    return (
      <View style={{ gap: 8, marginVertical: 12 }}>
        <ActivityIndicator />
        <ThemedText type="small" style={{ textAlign: 'center' }}>
          Tracing the line…
        </ThemedText>
      </View>
    );
  }

  if (path === null) {
    return (
      <ThemedText type="small" style={{ marginVertical: 8 }}>
        {fromPersonId
          ? 'No line connects these two in your tree.'
          : 'No relationship line found. Set who you are in the tree from the You tab, then try again.'}
      </ThemedText>
    );
  }

  const anchorWord = fromName ? fromName.split(' ')[0] : 'you';
  const steps = parentsOf ? stepKinds(path.people, parentsOf) : null;
  // The turning point: the last person reached by climbing before the
  // chain starts descending — the ancestor both branches share.
  const apex = steps ? steps.findIndex((s, i) => s === 'up' && steps[i + 1] === 'down') + 1 : 0;
  const hasTurn = apex > 0;
  const ups = steps?.filter((s) => s === 'up').length ?? 0;
  const downs = steps?.filter((s) => s === 'down').length ?? 0;

  return (
    <View style={{ gap: 6, marginTop: 10 }}>
      <ThemedText type="smallBold" themeColor="accent">
        {TIER_WORD[path.tier === 'none' ? 'none' : path.tier].toUpperCase()}
      </ThemedText>
      <ThemedText type="small">
        {path.people.length - 1} steps from {anchorWord}
        {hasTurn
          ? ` — ${ups} up to the ancestor you share, then ${downs} down`
          : ''}
        {' '}— tap anyone to visit them
      </ThemedText>
      <Card>
        {path.people.map((person, index) => {
          const isAnchor = index === 0;
          const isSelf = person.id === individualId;
          const last = index === path.people.length - 1;
          const isApex = hasTurn && index === apex;
          const stepOut = steps?.[index]; // the step leaving this person
          return (
            <Pressable
              key={person.id}
              disabled={isSelf}
              onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: person.id } })}
              style={{ flexDirection: 'row' }}
            >
              <View style={{ width: 20, alignItems: 'center' }}>
                <View
                  style={{
                    width: isApex ? 14 : 10,
                    height: isApex ? 14 : 10,
                    borderRadius: 7,
                    backgroundColor: isAnchor || last || isApex ? theme.accent : theme.textSecondary,
                    marginTop: isApex ? 5 : 7,
                  }}
                />
                {!last && <View style={{ width: 2, flex: 1, backgroundColor: theme.border }} />}
              </View>
              <View style={{ flex: 1, paddingLeft: 10, paddingBottom: last ? 0 : 20 }}>
                <KinName kin={isAnchor ? undefined : kin.get(person.id)}><ThemedText style={isAnchor || last || isApex ? { fontWeight: 600 } : undefined}>
                  {person.full_name}
                  {isAnchor && !fromPersonId ? '  (you)' : ''}
                </ThemedText></KinName>
                {isApex && (
                  <ThemedText type="small" themeColor="accent">
                    The ancestor you share — the line turns here
                  </ThemedText>
                )}
                {!isAnchor && <KinLine kin={kin.get(person.id)} />}
                <ThemedText type="small">
                  {person.birth_year ?? '?'}–{person.death_year ?? ''}
                </ThemedText>
                {parentage.has(person.id) && (
                  <ThemedText type="small">{parentage.get(person.id)}</ThemedText>
                )}
                {!last && stepOut && (
                  <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 4 }}>
                    {stepOut === 'up'
                      ? '▲ up a generation, to a parent'
                      : stepOut === 'down'
                        ? '▼ down a generation, to a child'
                        : '◆ across, by marriage'}
                  </ThemedText>
                )}
              </View>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}
