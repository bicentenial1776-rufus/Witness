import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';

import { searchRegisterEntities, type RegisterDef, type RegisterRecord } from '@witness/core/registers';

import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

/**
 * Variant B's confirm — "Add his regiment" (docs/witness-civil-war-prompt.md,
 * Phase 3). The reader has found the man in the outside index and comes
 * back with a unit; this finds it among the register's entity records by
 * the words they type, takes company and rank in their own words, and
 * hands the chosen record back. Nothing is written here.
 */
export function UnitPicker({
  register,
  personName,
  visible,
  onClose,
  onPick,
}: {
  register: RegisterDef;
  personName: string;
  visible: boolean;
  onClose: () => void;
  onPick: (record: RegisterRecord, extra: { company: string; rank: string }) => Promise<void>;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [rank, setRank] = useState('');
  const [results, setResults] = useState<RegisterRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchRegisterEntities(supabase, register.registerKey, q, 40)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, query, register.registerKey]);

  async function pick(record: RegisterRecord) {
    setBusy(record.id);
    setError(null);
    try {
      await onPick(record, { company, rank });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1, padding: 24, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <ThemedText type="title">Which regiment?</ThemedText>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <ThemedText type="link">Close</ThemedText>
          </Pressable>
        </View>
        <ThemedText type="small">
          The unit you found for {personName.split(' ')[0]} in the index. Type any part of its name — a
          number, a state, a branch. His company and rank are optional and stay in your words.
        </ThemedText>
        <TextField
          placeholder="e.g. 15 Massachusetts, or 5th Iowa Cavalry"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          value={query}
          onChangeText={setQuery}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <TextField placeholder="Company (e.g. K)" autoCapitalize="characters" value={company} onChangeText={setCompany} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField placeholder="Rank (e.g. Private)" autoCapitalize="words" value={rank} onChangeText={setRank} />
          </View>
        </View>
        {error && <ThemedText type="small">{error}</ThemedText>}
        <FlatList
          data={results}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => {
            const organized = typeof item.attributes['organized'] === 'string' ? (item.attributes['organized'] as string) : null;
            const mustered = typeof item.attributes['mustered_out'] === 'string' ? (item.attributes['mustered_out'] as string) : null;
            return (
              <Card
                onPress={() => pick(item)}
                style={{ marginBottom: 8, opacity: busy && busy !== item.id ? 0.5 : 1 }}
                accessibilityLabel={`Attach ${item.nameAsRecorded}`}
              >
                <ThemedText>{item.nameAsRecorded}</ThemedText>
                {(organized || mustered) && (
                  <ThemedText type="small">
                    {organized ? `Organized ${organized}` : ''}
                    {organized && mustered ? ' · ' : ''}
                    {mustered ? `Mustered out ${mustered}` : ''}
                  </ThemedText>
                )}
                <ThemedText type="small" themeColor="accent">
                  {busy === item.id ? 'Attaching…' : 'Attach this regiment ›'}
                </ThemedText>
              </Card>
            );
          }}
          ListEmptyComponent={
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {query.trim().length < 2 ? `${register.displayName}: type to search.` : 'No unit by those words — try fewer of them.'}
            </ThemedText>
          }
        />
      </ThemedView>
    </Modal>
  );
}
