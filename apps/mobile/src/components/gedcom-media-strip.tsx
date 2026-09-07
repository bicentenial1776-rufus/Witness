import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';


import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';
import { BrandFonts } from '@/constants/theme';

interface MediaItem {
  id: string;
  title: string | null;
  url: string;
}

interface MediaRow {
  id: string;
  title: string | null;
  storage_path: string | null;
  upload_status: string;
  format: string | null;
}

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const MAX_ITEMS = 24;

/**
 * The photos a GEDCOM attached directly to this person — the primary
 * portrait first, then the rest. Only files whose bytes have actually
 * been uploaded show; a pending row is a promise, not a picture.
 *
 * Tapping a thumbnail opens the full image: uploads are the originals
 * (Family Tree Maker portraits run 500 KB to 8 MB), so there is real
 * resolution behind the 116-point square. Pinch to zoom on native.
 *
 * `enabled` is false on the saved field copy: the strip needs the server
 * for both the rows and the signed URLs (SPEC_offline-field-mode.md).
 */
export function GedcomMediaStrip({
  individualId,
  treeId,
  enabled = true,
}: {
  individualId: string;
  treeId: string;
  enabled?: boolean;
}) {
  const theme = useTheme();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [open, setOpen] = useState<MediaItem | null>(null);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from('media_links')
        .select('media_id, is_primary, media(id, title, storage_path, upload_status, format)')
        .eq('tree_id', treeId)
        .eq('individual_id', individualId)
        .order('is_primary', { ascending: false })
        .limit(MAX_ITEMS * 2);
      if (error || cancelled) return;
      const seen = new Set<string>();
      const rows: MediaRow[] = [];
      for (const link of data ?? []) {
        const media = (Array.isArray(link.media) ? link.media[0] : link.media) as MediaRow | null;
        if (!media || seen.has(media.id)) continue;
        if (media.upload_status !== 'complete' || !media.storage_path) continue;
        if (!IMAGE_FORMATS.has((media.format ?? '').toLowerCase())) continue;
        seen.add(media.id);
        rows.push(media);
        if (rows.length >= MAX_ITEMS) break;
      }
      const signed = await Promise.all(
        rows.map(async (media) => {
          const result = await supabase.storage.from('tree-media').createSignedUrl(media.storage_path!, 3600);
          return result.data?.signedUrl ? { id: media.id, title: media.title, url: result.data.signedUrl } : null;
        }),
      );
      if (!cancelled) setItems(signed.filter((item): item is MediaItem => item !== null));
    }
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [individualId, treeId, enabled]);

  if (items.length === 0) return null;
  return (
    <View style={{ marginTop: 16 }} accessibilityRole="list" accessibilityLabel="Photos from your tree file">
      <Text
        style={{
          fontFamily: BrandFonts.mono.regular,
          fontSize: 12,
          letterSpacing: 1,
          color: theme.textSecondary,
        }}
      >
        PHOTOS FROM YOUR TREE FILE
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingTop: 8 }}
      >
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setOpen(item)}
            accessibilityRole="imagebutton"
            accessibilityLabel={item.title ?? 'Photo from your tree file'}
            accessibilityHint="Opens the full-size photo"
          >
            <Image
              source={{ uri: item.url }}
              style={{ width: 116, height: 116, borderWidth: 1, borderColor: theme.border }}
              resizeMode="cover"
            />
          </Pressable>
        ))}
      </ScrollView>
      <PhotoViewer item={open} onClose={() => setOpen(null)} />
    </View>
  );
}

/**
 * Full-screen viewer. Dark ground regardless of theme — a photograph is
 * looked at against black — with the GEDCOM's title as the only caption.
 * Tap the scrim or the close control to leave; the ScrollView gives
 * pinch-to-zoom on iOS and Android for free (no-op on web).
 */
interface Reading {
  id: string;
  kind: string;
  description: string | null;
  transcript: string | null;
  summary: string | null;
  confidence: string;
  status: string;
}

