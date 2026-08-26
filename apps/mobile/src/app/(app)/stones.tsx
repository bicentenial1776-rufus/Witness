import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, SectionList, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { showAlert, showDestructiveConfirm } from '@/lib/alert';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { mono } from '@/constants/theme';
import { useLetterpress } from '@/hooks/use-theme';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
import { addCorrection } from '@/lib/corrections';
import {
  addPersonFromStone,
  attachAndRecordMarriage,
  attachCapture,
  findAGraveUrl,
  flushQueue,
  leadBrief,
  listCaptures,
  pendingCount,
  photoUrl,
  rereadCapture,
  rescoreCapture,
  setCaptureStatus,
  walkBackUrl,
  type GraveCapture,
  type KinAnchor,
  type MatchCandidate,
} from '@/lib/grave-captures';

/**
 * Stone readings — the visit's ledger (At the Stone, steps 3 and 5).
 * Grouped by cemetery, the way the day actually went. Every capture
 * ends somewhere: attached to a person, filed as a research lead, or
 * set aside — person by person, never bulk. A stone whose date
 * disagrees with the tree can file the difference straight into the
 * margin, the same corrections the punch list carries to Ancestry.
 */

const STATUS_LINE: Record<GraveCapture['status'], string> = {
  queued: 'WAITING TO READ',
  reading: 'READING…',
  read: 'VERDICT READY',
  attached: 'ATTACHED',
  lead: 'RESEARCH LEAD',
  dismissed: 'SET ASIDE',
  failed: 'READ FAILED — TAP TO RETRY',
};

/** The stone's death date, prettily, for corrections and briefs. */
function stoneDeathDate(capture: GraveCapture): string | null {
  const d = capture.divined;
  if (!d?.death_year) return null;
  return d.death_month ? `${d.death_month}/${d.death_day ?? '?'}/${d.death_year}` : String(d.death_year);
}

