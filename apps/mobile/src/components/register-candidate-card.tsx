import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { PersonRegisterLink, RegisterDef, RegisterRecord } from '@witness/core/registers';
import { findUnitMentions, makeUnitParser, type UnitTerms } from '@witness/core/registers';

import { Card } from '@/components/card';
import { ExplainerDot } from '@/components/explainer-dot';
import { ThemedText } from '@/components/themed-text';
import { UnitPicker } from '@/components/unit-picker';
import { useTheme } from '@/hooks/use-theme';
import { showAlert } from '@/lib/alert';
import { openExternal } from '@/lib/open-external';
import { supabase } from '@/lib/supabase';
import { attachAndConfirmRegisterEntity, confirmRegisterLink, dismissRegisterLink } from '@/lib/register-links';

/**
 * One historical-record candidate for this ancestor — the generic card
 * every register rides (docs/witness-historical-record-registers-package.md).
 * Same doctrine as the Crossing and National Archives cards: lead with the
 * plain-words reasons, carry the coverage caveat when the register has
 * one, ask and never assert. Variant B's entity picker and Variant C's
 * save-back arrive with the registers that prove them.
 */
export function RegisterCandidateCard({
  link: linkProp,
  register,
  personName,
  stateHint,
  onResolved,
  readOnly = false,
}: {
  link: PersonRegisterLink;
  register: RegisterDef;
  /** For the regiment picker's wording; the person the card sits on. */
  personName?: string;
  /** Where he lived in the war years, for the regiment picker's first shelf. */
  stateHint?: string | null;
  onResolved?: (id: string, status: 'confirmed' | 'rejected') => void;
  /** Family members see the record and the verdict; only the owner rules. */
  readOnly?: boolean;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  // Variant B attaches a record the parent never fetched — keep the
  // attached snapshot here so the card can show the unit at once.
  const [attached, setAttached] = useState<PersonRegisterLink | null>(null);
  const link = attached ?? linkProp;

  // Unit hints: a regiment the family's own papers name — an obituary
  // clipping, a headstone reading, a pension paper — found in the
  // readings of this person's media and matched to a register record.
  // Witness proposes with the words it came from; the reader attaches.
  const [hints, setHints] = useState<{ record: RegisterRecord; company: string | null; span: string; kind: string }[]>([]);
  useEffect(() => {
    if (register.variant !== 'B' || link.recordId !== null || link.status !== 'candidate') return;
    const terms = register.config.unitTerms as UnitTerms | undefined;
    if (!terms) return;
    let cancelled = false;
    (async () => {
      const { data: mediaLinks } = await supabase.from('media_links').select('media_id').eq('individual_id', link.individualId);
      const mediaIds = (mediaLinks ?? []).map((m) => m.media_id);
      if (mediaIds.length === 0) return;
      const { data: readings } = await supabase
        .from('media_readings')
        .select('kind, transcript')
        .in('media_id', mediaIds)
        .in('status', ['read', 'confirmed'])
        .not('transcript', 'is', null);
      const parse = makeUnitParser(terms);
      const found = new Map<string, { company: string | null; span: string; kind: string }>();
      for (const r of readings ?? []) {
        for (const m of findUnitMentions(r.transcript ?? '', parse)) {
          const prior = found.get(m.unit.unitKey);
          if (!prior || (!prior.company && m.unit.company)) found.set(m.unit.unitKey, { company: m.unit.company, span: m.span, kind: r.kind });
        }
      }
      if (found.size === 0) return;
      // A stone that says "Co. H 25th Mass. Vols." names no branch: its
      // key is US-MA-UNK-25, and every branch of that state and number is
      // a possible match. One record and the hint stands; several and the
      // reader sees each.
      const keys = [...found.keys()];
      const exact = keys.filter((k) => !k.includes('-UNK-'));
      const orClauses = [
        ...(exact.length > 0 ? [`entity_key.in.(${exact.join(',')})`] : []),
        ...keys.filter((k) => k.includes('-UNK-')).map((k) => `entity_key.like.${k.replace('-UNK-', '-*-')}`),
      ];
      const { data: records } = await supabase
        .from('register_records')
        .select('id, register_key, record_kind, name_as_recorded, surname_normalized, given_normalized, entity_key, attributes, source_citation, finding_aid_url')
        .eq('register_key', register.registerKey)
        .or(orClauses.join(','));
      if (cancelled) return;
      const hintFor = (entityKey: string | null) =>
        found.get(entityKey ?? '') ?? found.get((entityKey ?? '').replace(/-[A-Z]+-(\d+)$/, '-UNK-$1'));
      setHints(
        (records ?? []).filter((row) => hintFor(row.entity_key)).map((row) => ({
          record: {
            id: row.id,
            registerKey: row.register_key,
            recordKind: row.record_kind as RegisterRecord['recordKind'],
            nameAsRecorded: row.name_as_recorded,
            surnameNormalized: row.surname_normalized,
            givenNormalized: row.given_normalized,
            entityKey: row.entity_key,
            attributes: (row.attributes ?? {}) as Record<string, unknown>,
            sourceCitation: row.source_citation,
            findingAidUrl: row.finding_aid_url,
          },
          ...hintFor(row.entity_key)!,
        })),
      );
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [register, link.individualId, link.recordId, link.status]);

  async function attach(record: RegisterRecord, extra: { company: string; rank: string }) {
    const next = await attachAndConfirmRegisterEntity(link, register, record, extra);
    setAttached(next);
    setPicking(false);
    onResolved?.(link.id, 'confirmed');
  }

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
      {/* A worker-fed Variant C link (veterans' gravesites) carries the
          record itself in its snapshot — the service line and the
          cemetery are the record, so they show on the candidate too. */}
      {register.variant === 'C' && link.recordSummary && link.status !== 'confirmed' && (
        <ThemedText type="small">{link.recordSummary}</ThemedText>
      )}
      {link.matchReasons.length > 0 && (
        <ThemedText type="small">{[...new Set(link.matchReasons)].join(' · ')}</ThemedText>
      )}
      {link.sourceCitation && <ThemedText type="small">Source: {link.sourceCitation}</ThemedText>}
      {register.coverageCaveat && (
        <ThemedText type="small" themeColor="textSecondary">
          {register.coverageCaveat}
        </ThemedText>
      )}
      {link.findingAidUrl && !(link.recordId === null && register.variant === 'B') && (
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
        <View style={{ gap: 4 }}>
          <ThemedText type="small" themeColor="accent" style={{ fontWeight: 600 }}>
            {link.status === 'confirmed'
              ? `Confirmed — ${register.provenanceLabel.toLowerCase()}`
              : 'From your own tree’s record'}
          </ThemedText>
          {(register.variant === 'B' || register.variant === 'C') && link.recordSummary && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={6}>
              {link.recordSummary}
            </ThemedText>
          )}
        </View>
      ) : link.recordId === null && register.variant === 'B' ? (
        // Variant B: exposure is the candidate — there is no record to say
        // "this is them" to. The verdicts are search the outside index, or
        // rule him out; the regiment picker (the confirm) arrives with it.
        <View style={{ gap: 8, marginTop: 6 }}>
          <ThemedText type="small">{link.recordSummary}</ThemedText>
          {hints.map((h) => (
            <View key={h.record.id} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
              <ThemedText type="small">
                {h.kind === 'headstone' ? 'His headstone reads' : h.kind === 'clipping' ? 'A clipping in your file says' : 'A paper in your file says'}{' '}
                <ThemedText type="smallBold">“{h.span}”</ThemedText> — that is the{' '}
                <ThemedText type="smallBold">{h.record.nameAsRecorded}</ThemedText>
                {h.company ? `, Company ${h.company}` : ''}.
              </ThemedText>
              {!readOnly && (
                <Pressable
                  disabled={busy}
                  onPress={() => attach(h.record, { company: h.company ?? '', rank: '' })}
                  accessibilityRole="button"
                  style={{ alignSelf: 'flex-start' }}
                >
                  <ThemedText type="link">Attach the {h.record.nameAsRecorded} ›</ThemedText>
                </Pressable>
              )}
            </View>
          ))}
          {readOnly ? (
            <ThemedText type="small" themeColor="textSecondary">
              Awaiting the tree owner’s verdict
            </ThemedText>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Pressable
                disabled={busy}
                onPress={() => setPicking(true)}
                accessibilityRole="button"
                style={{
                  backgroundColor: theme.accent,
                  borderWidth: 1,
                  borderColor: theme.accent,
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                }}
              >
                <ThemedText type="small" style={{ color: theme.onAccent, fontWeight: 600 }}>
                  Add his regiment
                </ThemedText>
              </Pressable>
              {link.findingAidUrl && (
                <Pressable
                  onPress={() => openExternal(link.findingAidUrl!)}
                  accessibilityRole="button"
                  style={{
                    backgroundColor: theme.backgroundElement,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                  }}
                >
                  <ThemedText type="small" style={{ fontWeight: 600 }}>
                    Search the index ›
                  </ThemedText>
                </Pressable>
              )}
              <Pressable
                disabled={busy}
                onPress={() => resolve('rejected')}
                accessibilityRole="button"
                style={{
                  backgroundColor: theme.backgroundElement,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <ThemedText type="small" style={{ fontWeight: 600 }}>
                  Not a soldier
                </ThemedText>
              </Pressable>
            </View>
          )}
        </View>
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
      {register.variant === 'B' && (
        <UnitPicker
          register={register}
          personName={personName ?? 'him'}
          stateHint={stateHint}
          visible={picking}
          onClose={() => setPicking(false)}
          onPick={attach}
        />
      )}
    </Card>
  );
}
