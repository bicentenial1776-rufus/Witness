import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { getRelationshipPath, type RelationshipPath } from '@witness/core/family';

import { Card } from '@/components/card';
import { KinLine } from '@/components/kin-line';
import { TIER_WORD } from '@/components/kin-reveal';
import { ThemedText } from '@/components/themed-text';
import { useKinMap } from '@/hooks/use-kin-map';
import { useTheme } from '@/hooks/use-theme';
import { getParentageMap } from '@/lib/parentage';
import { supabase } from '@/lib/supabase';

/**
 * The direct-line timeline, inlined on the Portrait (2B redesign): the
 * person-by-person chain that proves the relationship label, opened in
 * place by the caret beside the relationship lede instead of a separate
 * screen. Under the perspective lens the chain re-anchors on the lens
 * person via a live walk — the cached rows all assume the home person.
 */
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

  useEffect(() => {
    let cancelled = false;
    setPath('loading');
    getParentageMap(treeId)
      .then((map) => {
        if (!cancelled) setParentage(map);
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

  return (
    <View style={{ gap: 6, marginTop: 10 }}>
      <ThemedText type="smallBold" themeColor="accent">
        {TIER_WORD[path.tier === 'none' ? 'none' : path.tier].toUpperCase()}
      </ThemedText>
      <ThemedText type="small">
        {path.people.length - 1} steps from {anchorWord} — tap anyone to visit them
      </ThemedText>
      <Card>
        {path.people.map((person, index) => {
          const isAnchor = index === 0;
          const isSelf = person.id === individualId;
          const last = index === path.people.length - 1;
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
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: isAnchor || last ? theme.accent : theme.textSecondary,
                    marginTop: 7,
                  }}
                />
                {!last && <View style={{ width: 2, flex: 1, backgroundColor: theme.border }} />}
              </View>
              <View style={{ flex: 1, paddingLeft: 10, paddingBottom: last ? 0 : 20 }}>
                <ThemedText style={isAnchor || last ? { fontWeight: 600 } : undefined}>
                  {person.full_name}
                  {isAnchor && !fromPersonId ? '  (you)' : ''}
                </ThemedText>
                {!isAnchor && <KinLine kin={kin.get(person.id)} />}
                <ThemedText type="small">
                  {person.birth_year ?? '?'}–{person.death_year ?? ''}
                </ThemedText>
                {parentage.has(person.id) && (
                  <ThemedText type="small">{parentage.get(person.id)}</ThemedText>
                )}
              </View>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}