function CandidateCard({
  capture,
  cand,
  busy,
  onAttach,
  onRecordMarriage,
}: {
  capture: GraveCapture;
  cand: MatchCandidate;
  busy: boolean;
  onAttach: (individualId: string, correction: boolean) => void;
  onRecordMarriage: (individualId: string, anchor: KinAnchor) => void;
}) {
  const L = useLetterpress();
  const stoneYear = capture.divined?.death_year ?? null;
  const conflict =
    stoneYear !== null && cand.death_year !== null && stoneYear !== cand.death_year;
  // The stone asserts a marriage the tree hasn't recorded: offer to
  // record it as part of the attach (the Melvina case — "wife of Alvin
  // Howe" beside an Alvin with no wife linked).
  const spouseAnchor = (capture.divined?.anchors ?? []).find(
    (a) =>
      a.role === 'spouse' &&
      !cand.reasons.some((r) => r.includes('is their spouse in your tree')),
  );
  return (
    <View style={{ borderWidth: 1, borderColor: L.rule, backgroundColor: L.well, padding: 10, gap: 6 }}>
      <Pressable
        onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: cand.individual_id } })}
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: L.ink }}>
          {cand.full_name}{' '}
          <Text style={mono(12, L.muted)}>
            {cand.birth_year ?? '?'}–{cand.death_year ?? '?'}
          </Text>
        </Text>
      </Pressable>
      <Text style={mono(10.5, L.deepAmber)}>WHY: {cand.reasons.join(' · ').toUpperCase()}</Text>
      {conflict && (
        <Text style={mono(10.5, L.muted)}>
          THE STONE DISAGREES: DIED {stoneDeathDate(capture)?.toUpperCase()} — THE TREE CARRIES{' '}
          {cand.death_year}
        </Text>
      )}
      <Pressable
        disabled={busy}
        onPress={() => onAttach(cand.individual_id, false)}
        accessibilityRole="button"
        style={{ backgroundColor: L.amber, paddingVertical: 10, alignItems: 'center' }}
      >
        <Text style={mono(11.5, L.paper)}>THIS IS THEM — ATTACH</Text>
      </Pressable>
      {conflict && (
        <Pressable
          disabled={busy}
          onPress={() => onAttach(cand.individual_id, true)}
          accessibilityRole="button"
          style={{ borderWidth: 1, borderColor: L.amber, paddingVertical: 10, alignItems: 'center' }}
        >
          <Text style={mono(11.5, L.amber)}>ATTACH + NOTE THE DATE IN THE MARGIN</Text>
        </Pressable>
      )}
      {spouseAnchor && (
        <Pressable
          disabled={busy}
          onPress={() => onRecordMarriage(cand.individual_id, spouseAnchor)}
          accessibilityRole="button"
          style={{ borderWidth: 1, borderColor: L.amber, paddingVertical: 10, alignItems: 'center' }}
        >
          <Text style={mono(11.5, L.amber)}>
            ATTACH + RECORD THE MARRIAGE TO {spouseAnchor.full_name.toUpperCase()}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function CaptureCard({ capture, onChanged }: { capture: GraveCapture; onChanged: () => void }) {
  const L = useLetterpress();
  const [open, setOpen] = useState(false);
  const [thumb, setThumb] = useState<{ uri: string; ratio: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const d = capture.divined;

  const toggle = () => {
    setOpen((o) => !o);
    if (!thumb && capture.photo_paths[0]) {
      // The whole photo, at its own shape — a cover-crop here reads as
      // "the camera missed part of the stone" when it didn't.
      photoUrl(capture.photo_paths[0])
        .then((url) => {
          if (!url) return;
          Image.getSize(
            url,
            (w, h) => setThumb({ uri: url, ratio: w > 0 && h > 0 ? w / h : 3 / 4 }),
            () => setThumb({ uri: url, ratio: 3 / 4 }),
          );
        })
        .catch(() => {});
    }
    if (capture.status === 'failed') {
      rereadCapture(capture.id)
        .then(onChanged)
        .catch((e: unknown) => showAlert('Could not retry', e instanceof Error ? e.message : ''));
    }
  };

  const attach = async (individualId: string, withCorrection: boolean) => {
    setBusy(true);
    try {
      await attachCapture(capture, individualId);
      if (withCorrection) {
        const cand = capture.candidates?.find((c) => c.individual_id === individualId);
        await addCorrection({
          individualId,
          treeId: capture.tree_id,
          subject: 'death',
          currentValue: cand?.death_year != null ? String(cand.death_year) : null,
          snapshotKey: null,
          correctedValue: stoneDeathDate(capture) ?? '',
          note: `From the headstone${capture.cemetery ? ` at ${capture.cemetery}` : ''}: "${capture.transcription ?? ''}"`,
        });
      }
      onChanged();
    } catch (e: unknown) {
      showAlert('Could not attach', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const recordMarriage = (individualId: string, anchor: KinAnchor) => {
    showDestructiveConfirm(
      'Record the marriage?',
      `Attach the stone and record this person as ${anchor.full_name}'s spouse — the link the stone asserts. It can be undone from their page.`,
      'Record it',
      async () => {
        setBusy(true);
        try {
          await attachAndRecordMarriage(capture, individualId, anchor);
          onChanged();
        } catch (e: unknown) {
          showAlert('Could not record it', e instanceof Error ? e.message : '');
        } finally {
          setBusy(false);
        }
      },
    );
  };

  const addFromStone = (anchor: KinAnchor) => {
    const name = capture.divined?.name ?? 'this person';
    showDestructiveConfirm(
      'Add them to your tree?',
      `Add ${name} as ${anchor.full_name}'s ${anchor.role === 'spouse' ? 'spouse' : 'child'}, the way the stone says — one person, linked, with the stone attached.`,
      'Add them',
      async () => {
        setBusy(true);
        try {
          const id = await addPersonFromStone(capture, anchor);
          onChanged();
          router.push({ pathname: '/ancestor/[id]', params: { id } });
        } catch (e: unknown) {
          showAlert('Could not add them', e instanceof Error ? e.message : '');
        } finally {
          setBusy(false);
        }
      },
    );
  };

  const file = async (status: 'lead' | 'dismissed') => {
    setBusy(true);
    try {
      await setCaptureStatus(capture.id, status);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const recheck = async () => {
    setBusy(true);
    try {
      await rescoreCapture(capture.id);
      onChanged();
    } catch (e: unknown) {
      showAlert('Could not re-check', e instanceof Error ? e.message : '');
    } finally {
      setBusy(false);
    }
  };

  const title =
    d?.name ??
    (capture.status === 'queued' || capture.status === 'reading' ? 'A stone, unread' : 'Unreadable stone');

  return (
    <View style={{ borderWidth: 1, borderColor: L.rule, backgroundColor: L.raised, marginTop: 10 }}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ padding: 12 }}
      >
        <Text style={{ fontSize: 17, fontWeight: '600', color: L.ink }}>{title}</Text>
        <Text style={{ ...mono(11.5, L.muted), marginTop: 3 }} maxFontSizeMultiplier={1.3}>
          {STATUS_LINE[capture.status]}
        </Text>
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}>
          {thumb && (
            <Image
              source={{ uri: thumb.uri }}
              style={{ width: '100%', aspectRatio: thumb.ratio, borderWidth: 1, borderColor: L.rule }}
              resizeMode="contain"
            />
          )}
          {capture.transcription && (
            <View style={{ borderLeftWidth: 2, borderLeftColor: L.amber, paddingLeft: 10 }}>
              <Text style={{ fontStyle: 'italic', fontSize: 15, lineHeight: 22, color: L.ink }}>
                {capture.transcription}
              </Text>
            </View>
          )}
          {d && capture.status !== 'lead' && (
            <Text style={mono(11.5, L.muted)}>
              {[
                d.death_year ? `DIED ${d.death_year}` : null,
                d.age_years !== null ? `AGE ON STONE ${d.age_years}` : null,
                d.birth_year_computed !== null && d.birth_year_carved === null
                  ? `BORN ~${d.birth_year_computed} (COMPUTED)`
                  : d.birth_year_carved
                    ? `BORN ${d.birth_year_carved}`
                    : null,
                ...(d.relationship_phrases ?? []).map((p) => `"${p.toUpperCase()}"`),
                d.military ? d.military.toUpperCase() : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
          {capture.status === 'lead' && (
            <>
              <Text style={{ fontSize: 14.5, lineHeight: 21, color: L.ink }}>{leadBrief(capture)}</Text>
              <Pressable
                onPress={() => WebBrowser.openBrowserAsync(findAGraveUrl(capture))}
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text style={mono(11.5, L.amber)}>SEARCH FIND A GRAVE ›</Text>
              </Pressable>
            </>
          )}
          {capture.status === 'read' &&
            (capture.candidates?.length ? (
              capture.candidates.map((cand) => (
                <CandidateCard
                  key={cand.individual_id}
                  capture={capture}
                  cand={cand}
                  busy={busy}
                  onAttach={attach}
                  onRecordMarriage={recordMarriage}
                />
              ))
            ) : (
              <Text style={{ fontSize: 14.5, color: L.muted }}>
                No one in your tree answers to this stone yet.
              </Text>
            ))}
          {capture.status === 'read' && (capture.divined?.anchors?.length ?? 0) > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ ...mono(10.5, L.muted), letterSpacing: 1.5 }}>
                THE STONE POINTS INTO YOUR TREE
              </Text>
              {(capture.divined?.anchors ?? []).map((anchor) => (
                <Pressable
                  key={`${anchor.role}-${anchor.individual_id}`}
                  disabled={busy}
                  onPress={() => addFromStone(anchor)}
                  accessibilityRole="button"
                  style={{ borderWidth: 1, borderColor: L.rule, backgroundColor: L.well, paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={mono(11.5, L.ink)}>
                    ADD AS {anchor.role === 'spouse' ? 'SPOUSE' : 'CHILD'} OF{' '}
                    {anchor.full_name.toUpperCase()} — NEW PERSON
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {capture.status === 'read' && (
            <Pressable onPress={recheck} disabled={busy} hitSlop={6} accessibilityRole="button">
              <Text style={mono(11, L.muted)}>RE-CHECK THE TREE (AFTER EDITS) ›</Text>
            </Pressable>
          )}
          {walkBackUrl(capture) && (
            <Pressable
              onPress={() => Linking.openURL(walkBackUrl(capture)!)}
              hitSlop={6}
              accessibilityRole="button"
            >
              <Text style={mono(11, L.amber)}>WALK ME BACK TO THIS STONE ›</Text>
            </Pressable>
          )}
          {(capture.status === 'read' || capture.status === 'lead') && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {capture.status === 'read' && (
                <Pressable
                  disabled={busy}
                  onPress={() => file('lead')}
                  accessibilityRole="button"
                  style={{ flex: 1, borderWidth: 1, borderColor: L.amber, paddingVertical: 10, alignItems: 'center' }}
                >
                  <Text style={mono(11.5, L.amber)}>FILE AS RESEARCH LEAD</Text>
                </Pressable>
              )}
              <Pressable
                disabled={busy}
                onPress={() => file('dismissed')}
                accessibilityRole="button"
                style={{ flex: 1, borderWidth: 1, borderColor: L.rule, paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={mono(11.5, L.muted)}>SET ASIDE</Text>
              </Pressable>
            </View>
          )}
          {capture.status === 'attached' && capture.matched_individual_id && (
            <ThemedText
              type="link"
              onPress={() =>
                router.push({ pathname: '/ancestor/[id]', params: { id: capture.matched_individual_id! } })
              }
            >
              Their page ›
            </ThemedText>
          )}
        </View>
      )}
    </View>
  );
}

export default function StonesScreen() {
  const L = useLetterpress();
  const { activeTree, loadFailed } = useActiveTree();
  const [captures, setCaptures] = useState<GraveCapture[] | null>(null);
  const [pending, setPending] = useState(0);

  const reload = useCallback(() => {
    if (!activeTree) return;
    listCaptures(activeTree.id)
      .then(setCaptures)
      .catch(() => setCaptures([]));
    pendingCount().then(setPending).catch(() => {});
  }, [activeTree?.id]);

  useFocusEffect(
    useCallback(() => {
      reload();
      // The queue drains whenever the ledger comes into view with signal.
      flushQueue()
        .then((sent) => {
          if (sent) reload();
        })
        .catch(() => {});
    }, [reload]),
  );

  if (!activeTree) {
    return (
      <ThemedView style={{ flex: 1, padding: 24 }}>
        <Stack.Screen options={{ title: 'Stone readings' }} />
        <ThemedText>{noTreeMessage(loadFailed, 'to check stones against your people')}</ThemedText>
      </ThemedView>
    );
  }

  // The day as it went: one section per cemetery.
  const sections = (() => {
    const byCemetery = new Map<string, GraveCapture[]>();
    for (const capture of captures ?? []) {
      const key = capture.cemetery ?? 'Unplaced stones';
      byCemetery.set(key, [...(byCemetery.get(key) ?? []), capture]);
    }
    return [...byCemetery.entries()].map(([title, data]) => ({ title, data }));
  })();

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Stone readings' }} />
      <SectionList
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ gap: 4 }}>
            <ThemedText type="small">
              Every stone ends somewhere: attached to a person, filed as a research lead, or set
              aside.
            </ThemedText>
            {pending > 0 && (
              <Text style={mono(11.5, L.amber)}>
                {pending} STONE{pending === 1 ? '' : 'S'} QUEUED — WILL READ WHEN SIGNAL RETURNS
              </Text>
            )}
            {captures === null && <ActivityIndicator style={{ marginVertical: 16 }} />}
            {captures?.length === 0 && (
              <ThemedText style={{ marginTop: 12 }}>
                No stones yet. At a cemetery, open At the Stone and photograph the ones that feel
                familiar.
              </ThemedText>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={{ ...mono(11, L.deepAmber), letterSpacing: 1.5, marginTop: 18 }}>
            {section.title.toUpperCase()}
          </Text>
        )}
        renderItem={({ item }) => <CaptureCard capture={item} onChanged={reload} />}
      />
    </ThemedView>
  );
}