/**
 * "What it says" — the reading beneath the photograph (docs/media-reading-
 * design-brief.md, phase 4): a machine's transcript with its confidence,
 * and the owner's verdict on it. Evidence, never fact; the record above
 * is untouched either way.
 */
function useReading(mediaId: string | null): [Reading | null, (status: 'confirmed' | 'rejected') => Promise<void>] {
  const [reading, setReading] = useState<Reading | null>(null);
  useEffect(() => {
    setReading(null);
    if (!mediaId) return;
    let cancelled = false;
    supabase
      .from('media_readings')
      .select('id, kind, description, transcript, summary, confidence, status')
      .eq('media_id', mediaId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setReading(data as Reading);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);
  const judge = async (status: 'confirmed' | 'rejected') => {
    if (!reading) return;
    const { error } = await supabase
      .from('media_readings')
      .update({ status, confirmed_at: status === 'confirmed' ? new Date().toISOString() : null })
      .eq('id', reading.id);
    if (!error) setReading({ ...reading, status });
  };
  return [reading, judge];
}

function PhotoViewer({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [reading, judge] = useReading(item?.id ?? null);
  const hasText = Boolean(reading?.transcript);
  const imageHeight = hasText ? height * 0.5 : height * 0.82;
  return (
    <Modal visible={item !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ width, height, justifyContent: 'center' }}
          minimumZoomScale={1}
          maximumZoomScale={4}
          centerContent
          bouncesZoom
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={onClose} style={{ width, height: hasText ? undefined : height, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Close photo">
            {item && (
              <Image
                source={{ uri: item.url }}
                style={{ width, height: imageHeight, marginTop: hasText ? 90 : 0 }}
                resizeMode="contain"
                accessibilityLabel={item.title ?? 'Photo from your tree file'}
              />
            )}
          </Pressable>
          {reading && (hasText || reading.description) && (
            <View style={{ paddingHorizontal: 20, paddingBottom: 110, gap: 8 }}>
              <Text style={{ fontFamily: BrandFonts.mono.regular, fontSize: 12, letterSpacing: 1, color: '#B0A69A' }}>
                {hasText ? 'WHAT IT SAYS' : 'WHAT IT IS'}
                {' · '}
                {reading.status === 'confirmed'
                  ? 'CONFIRMED'
                  : reading.status === 'rejected'
                    ? 'MARKED NOT QUITE'
                    : `READ BY MACHINE · ${reading.confidence.toUpperCase()} CONFIDENCE`}
              </Text>
              {reading.description && (
                <Text style={{ fontFamily: BrandFonts.serif.italic, fontSize: 15, color: '#E9E2D6' }}>{reading.description}</Text>
              )}
              {reading.summary && hasText && (
                <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14, color: '#E9E2D6' }}>{reading.summary}</Text>
              )}
              {hasText && (
                <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 15, lineHeight: 22, color: '#F3EEE4' }}>{reading.transcript}</Text>
              )}
              {hasText && reading.status === 'read' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  {(
                    [
                      { label: 'That’s right', status: 'confirmed' },
                      { label: 'Not quite', status: 'rejected' },
                    ] as const
                  ).map(({ label, status }) => (
                    <Pressable
                      key={status}
                      onPress={() => judge(status)}
                      accessibilityRole="button"
                      style={{ borderWidth: 1, borderColor: '#B0A69A', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 }}
                    >
                      <Text style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 14, color: '#F3EEE4' }}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
        {item?.title ? (
          <Text
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              bottom: 40,
              fontFamily: BrandFonts.mono.regular,
              fontSize: 12,
              letterSpacing: 0.5,
              color: '#E9E2D6',
              textAlign: 'center',
            }}
            numberOfLines={2}
          >
            {item.title.toUpperCase()}
          </Text>
        ) : null}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          hitSlop={12}
          style={{
            position: 'absolute',
            top: 56,
            right: 20,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255, 255, 255, 0.14)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 20, lineHeight: 22 }}>×</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
