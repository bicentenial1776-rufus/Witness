import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { setHomePerson, suggestHomePerson, type HomePersonCandidate } from '@witness/core/family';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { invalidateRelationshipCache } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

interface PersonRow {
  id: string;
  full_name: string;
  birth_year: number | null;
  living: boolean;
}

type Step =
  | { name: 'loading' }
  | { name: 'current'; personName: string }
  | { name: 'suggested'; candidate: HomePersonCandidate }
  | { name: 'choosing' }
  | { name: 'saving'; personName: string; progress: { computed: number; total: number } | null }
  | { name: 'done'; personName: string; cachedAncestors: number };

export default function HomePersonScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const [step, setStep] = useState<Step>({ name: 'loading' });
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<PersonRow[]>([]);

  // A home person may already be set — show them, don't re-suggest.
  // Re-running the suggestion here made a saved change look like it
  // hadn't stuck ("We think this might be you…" every visit).
  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    (async () => {
      const { data: tree } = await supabase
        .from('trees')
        .select('home_person:individuals!trees_home_person_id_fkey(full_name)')
        .eq('id', treeId)
        .maybeSingle();
      if (cancelled) return;
      const current = tree?.home_person as { full_name: string } | null;
      if (current) {
        setStep({ name: 'current', personName: current.full_name });
        return;
      }
      const candidate = await suggestHomePerson(supabase, treeId);
      if (cancelled) return;
      setStep(candidate ? { name: 'suggested', candidate } : { name: 'choosing' });
    })();
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  useEffect(() => {
    if (step.name !== 'choosing' || !treeId) return;
    let cancelled = false;
    (async () => {
      let query = supabase
        .from('individuals')
        .select('id, full_name, birth_year, living')
        .eq('tree_id', treeId)
        .order('birth_year', { ascending: false, nullsFirst: false })
        .limit(30);
      // Without a search, show people who could plausibly be the user.
      query = search.trim() ? query.ilike('full_name', `%${search.trim()}%`) : query.eq('living', true);
      const { data } = await query;
      if (!cancelled) setCandidates(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [step.name, search, treeId]);

  async function choose(person: { id: string; full_name: string }) {
    if (!treeId) return;
    setStep({ name: 'saving', personName: person.full_name, progress: null });
    try {
      const { cachedAncestors } = await setHomePerson(supabase, treeId, person.id, {
        onProgress: (computed, total) =>
          setStep({ name: 'saving', personName: person.full_name, progress: { computed, total } }),
      });
      invalidateRelationshipCache();
      setStep({ name: 'done', personName: person.full_name, cachedAncestors });
    } catch (error) {
      setStep({ name: 'choosing' });
      console.error('setHomePerson failed:', error);
    }
  }

  return (
    <ThemedView style={{ flex: 1, padding: 24, gap: 12 }}>

      {step.name === 'loading' && <ActivityIndicator style={{ marginVertical: 24 }} />}

      {step.name === 'current' && (
        <>
          <ThemedText>
            You are <ThemedText style={{ fontWeight: 600 }}>{step.personName}</ThemedText> in this
            tree. Every relationship label is computed from this person.
          </ThemedText>
          <Button
            variant="secondary"
            title="Change who I am"
            onPress={() => setStep({ name: 'choosing' })}
          />
        </>
      )}

      {step.name === 'suggested' && (
        <>
          <ThemedText>
            We think this might be you — {step.candidate.full_name}
            {step.candidate.birth_year ? `, born ${step.candidate.birth_year}` : ''}. Is that right?
          </ThemedText>
          <Button
            title={`Yes, I'm ${step.candidate.full_name}`}
            onPress={() => choose({ id: step.candidate.id, full_name: step.candidate.full_name })}
          />
          <Button variant="secondary" title="Choose someone else" onPress={() => setStep({ name: 'choosing' })} />
        </>
      )}

      {step.name === 'choosing' && (
        <>
          <TextField
            placeholder="Search by name"
            autoCapitalize="none"
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
              <Card onPress={() => choose(item)} style={{ marginBottom: 8 }}>
                <ThemedText>{item.full_name}</ThemedText>
                <ThemedText type="small">
                  {item.birth_year ? `born ${item.birth_year}` : 'birth year unknown'}
                  {item.living ? ' · living' : ''}
                </ThemedText>
              </Card>
            )}
          />
        </>
      )}

      {step.name === 'saving' && (
        <View style={{ gap: 8, marginVertical: 8 }}>
          <ActivityIndicator />
          <ThemedText>
            Tracing your family lines
            {step.progress ? ` — ${step.progress.computed} ancestors found` : '…'}
          </ThemedText>
        </View>
      )}

      {step.name === 'done' && (
        <>
          <ThemedText type="subtitle">Welcome home, {step.personName.split(' ')[0]}.</ThemedText>
          <ThemedText>
            Witness traced {step.cachedAncestors.toLocaleString()} blood relatives — ancestors,
            cousins, and all. Every list now knows how each person relates to you.
          </ThemedText>
          <Button title="Done" onPress={() => router.back()} />
        </>
      )}
    </ThemedView>
  );
}
