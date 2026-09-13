import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { SanbornOverlayMap, type SanbornOverlay } from '@/components/sanborn-overlay-map';
import { ThemedText } from '@/components/themed-text';
import { mono } from '@/constants/theme';
import { useLetterpress } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

/**
 * The town, mapped in their day — Sanborn fire insurance editions for
 * this place, from the Library of Congress via the sanborn-lookup edge
 * function (cached server-side; LOC is rate-limited). The block hides
 * itself entirely for places LOC doesn't cover — most of the world —
 * and while anything is loading or failing. Street View sourcing's
 * first visible surface.
 */

const STATE_WORDS = new Set(
  (
    'alabama alaska arizona arkansas california colorado connecticut delaware ' +
    'florida georgia hawaii idaho illinois indiana iowa kansas kentucky ' +
    'louisiana maine maryland massachusetts michigan minnesota mississippi ' +
    'missouri montana nebraska nevada ohio oklahoma oregon pennsylvania ' +
    'tennessee texas utah vermont virginia washington wisconsin wyoming ' +
    'al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms ' +
    'mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc'
  )
    .split(' ')
    .concat([
      'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina',
      'north dakota', 'rhode island', 'south carolina', 'south dakota',
      'west virginia', 'district of columbia',
    ]),
);

interface Edition {
  item_id: string | null;
  item_url: string;
  title: string;
  place: string | null;
  date: string | null;
  year: number | null;
  sheets: number | null;
  thumb: string | null;
  /** A georeferenced mosaic (OldInsuranceMaps.net), where one exists. */
  overlay?: SanbornOverlay | null;
}

export function SanbornBlock({ parts, aroundYear }: { parts: string[]; aroundYear: number | null }) {
  const L = useLetterpress();
  const [editions, setEditions] = useState<Edition[]>([]);
  const [closest, setClosest] = useState<Edition | null>(null);
  const [overlayEdition, setOverlayEdition] = useState<Edition | null>(null);
  const [thumb, setThumb] = useState<{ uri: string; ratio: number } | null>(null);

  const stateIdx = parts.findIndex((p) => STATE_WORDS.has(p.trim().toLowerCase()));
  const city = stateIdx >= 1 ? parts[0].trim() : null;
  const state = stateIdx >= 1 ? parts[stateIdx].trim() : null;

  useEffect(() => {
    if (!city || !state) return;
    let cancelled = false;
    supabase.functions
      .invoke('sanborn-lookup', {
        body: { city, state, year: aroundYear ?? undefined },
      })
      .then(({ data }) => {
        if (cancelled || !data?.editions?.length) return;
        setEditions(data.editions as Edition[]);
        const lead = (data.closest as Edition | null) ?? (data.editions[0] as Edition);
        setClosest(lead);
        setOverlayEdition((data.overlay as Edition | null) ?? null);
        if (lead?.thumb) {
          const uri = lead.thumb;
          Image.getSize(
            uri,
            (w, h) => setThumb({ uri, ratio: w > 0 && h > 0 ? w / h : 4 / 3 }),
            () => setThumb({ uri, ratio: 4 / 3 }),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [city, state, aroundYear]);

  if (!editions.length || !closest) return null;

  return (
    <View style={{ marginTop: 20, gap: 8 }}>
      <ThemedText type="subtitle">The town, mapped in their day</ThemedText>
      <ThemedText type="small">
        Fire insurance surveys drew every building here — footprints, materials, stories tall.
      </ThemedText>
      {thumb && (
        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(closest.item_url)}
          accessibilityRole="button"
          accessibilityLabel={`Sanborn map of ${closest.place ?? ''}, ${closest.year ?? ''}`}
        >
          <Image
            source={{ uri: thumb.uri }}
            style={{ width: '100%', aspectRatio: thumb.ratio, borderWidth: 1, borderColor: L.rule }}
            resizeMode="contain"
          />
        </Pressable>
      )}
      <Text style={mono(11.5, L.ink)} maxFontSizeMultiplier={1.3}>
        {[
          closest.place?.toUpperCase(),
          closest.year ? String(closest.year) : null,
          closest.sheets ? `${closest.sheets} SHEET${closest.sheets === 1 ? '' : 'S'}` : null,
          aroundYear && closest.year ? `NEAREST TO ${aroundYear}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {editions.map((e, i) => (
          <Pressable
            key={`${e.item_id ?? i}`}
            onPress={() => WebBrowser.openBrowserAsync(e.item_url)}
            hitSlop={6}
            accessibilityRole="link"
            accessibilityLabel={`${e.place ?? 'Edition'} ${e.year ?? ''} on the Library of Congress site`}
          >
            <Text style={mono(11.5, e.item_id === closest.item_id ? L.amber : L.muted)}>
              {e.year ?? '?'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={mono(10, L.muted)} maxFontSizeMultiplier={1.3}>
        LIBRARY OF CONGRESS · SANBORN MAPS COLLECTION
      </Text>
      {/* The survey on today's streets — only where a volunteer has
          georeferenced this edition (OldInsuranceMaps.net); LOC itself
          publishes no georeferencing, and most towns have none. The
          caption says who drew it and that accuracy is not guaranteed. */}
      {overlayEdition?.overlay && (
        <View style={{ marginTop: 12, gap: 8 }}>
          <ThemedText type="small">
            The {overlayEdition.year ?? ''} survey laid over today&rsquo;s streets.
          </ThemedText>
          <SanbornOverlayMap overlay={overlayEdition.overlay} />
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(overlayEdition.overlay!.page_url)}
            hitSlop={6}
            accessibilityRole="link"
            accessibilityLabel="Open this georeferenced map on OldInsuranceMaps.net"
          >
            <Text style={mono(10, L.muted)} maxFontSizeMultiplier={1.3}>
              GEOREFERENCED BY VOLUNTEERS AT OLDINSURANCEMAPS.NET · ACCURACY NOT GUARANTEED ›
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
