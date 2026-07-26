import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';

import { fetchNaraCandidatesForTree, type NaraCandidate } from '@witness/core/query';

import { NaraCandidateCard } from '@/components/nara-candidate-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActiveTree } from '@/lib/active-tree';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

/**
 * The consolidated National Archives view: every candidate the worker has
 * matched anywhere in the tree, queued for review, and every confirmed
 * find shelved together. Individually these live on ancestor and place
 * pages — needles in a five-thousand-person haystack; this is the
 * haystack turned inside out.
 */
export default function ArchivesScreen() {
  // treeId arrives as a param from deep links, but tab-era callers (the
  // Tree tab) push bare — fall back to the active tree so the screen
  // never spins forever waiting for a param nobody sends.
  const { treeId: paramTreeId } = useLocalSearchParams<{ treeId?: string }>();
  const { activeTree } = useActiveTree();
  const treeId = paramTreeId ?? activeTree?.id;
  const [candidates, setCandidates] = useState<NaraCandidate[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    fetchNaraCandidatesForTree(supabase, treeId)
      .then((rows) => {
        if (!cancelled) setCandidates(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  function onResolved(id: string, status: 'confirmed' | 'dismissed') {
    setCandidates((current) =>
      (current ?? []).flatMap((c) =>
        c.id !== id ? [c] : status === 'dismissed' ? [] : [{ ...c, status }],
      ),
    );
  }

  const pending = (candidates ?? []).filter((c) => c.status === 'pending');
  const confirmed = (candidates ?? []).filter((c) => c.status === 'confirmed');

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'The National Archives' }} />
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 8 }}>
        <ThemedText type="small">
          Witness sweeps the National Archives Catalog for records that might belong to your
          ancestors — draft registrations, naturalizations, and more. Every match is a question
          for you, never a conclusion.
        </ThemedText>

        {candidates === null ? (
          failed ? (
            <ThemedText type="small">Couldn’t reach the archives just now — try again shortly.</ThemedText>
          ) : (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          )
        ) : (
          <>
            <ThemedText type="subtitle" style={{ marginTop: 8 }}>
              Awaiting your judgment
            </ThemedText>
            {pending.length === 0 ? (
              <ThemedText type="small">
                Nothing to review right now. The sweep continues around the clock — new finds
                appear here first.
              </ThemedText>
            ) : (
              pending.map((candidate) => (
                <NaraCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  showPerson
                  onResolved={onResolved}
                />
              ))
            )}

            <ThemedText type="subtitle" style={{ marginTop: 16 }}>
              Confirmed finds
            </ThemedText>
            {confirmed.length === 0 ? (
              <ThemedText type="small">
                Records you confirm collect here — your family’s shelf in the nation’s archive.
              </ThemedText>
            ) : (
              confirmed.map((candidate) => (
                <NaraCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  showPerson
                  onResolved={onResolved}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}
