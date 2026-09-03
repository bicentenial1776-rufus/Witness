import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { PersonRegisterLink, RegisterDef } from '@witness/core/registers';

import { Card } from '@/components/card';
import { ExplainerDot } from '@/components/explainer-dot';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { showAlert } from '@/lib/alert';
import { openExternal } from '@/lib/open-external';
import { confirmRegisterLink, dismissRegisterLink } from '@/lib/register-links';

/**
 * One historical-record candidate for this ancestor — the generic card
 * every register rides (docs/witness-historical-record-registers-package.md).
 * Same doctrine as the Crossing and National Archives cards: lead with the
 * plain-words reasons, carry the coverage caveat when the register has
 * one, ask and never assert. Variant B's entity picker and Variant C's
 * save-back arrive with the registers that prove them.
 */
export function RegisterCandidateCard({
  link,
  register,
  onResolved,
  readOnly = false,
}: {
  link: PersonRegisterLink;
  register: RegisterDef;
  onResolved?: (id: string, status: 'confirmed' | 'rejected') => void;
  /** Family members see the record and the verdict; only the owner rules. */
  readOnly?: boolean;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  async function resolve(status: 'confirmed' | 'rejected') {
    setBusy(true);
    try {
      if (status === 'confirmed') await confirmRegisterLink(link, register);
      else await dismissRegisterLink(link.id);
      onResolved?.(link.id, status);
    } catch (error) {
      showAlert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <ThemedText type="smallBold">{register.displayName}</ThemedText>
        {register.config.explainer && (
          <ExplainerDot title={register.displayName} text={register.config.explainer} />
        )}
      </View>
      {link.recordName && <ThemedText>{link.recordName}</ThemedText>}
      {link.matchReasons.length > 0 && (
        <ThemedText type="small">{link.matchReasons.join(' · ')}</ThemedText>
      )}
      {link.sourceCitation && <ThemedText type="small">Source: {link.sourceCitation}</ThemedText>}
      {register.coverageCaveat && (
        <ThemedText type="small" themeColor="textSecondary">
          {register.coverageCaveat}
        </ThemedText>
      )}
      {link.findingAidUrl && (
        <ThemedText
          type="link"
          accessibilityRole="button"
          accessibilityLabel={`View the source for ${register.displayName}`}
          onPress={() => openExternal(link.findingAidUrl!)}
        >
          View source ›
        </ThemedText>
      )}
      {link.status === 'confirmed' || link.status === 'parsed_from_gedcom' ? (
        <ThemedText type="small" themeColor="accent" style={{ fontWeight: 600 }}>
          {link.status === 'confirmed'
            ? `Confirmed — ${register.provenanceLabel.toLowerCase()}`
            : 'From your own tree’s record'}
        </ThemedText>
      ) : readOnly ? (
        <ThemedText type="small" themeColor="textSecondary">
          Awaiting the tree owner’s verdict
        </ThemedText>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          {(
            [
              { label: 'This is them', status: 'confirmed', accent: true },
              { label: 'Not them', status: 'rejected', accent: false },
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
