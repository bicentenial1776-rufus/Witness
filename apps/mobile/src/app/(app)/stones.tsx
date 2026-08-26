import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';

import { showAlert } from '@/lib/alert';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { mono } from '@/constants/theme';
import { useLetterpress } from '@/hooks/use-theme';
import { noTreeMessage, useActiveTree } from '@/lib/active-tree';
import {
  attachCapture,
  flushQueue,
  listCaptures,
  pendingCount,
  photoUrl,
  rereadCapture,
  setCaptureStatus,
  type GraveCapture,
} from '@/lib/grave-captures';

/**
 * Stone readings — the visit's ledger (At the Stone, steps 3 and 5).
 * Every capture ends somewhere: attached to a person, filed as a
 * research lead, or dismissed. Nothing is added to the tree without a
 * person-by-person yes.
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

function CaptureCard({ capture, onChanged }: { capture: GraveCapture; onChanged: () => void }) {
  const L = useLetterpress();
  const [open, setOpen] = useState(false);
  const [thumb, setThumb] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = capture.divined;

  const loadThumb = async () => {
    if (!thumb && capture.photo_paths[0]) setThumb(await photoUrl(capture.photo_paths[0]));
  };

  const toggle = () => {
    setOpen((o) => !o);
    loadThumb().catch(() => {});
    if (capture.status === 'failed') {
      rereadCapture(capture.id)
        .then(onChanged)
        .catch((e: unknown) => showAlert('Could not retry', e instanceof Error ? e.message : ''));
    }
  };

  const attach = async (individualId: string) => {
    setBusy(true);
    try {
      await attachCapture(capture, individualId);
      onChanged();
    } catch (e: unknown) {
      showAlert('Could not attach', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
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
          {capture.cemetery ? `\n${capture.cemetery.toUpperCase()}` : ''}
        </Text>
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}>
          {thumb && (
            <Image
              source={{ uri: thumb }}
              style={{ width: '100%', height: 220, borderWidth: 1, borderColor: L.rule }}
              resizeMode="cover"
            />
          )}
          {capture.transcription && (
            <View style={{ borderLeftWidth: 2, borderLeftColor: L.amber, paddingLeft: 10 }}>
              <Text style={{ fontStyle: 'italic', fontSize: 15, lineHeight: 22, color: L.ink }}>
                {capture.transcription}
              </Text>
            </View>
          )}
          {d && (
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
          {capture.status === 'read' &&
            (capture.candidates?.length ? (
              capture.candidates.map((cand) => (
                <View
                  key={cand.individual_id}
                  style={{ borderWidth: 1, borderColor: L.rule, backgroundColor: L.well, padding: 10, gap: 6 }}
                >
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/ancestor/[id]', params: { id: cand.individual_id } })
                    }
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: L.ink }}>
                      {cand.full_name}{' '}
                      <Text style={mono(12, L.muted)}>
                        {cand.birth_year ?? '?'}–{cand.death_year ?? '?'}
                      </Text>
                    </Text>
                  </Pressable>
                  <Text style={mono(10.5, L.deepAmber)}>
                    WHY: {cand.reasons.join(' · ').toUpperCase()}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      disabled={busy}
                      onPress={() => attach(cand.individual_id)}
                      accessibilityRole="button"
                      style={{ flex: 1, backgroundColor: L.amber, paddingVertical: 10, alignItems: 'center' }}
                    >
                      <Text style={mono(11.5, L.paper)}>THIS IS THEM — ATTACH</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Text style={{ fontSize: 14.5, color: L.muted }}>
                No one in your tree answers to this stone yet.
              </Text>
            ))}
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

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Stone readings' }} />
      <FlatList
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        data={captures ?? []}
        keyExtractor={(item) => item.id}
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
        renderItem={({ item }) => <CaptureCard capture={item} onChanged={reload} />}
      />
    </ThemedView>
  );
}
