import { useEffect, useState, useSyncExternalStore } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandFonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getPerspective, setPerspective, subscribePerspective, type Perspective } from '@/lib/perspective';
import { supabase } from '@/lib/supabase';

/**
 * "Seen from" — whose eyes a relatives list uses. Defaults to you (the
 * home person); choosing someone else re-anchors every relationship in
 * the session, the same lens the Portrait already offers, with a visible
 * band and a one-tap reset. Session-only: nothing is written.
 */
export function useSeenFrom(): Perspective | null {
  return useSyncExternalStore(subscribePerspective, getPerspective, getPerspective);
}

export function SeenFromBand({ treeId }: { treeId: string }) {
  const theme = useTheme();
  const perspective = useSeenFrom();
  const [choosing, setChoosing] = useState(false);
  const label = perspective ? `SEEN FROM ${perspective.name.toUpperCase()}` : 'SEEN FROM YOU';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
      <Pressable
        onPress={() => setChoosing(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Choose whose relatives to show`}
      >
        <Text style={{ fontFamily: BrandFonts.mono.regular, fontSize: 12, letterSpacing: 0.5, color: theme.accent }}>
          {label} ▾
        </Text>
      </Pressable>
      {perspective && (
        <Pressable onPress={() => setPerspective(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to your own view">
          <Text style={{ fontFamily: BrandFonts.mono.regular, fontSize: 12, letterSpacing: 0.5, color: theme.textSecondary }}>
            BACK TO YOU
          </Text>
        </Pressable>
      )}
      <PersonPicker
        treeId={treeId}
        visible={choosing}
        onClose={() => setChoosing(false)}
        onPick={(person) => {
          setPerspective(person);
          setChoosing(false);
        }}
      />
    </View>
  );
}

interface Candidate {
  id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

function PersonPicker({
  treeId,
  visible,
  onClose,
  onPick,
}: {
  treeId: string;
  visible: boolean;
  onClose: () => void;
  onPick: (person: Perspective) => void;
}) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const q = search.trim();
    const timer = setTimeout(async () => {
      let query = supabase
        .from('individuals')
        .select('id, full_name, birth_year, death_year, living')
        .eq('tree_id', treeId)
        .order('birth_year', { ascending: false, nullsFirst: false })
        .limit(30);
      // Without a search, the people closest to home: the living.
      query = q ? query.ilike('full_name', `%${q}%`) : query.eq('living', true);
      const { data } = await query;
      if (!cancelled) setCandidates((data as Candidate[] | null) ?? []);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, search, treeId]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1, padding: 24, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <ThemedText type="title">Seen from whom?</ThemedText>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <ThemedText type="link">Close</ThemedText>
          </Pressable>
        </View>
        <ThemedText type="small">
          Every relationship on the page is then read from this person — “my mother’s first cousins” is
          your mother, then First cousins.
        </ThemedText>
        <TextField
          placeholder="Search by name"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          value={search}
          onChangeText={setSearch}
        />
        <FlatList
          data={candidates}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          keyExtractor={(person) => person.id}
          renderItem={({ item }) => (
            <Card onPress={() => onPick({ id: item.id, name: item.full_name })} style={{ marginBottom: 8 }}>
              <ThemedText>{item.full_name}</ThemedText>
              <ThemedText type="small">
                {item.birth_year ?? '?'}–{item.living ? '' : (item.death_year ?? '?')}
                {item.living ? ' · living' : ''}
              </ThemedText>
            </Card>
          )}
          ListEmptyComponent={
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {search.trim() ? 'No one by that name.' : 'Type a name to search everyone in the tree.'}
            </ThemedText>
          }
        />
      </ThemedView>
    </Modal>
  );
}
