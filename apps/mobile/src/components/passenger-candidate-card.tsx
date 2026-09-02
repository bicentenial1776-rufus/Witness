import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { voyageExplainer } from '@witness/core/history';
import type { PassengerCandidate } from '@witness/core/query';

import { Card } from '@/components/card';
import { ExplainerDot } from '@/components/explainer-dot';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { confirmPassengerCandidate, dismissPassengerCandidate } from '@/lib/passenger-candidates';
import { showAlert } from '@/lib/alert';

const CONFIDENCE_LABEL: Record<PassengerCandidate['confidence'], string> = {
  strong: 'Strong match',
  probable: 'Probable match',
  weak: 'Weak match',
};

/**
 * One shipping-list passenger who might be this ancestor. Candidates stay
 * candidates until a human confirms — matching is name-and-year, not proof,
 * so the card leads with the reasons and asks, never asserts (the same
 * doctrine as the National Archives card and At the Stone).
 */
export function PassengerCandidateCard({
  candidate,
  onResolved,
}: {
  candidate: PassengerCandidate;
  onResolved?: (id: string, status: 'confirmed' | 'dismissed') => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  async function resolve(status: 'confirmed' | 'dismissed') {
    setBusy(true);
    try {
      if (status === 'confirmed') {
        await confirmPassengerCandidate(candidate);
      } else {
        await dismissPassengerCandidate(candidate.id);
      }
      onResolved?.(candidate.id, status);
    } catch (error) {
      showAlert(
        'Could not save',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const years =
    candidate.passengerBirthYear || candidate.passengerDeathYear
      ? ` (${candidate.passengerBirthYear ?? '?'}–${candidate.passengerDeathYear ?? '?'})`
      : '';

  return (
    <Card style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <ThemedText
          type="smallBold"
          onPress={() =>
            router.push({
              pathname: '/voyage/[voyageId]',
              params: { voyageId: candidate.voyageId, treeId: candidate.treeId },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`The ${candidate.ship}, ${candidate.arrivalYear} — see everyone of yours aboard`}
        >
          {candidate.ship}, {candidate.arrivalYear} ›
        </ThemedText>
        <ExplainerDot
          title={`The ${candidate.ship}, ${candidate.arrivalYear}`}
          text={voyageExplainer({
            voyageId: candidate.voyageId,
            ship: candidate.ship,
            arrivalYear: candidate.arrivalYear,
            departurePort: candidate.departurePort,
            arrivalPlace: candidate.arrivalPlace,
            source: candidate.source,
          })}
        />
      </View>
      <ThemedText>
        {candidate.passengerName}
        {years}
      </ThemedText>
      <ThemedText type="small">
        {CONFIDENCE_LABEL[candidate.confidence]} · {candidate.reasons.join(' · ')}
      </ThemedText>
      <ThemedText type="small">
        Source: {candidate.source}
      </ThemedText>
      {candidate.status === 'confirmed' ? (
        <ThemedText type="small" themeColor="accent" style={{ fontWeight: 600 }}>
          Confirmed — an immigration event now carries this crossing
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
