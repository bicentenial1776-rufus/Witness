import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { ancestryPersonUrl } from '@/lib/ancestry';
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
  const [copied, setCopied] = useState(false);
  const [ancestryUrl, setAncestryUrl] = useState<string | null>(null);

  // Not every tree came from Ancestry — trees.ancestry_tree_id is only
  // backfilled from Ancestry GEDCOM exports, so the bridge appears only
  // when this person actually has a page there. Other providers would get
  // their own check here.
  useEffect(() => {
    if (candidate.status !== 'confirmed') return;
    let cancelled = false;
    supabase
      .from('individuals')
      .select('gedcom_xref, trees!individuals_tree_id_fkey(ancestry_tree_id)')
      .eq('id', candidate.individualId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const tree = data.trees as { ancestry_tree_id: string | null } | null;
        setAncestryUrl(ancestryPersonUrl(tree?.ancestry_tree_id ?? null, data.gedcom_xref));
      });
    return () => {
      cancelled = true;
    };
  }, [candidate.status, candidate.individualId]);

  // Ancestry has no write API, so "ingestion" is a human bridge: put the
  // record's permanent catalog URL on the clipboard (bare — Ancestry's
  // web-link field validates a lone URL and rejects citation prose), then
  // deep-link to the person's facts page for "Add source" + paste. Once
  // saved, the link rides future GEDCOM exports back into Witness.
  async function addToAncestry() {
    if (!ancestryUrl) return;
    await Clipboard.setStringAsync(naraCatalogUrl(candidate.naId));
    setCopied(true);
    Linking.openURL(ancestryUrl);
  }

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
      {/* The person is the way back into the app. Without this the archives are a
          one-way street: a matched draft card that cannot take you to the man it
          belongs to (see docs/cohesion-design-brief.md). */}
      {showPerson && (
        <ThemedText
          type="link"
          onPress={() =>
            router.push({ pathname: '/ancestor/[id]', params: { id: candidate.individualId } })
          }
        >
          {candidate.status === 'confirmed' ? '' : 'might be '}
          {candidate.individualName} ›
        </ThemedText>
      )}
      {candidate.recordGroup && <ThemedText type="small">{candidate.recordGroup}</ThemedText>}
      <ThemedText type="link" onPress={() => Linking.openURL(naraCatalogUrl(candidate.naId))}>
        View at the National Archives ›
      </ThemedText>
      {candidate.status === 'confirmed' ? (
        <>
          <ThemedText type="small" themeColor="accent" style={{ fontWeight: 600 }}>
            Confirmed — part of their record
          </ThemedText>
          {ancestryUrl && (
            <ThemedText type="link" onPress={addToAncestry}>
              Add to Ancestry ›
            </ThemedText>
          )}
          {copied && (
            <ThemedText type="small">
              Record link copied — on their Ancestry page, tap “Add source” and paste it as a web
              link. (Sign in to ancestry.com if asked.)
            </ThemedText>
          )}
        </>
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
