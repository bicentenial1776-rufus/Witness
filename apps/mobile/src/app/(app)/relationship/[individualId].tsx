import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { getRelationshipPath, type RelationshipPath } from '@witness/core/family';

import { Card } from '@/components/card';
import { TIER_WORD } from '@/components/kin-reveal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { getParentageMap } from '@/lib/parentage';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

/**
 * The proof behind a relationship label: the person-by-person chain from
 * the home person to this ancestor, each generation tappable.
 */
export default function RelationshipScreen() {
  const { individualId } = useLocalSearchParams<{ individualId: string }>();
  const theme = useTheme();
  const [path, setPath] = useState<RelationshipPath | null | 'loading'>('loading');
  const [parentage, setParentage] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!individualId) return;
    let cancelled = false;
    setPath('loading');
    (async () => {
      const { data: person } = await supabase
        .from('individuals')
        .select('tree_id')
        .eq('id', individualId)
        .maybeSingle();
      if (!person) {
        if (!cancelled) setPath(null);
        return;
      }
      // Parentage under every step: on a cousin path (up one line, down
      // another) the chain alone doesn't say how each hop connects.
      getParentageMap(person.tree_id)
        .then((map) => {
          if (!cancelled) setParentage(map);
        })
        .catch(() => {});
      const result = await getRelationshipPath(supabase, person.tree_id, individualId);
      if (!cancelled) setPath(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [individualId]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'How You’re Related' }} />
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 12 }}>
        {path === 'loading' ? (
          <View style={{ gap: 8, marginVertical: 24 }}>
            <ActivityIndicator />
            <ThemedText type="small" style={{ textAlign: 'center' }}>
              Tracing the line…
            </ThemedText>
          </View>
        ) : path === null ? (
          <ThemedText>
            No relationship line found. Set who you are in the tree from the You tab, then try
            again.
          </ThemedText>
        ) : (
          <>
            {/* The category first, the exact words beneath it — this screen
                is the "show" side of the reveal, so the label stays out. */}
            <ThemedText type="smallBold" themeColor="accent">
              {TIER_WORD[path.tier].toUpperCase()}
            </ThemedText>
            <ThemedText type="title">Your {path.label}</ThemedText>
            <ThemedText type="small">
              {path.people.length - 1} steps from you — tap anyone to visit them
            </ThemedText>
            <Card>
              {path.people.map((person, index) => {
                const isYou = index === 0;
                const last = index === path.people.length - 1;
                return (
                  <Pressable
                    key={person.id}
                    disabled={isYou}
                    onPress={() =>
                      router.push({ pathname: '/ancestor/[id]', params: { id: person.id } })
                    }
                    style={{ flexDirection: 'row' }}
                  >
                    <View style={{ width: 20, alignItems: 'center' }}>
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: isYou || last ? theme.accent : theme.textSecondary,
                          marginTop: 7,
                        }}
                      />
                      {!last && (
                        <View style={{ width: 2, flex: 1, backgroundColor: theme.border }} />
                      )}
                    </View>
                    <View style={{ flex: 1, paddingLeft: 10, paddingBottom: last ? 0 : 20 }}>
                      <ThemedText style={isYou || last ? { fontWeight: 600 } : undefined}>
                        {person.full_name}
                        {isYou ? '  (you)' : ''}
                      </ThemedText>
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
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}
