import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { setHomePerson, suggestHomePerson, type HomePersonCandidate } from '@witness/core/family';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { fetchMyMembership } from '@/lib/family-sharing';
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
  | { name: 'saving'; personName: string; traced: number | null }
  | { name: 'done'; personName: string; cachedAncestors: number };

export default function HomePersonScreen() {
  const { treeId } = useLocalSearchParams<{ treeId: string }>();
  const { trees } = useActiveTree();
  const [step, setStep] = useState<Step>({ name: 'loading' });
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<PersonRow[]>([]);

  // A shared tree keeps its pointer on the caller's OWN membership row,
  // never on the tree — each family member is somebody different in the
  // same tree (design brief §3). The compute function routes the write
  // the same way, so choose() below is identical for both.
  const owned = trees?.find((tree) => tree.id === treeId)?.owned ?? true;

  // A home person may already be set — show them, don't re-suggest.
  // Re-running the suggestion here made a saved change look like it
  // hadn't stuck ("We think this might be you…" every visit).
  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    (async () => {
      let currentName: string | null = null;
      if (owned) {
        const { data: tree } = await supabase
          .from('trees')
          .select('home_person:individuals!trees_home_person_id_fkey(full_name)')
          .eq('id', treeId)
          .maybeSingle();
        currentName = (tree?.home_person as { full_name: string } | null)?.full_name ?? null;
      } else {
        const membership = await fetchMyMembership(treeId);
        if (membership?.home_person_id) {
          const { data: person } = await supabase
            .from('individuals')
            .select('full_name')
            .eq('id', membership.home_person_id)
            .maybeSingle();
          currentName = person?.full_name ?? null;
        }
      }
      if (cancelled) return;
      if (currentName) {
        setStep({ name: 'current', personName: currentName });
        return;
      }
      const candidate = await suggestHomePerson(supabase, treeId);
      if (cancelled) return;
      setStep(candidate ? { name: 'suggested', candidate } : { name: 'choosing' });
    })();
    return () => {
      cancelled = true;
    };
  }, [treeId, owned]);

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
    setStep({ name: 'saving', personName: person.full_name, traced: null });
    // The compute runs server-side so backgrounding the app can't kill it
    // mid-walk (it did, twice). Progress is read the map-banner way — count
    // the rows as they land, keyed to the NEW home person so the old home
    // person's rows never show as fake progress.
    const poll = setInterval(async () => {
      const { count } = await supabase
        .from('relationships')
        .select('id', { count: 'exact', head: true })
        .eq('tree_id', treeId)
        .eq('home_person_id', person.id);
      if (count) setStep({ name: 'saving', personName: person.full_name, traced: count });
    }, 2000);
    try {
      const { data, error } = await supabase.functions.invoke('compute-relationships', {
        body: { treeId, homePersonId: person.id },
      });
      let cachedAncestors: number = data?.cachedAncestors ?? 0;
      if (error) {
        // Offline or function failure: the on-device walk still works — it
        // is just killable, and the self-heal covers an interruption. Owned
        // trees only: the fallback writes the tree's own pointer, which a
        // shared tree refuses (the member's pointer lives on their seat).
        if (!owned) throw new Error(error.message);
        ({ cachedAncestors } = await setHomePerson(supabase, treeId, person.id));
      }
      invalidateRelationshipCache();
      setStep({ name: 'done', personName: person.full_name, cachedAncestors });
    } catch (error) {
      setStep({ name: 'choosing' });
      console.error('setting home person failed:', error);
    } finally {
      clearInterval(poll);
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
            {step.traced ? ` — ${step.traced.toLocaleString()} relatives traced` : '…'}
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
