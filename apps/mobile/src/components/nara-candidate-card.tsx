import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import {
  NARA_SERIES_LABELS,
  naraCatalogUrl,
  setNaraCandidateStatus,
  type NaraCandidate,
} from '@witness/core/query';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

/**
 * One National Archives document that might belong to an ancestor.
 * Candidates stay candidates until a human confirms — the matching is
 * name-based and noisy by design, so the card leads with the evidence
 * (series, years, the archives' own page) and asks, never asserts.
 */
export function NaraCandidateCard({
  candidate,
  showPerson,
  onResolved,
}: {
  candidate: NaraCandidate;
  showPerson?: boolean;
  onResolved?: (id: string, status: 'confirmed' | 'dismissed') => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  async function resolve(status: 'confirmed' | 'dismissed') {
    setBusy(true);
    try {
      await setNaraCandidateStatus(supabase, candidate.id, status);
      onResolved?.(candidate.id, status);
    } catch {
      // Leave the card interactive; a retry is one tap away.
    } finally {
      setBusy(false);
    }
  }

  const years =
    candidate.startYear || candidate.endYear
      ? ` · ${candidate.startYear ?? '?'}–${candidate.endYear ?? '?'}`
      : '';

  return (
    <Card style={{ marginBottom: 8 }}>
      <ThemedText type="smallBold">
        {NARA_SERIES_LABELS[candidate.series] ?? 'National Archives record'}
        {years}
      </ThemedText>
      <ThemedText>{candidate.title}</ThemedText>
      {showPerson && <ThemedText type="small">might be {candidate.individualName}</ThemedText>}
      {candidate.recordGroup && <ThemedText type="small">{candidate.recordGroup}</ThemedText>}
      <ThemedText type="link" onPress={() => Linking.openURL(naraCatalogUrl(candidate.naId))}>
        View at the National Archives ›
      </ThemedText>
      {candidate.status === 'confirmed' ? (
        <ThemedText type="small" themeColor="accent" style={{ fontWeight: 600 }}>
          Confirmed — part of {showPerson ? `${candidate.individualName}'s` : 'their'} record
        </ThemedText>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          {(
            [
              { label: 'This is them', status: 'confirmed', accent: true },
              { label: 'Not them', status: 'dismissed', accent: false },
            ] as const
          ).map(({ label, status, accent }) => (
            <Pressable
              key={status}
              disabled={busy}
              onPress={() => resolve(status)}
              style={{
                backgroundColor: accent ? theme.accent : theme.backgroundElement,
                borderWidth: 1,
                borderColor: accent ? theme.accent : theme.border,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 7,
                opacity: busy ? 0.5 : 1,
              }}
            >
              <ThemedText
                type="small"
                style={{ color: accent ? theme.onAccent : theme.text, fontWeight: 600 }}
              >
                {label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}
