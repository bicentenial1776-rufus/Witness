import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';

import {
  ancestorsAtPlace,
  eventTypeLabel,
  fetchNaraCandidatesForPlace,
  type GeographyIndex,
  type NaraCandidate,
  type RegionResident,
} from '@witness/core/query';

import { Card } from '@/components/card';
import { KinReveal } from '@/components/kin-reveal';
import { NaraCandidateCard } from '@/components/nara-candidate-card';
import { SanbornBlock } from '@/components/sanborn-block';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGeographyIndex } from '@/lib/geography-cache';
import { getKinMap, type Kin } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

export default function PlaceScreen() {
  const { placeId, treeId } = useLocalSearchParams<{ placeId: string; treeId: string }>();
  const [index, setIndex] = useState<GeographyIndex | null>(null);
  const [relationships, setRelationships] = useState<Map<string, Kin>>(new Map());
  const [candidates, setCandidates] = useState<NaraCandidate[]>([]);

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    getGeographyIndex(treeId).then((i) => {
      if (!cancelled) setIndex(i);
    });
    getKinMap(treeId).then((map) => {
      if (!cancelled) setRelationships(map);
    });
    // Papers of this place: NARA documents the worker matched to people
    // with events here. The section simply hides while empty (enrichment
    // is gradual) or on error.
    if (placeId) {
      fetchNaraCandidatesForPlace(supabase, treeId, placeId)
        .then((rows) => {
          if (!cancelled) setCandidates(rows);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [treeId, placeId]);

  const place = index && placeId ? index.places.get(placeId) : undefined;
  const residents: RegionResident[] = index && placeId ? ancestorsAtPlace(index, placeId) : [];

  // The family's median year here anchors "the town in their day" —
  // the Sanborn edition nearest the middle of their time in this place.
  const eventYears = residents
    .flatMap((r) => r.events.map((e) => e.year))
    .filter((y): y is number => y != null)
    .sort((a, b) => a - b);
  const aroundYear = eventYears.length ? eventYears[Math.floor(eventYears.length / 2)] : null;

  return (
    <ThemedView style={{ flex: 1, padding: 24, gap: 8 }}>
      <Stack.Screen options={{ title: place ? (place.parts[0] ?? place.raw) : '' }} />
      {!index ? (
        <ActivityIndicator style={{ marginVertical: 24 }} />
      ) : !place ? (
        <ThemedText>Place not found.</ThemedText>
      ) : (
        <>
          <ThemedText type="small">{place.raw}</ThemedText>
          <ThemedText type="subtitle">
            {residents.length.toLocaleString()} people in your family have events here
          </ThemedText>
          <FlatList
            data={residents}
            keyExtractor={(resident) => resident.individual.id}
            style={{ marginTop: 12 }}
            ListHeaderComponent={
              candidates.length > 0 ? (
                <>
                  <ThemedText type="subtitle">Papers of this place</ThemedText>
                  <ThemedText type="small" style={{ marginBottom: 8 }}>
                    National Archives records that might belong to your family here.
                  </ThemedText>
                  {candidates.map((candidate) => (
                    <NaraCandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      showPerson
                      onResolved={(id, status) =>
                        setCandidates((current) =>
                          status === 'dismissed'
                            ? current.filter((c) => c.id !== id)
                            : current.map((c) => (c.id === id ? { ...c, status } : c)),
                        )
                      }
                    />
                  ))}
                  <ThemedText type="subtitle" style={{ marginTop: 8, marginBottom: 8 }}>
                    People
                  </ThemedText>
                </>
              ) : null
            }
            ListFooterComponent={
              place ? <SanbornBlock parts={place.parts} aroundYear={aroundYear} /> : null
            }
            renderItem={({ item }) => (
              <Card
                onPress={() =>
                  router.push({ pathname: '/ancestor/[id]', params: { id: item.individual.id } })
                }
                style={{ marginBottom: 8 }}
              >
                <ThemedText>{item.individual.full_name}</ThemedText>
                {relationships.has(item.individual.id) && (
                  <KinReveal
                    tier={relationships.get(item.individual.id)!.tier}
                    label={relationships.get(item.individual.id)!.label}
                  />
                )}
                <ThemedText type="small">
                  {item.events
                    .map((e) => `${eventTypeLabel(e.eventType)}${e.year ? ` ${e.year}` : ''}`)
                    .join(' · ')}
                </ThemedText>
              </Card>
            )}
          />
        </>
      )}
    </ThemedView>
  );
}
