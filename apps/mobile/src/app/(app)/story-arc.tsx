import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { BrandFonts, Letterpress, mono } from '@/constants/theme';
import { useLetterpress } from '@/hooks/use-theme';
import { useActiveTree } from '@/lib/active-tree';
import { getTodayArc, type ArcGeneration, type StoryArc } from '@/lib/story-arc';


const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

/** "1807-05-25" → "MAY 25, 1807" — the paper card's dateline. */
function paperDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : String(y ?? iso);
}

/**
 * One generation of the descent. The header calls out the kinship —
 * "Joseph Buswell, your 6th great-grandfather" — and the prose is the
 * story. Everything else (record fact line, world chips, and the
 * "Their world, further" sources: era facts, a period newspaper page,
 * an era recording) lives behind ONE DETAILS toggle, so the reveal
 * gesture stays single and the telling keeps its flow (Rufus,
 * 2026-08-25).
 */
function GenerationBlock({ g, index }: { g: ArcGeneration; index: number }) {
  const L = useLetterpress();
  const [open, setOpen] = useState(false);
  const further = Boolean(g.worldFacts?.length || g.paper || g.audio || g.scene);
  const hasDetails = Boolean(g.factLine || g.world.length > 0 || further);
  return (
    <View
      style={{
        marginTop: 18,
        paddingLeft: 14,
        borderLeftWidth: 2,
        borderLeftColor: L.amber,
      }}
    >
      <Pressable
        disabled={g.living}
        onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: g.personId } })}
      >
        <Text
          style={{
            fontFamily: BrandFonts.serif.semiBold,
            fontSize: 20,
            lineHeight: 27,
            color: L.ink,
          }}
        >
          <Text style={mono(12.5, L.deepAmber)}>{ROMAN[index] ?? String(index + 1)}{'  '}</Text>
          {g.name}
          {g.relationLabel ? (
            <Text
              style={{
                fontFamily: BrandFonts.serif.italic,
                fontStyle: 'italic',
                fontWeight: '400',
                fontSize: 17,
                color: L.muted,
              }}
            >
              {`, your ${g.relationLabel}`}
            </Text>
          ) : null}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 14, marginTop: 3 }}>
        <Text style={mono(12.5, L.muted)}>
          {g.living ? `b. ${g.birth ?? '?'}` : `${g.birth ?? '?'}–${g.death ?? '?'}`}
        </Text>
        {hasDetails && (
          <Pressable
            onPress={() => setOpen((o) => !o)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? `Hide details for ${g.name}` : `Show details for ${g.name}`}
          >
            <Text style={mono(12.5, L.amber)}>{open ? 'DETAILS ▴' : 'DETAILS ▾'}</Text>
          </Pressable>
        )}
      </View>
      {open && (
        <View style={{ marginTop: 8, gap: 8 }}>
          {g.factLine && (
            <Text style={mono(12.5, L.deepAmber)}>{g.factLine.toUpperCase()}</Text>
          )}
          {g.world.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Text style={{ ...mono(12, L.muted), letterSpacing: 1.5, alignSelf: 'center' }}>
                THE WORLD
              </Text>
              {g.world.map((w) => (
                <View
                  key={w}
                  style={{
                    borderWidth: 1,
                    borderColor: L.rule,
                    backgroundColor: L.well,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={mono(12.5, L.ink)}>{w}</Text>
                </View>
              ))}
            </View>
          )}
          {further && (
            <View
              style={{
                borderWidth: 1,
                borderColor: L.rule,
                backgroundColor: L.well,
                padding: 12,
                gap: 10,
                marginTop: 2,
              }}
            >
              <Text style={{ ...mono(11, L.amber), letterSpacing: 2 }}>THEIR WORLD, FURTHER</Text>
              {(g.worldFacts ?? []).map((f, fi) => (
                <View key={fi} style={{ gap: 2 }}>
                  <Text
                    style={{
                      fontFamily: BrandFonts.serif.regular,
                      fontSize: 14,
                      lineHeight: 21,
                      color: L.ink,
                    }}
                  >
                    <Text style={{ color: L.amber }}>{'⊕ '}</Text>
                    {f.text}
                  </Text>
                  <Text style={mono(10.5, L.muted)}>— {f.source.toUpperCase()}</Text>
                </View>
              ))}
              {g.audio && (
                <Pressable
                  onPress={() => WebBrowser.openBrowserAsync(g.audio!.url)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${g.audio.title}`}
                  style={{ gap: 2 }}
                >
                  <Text style={mono(12.5, L.amber)}>▸ HEAR THE ERA</Text>
                  <Text
                    style={{ fontFamily: BrandFonts.serif.regular, fontSize: 13.5, color: L.ink }}
                  >
                    {g.audio.title}
                  </Text>
                  <Text style={mono(10.5, L.muted)}>WIKIMEDIA COMMONS · PUBLIC DOMAIN</Text>
                </Pressable>
              )}
              {g.scene && (
                <Pressable
                  onPress={() => WebBrowser.openBrowserAsync(g.scene!.url)}
                  accessibilityRole="button"
                  accessibilityLabel={`See the place: ${g.scene.title}`}
                  style={{ gap: 6 }}
                >
                  <Text style={mono(12.5, L.amber)}>SEE THE PLACE</Text>
                  <Image
                    source={{ uri: g.scene.image }}
                    style={{ width: '100%', height: 150, borderWidth: 1, borderColor: L.rule }}
                    resizeMode="cover"
                  />
                  <Text
                    style={{ fontFamily: BrandFonts.serif.regular, fontSize: 13.5, color: L.ink }}
                  >
                    {g.scene.title}
                    {g.scene.date ? ` · ${g.scene.date}` : ''}
                  </Text>
                  <Text style={mono(10.5, L.muted)}>{g.scene.provider.toUpperCase()} · VIA DPLA</Text>
                </Pressable>
              )}
              {g.paper && (
                <Pressable
                  onPress={() => WebBrowser.openBrowserAsync(g.paper!.imageFull ?? g.paper!.url)}
                  accessibilityRole="button"
                  accessibilityLabel={`Read the full page of ${g.paper.title}`}
                  style={{ flexDirection: 'row', gap: 10 }}
                >
                  <Image
                    source={{ uri: g.paper.image }}
                    style={{ width: 74, height: 112, borderWidth: 1, borderColor: L.rule }}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        fontFamily: BrandFonts.serif.semiBold,
                        fontSize: 14,
                        lineHeight: 19,
                        color: L.ink,
                      }}
                    >
                      {g.paper.title}
                    </Text>
                    <Text style={mono(11, L.muted)}>
                      {paperDate(g.paper.date)}
                      {/* Common town names match far beyond the town; a
                          six-figure count is noise, not a fact. */}
                      {g.paper.hits > 1 && g.paper.hits < 50_000
                        ? `\nONE OF ${g.paper.hits.toLocaleString()} PAGES NAMING THEIR TOWN`
                        : ''}
                    </Text>
                    <Text style={{ ...mono(11.5, L.amber), marginTop: 2 }}>READ THE FULL PAGE ›</Text>
                  </View>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
      {g.story && (
        <Text
          style={{
            fontFamily: BrandFonts.serif.regular,
            fontSize: 15.5,
            lineHeight: 23,
            color: L.ink,
            marginTop: 6,
          }}
        >
          {g.story}
        </Text>
      )}
    </View>
  );
}

/**
 * The Story Arc — one founder-to-you descent, today's line from the daily
 * rotation. The record's names and dates are laid down server-side; the
 * model wrote only the connective prose and the world chips. The lifespan
 * graphic at the top is the argument: this many centuries, no gap.
 */
export default function StoryArcScreen() {
  const L = useLetterpress();
  const { activeTree } = useActiveTree();
  const [arc, setArc] = useState<StoryArc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTree) return;
    let cancelled = false;
    getTodayArc(activeTree.id)
      .then((a) => {
        if (!cancelled) setArc(a);
      })
      .catch(() => {
        if (!cancelled) setError('The story could not be set just now — nothing has been lost.');
      });
    return () => {
      cancelled = true;
    };
  }, [activeTree?.id]);

  const currentYear = new Date().getFullYear();
  const lives = useMemo(() => {
    if (!arc) return null;
    const dated = arc.generations.filter((g) => g.birth !== null);
    if (dated.length < 2) return null;
    const start = Math.min(...dated.map((g) => g.birth!));
    const span = Math.max(currentYear - start, 1);
    return { start, span };
  }, [arc, currentYear]);

  return (
    <View style={{ flex: 1, backgroundColor: L.paper }}>
      <Stack.Screen options={{ title: "Today's Line" }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {error !== null && (
          <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 16, color: L.ink, marginTop: 24 }}>
            {error}
          </Text>
        )}
        {arc === null && error === null && (
          <View style={{ gap: 10, marginTop: 40, alignItems: 'center' }}>
            <ActivityIndicator />
            <Text style={mono(13, L.muted)}>SETTING TODAY'S STORY — A FIRST TELLING TAKES A MINUTE</Text>
          </View>
        )}

        {arc && (
          <>
            <Text style={mono(13, L.deepAmber)}>
              A GENERATIONAL STORY · ONE OF YOUR FAMILY'S RECORDED LINES
            </Text>
            <Text
              style={{
                fontFamily: BrandFonts.serif.semiBold,
                fontSize: 30,
                lineHeight: 36,
                color: L.ink,
                marginTop: 6,
              }}
            >
              {arc.title}
            </Text>
            <Text
              style={{
                fontFamily: BrandFonts.serif.regular,
                fontSize: 15.5,
                lineHeight: 23,
                color: L.muted,
                marginTop: 6,
              }}
            >
              {arc.dek}
            </Text>

            {/* The lives, tiled on one axis. */}
            {lives && (
              <View
                style={{
                  marginTop: 18,
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: L.rule,
                  paddingVertical: 12,
                  gap: 4,
                }}
              >
                {arc.generations.map((g) => {
                  // Every generation gets a bar, the reader included — a
                  // living row with no recorded birth becomes a sliver at
                  // the right edge rather than vanishing.
                  const noBirth = g.birth === null;
                  if (noBirth && !g.living) return null;
                  const birth = g.birth ?? currentYear - 8;
                  const end = g.living ? currentYear : (g.death ?? Math.min(birth + 1, currentYear));
                  const left = ((birth - lives.start) / lives.span) * 100;
                  const width = Math.max(((end - birth) / lives.span) * 100, 1.5);
                  const surname = (g.name.trim().split(/[\s,]+/).filter(Boolean).pop() ?? '?').toUpperCase();
                  const label = noBirth
                    ? `${surname} · YOU`
                    : g.living
                      ? `${surname} b. ${g.birth}`
                      : `${surname} ${g.birth}–${g.death ?? '?'}`;
                  const labelInside = width > 40;
                  return (
                    <View key={g.personId} style={{ height: 15 }}>
                      <View
                        style={{
                          position: 'absolute',
                          left: `${left}%`,
                          width: `${width}%`,
                          top: 0,
                          bottom: 0,
                          backgroundColor: g.living ? L.amber : L.ink,
                        }}
                      />
                      <Text
                        numberOfLines={1} maxFontSizeMultiplier={1.3}
                        style={{
                          ...mono(11, labelInside ? L.paper : L.muted),
                          position: 'absolute',
                          ...(labelInside || left + width < 55
                            ? { left: labelInside ? `${left}%` : `${Math.min(left + width, 62)}%`, paddingLeft: 4 }
                            : { right: `${Math.min(100 - left, 62)}%`, paddingRight: 4 }),
                          top: 2,
                          letterSpacing: 0.6,
                        }}
                      >
                        {label}
                      </Text>
                    </View>
                  );
                })}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={mono(12.5, L.muted)}>{lives.start}</Text>
                  <Text style={mono(12.5, L.muted)}>TODAY</Text>
                </View>
              </View>
            )}

            {/* The descent. */}
            <View style={{ marginTop: 10 }}>
              {arc.generations.map((g, i) => (
                <GenerationBlock key={g.personId} g={g} index={i} />
              ))}
            </View>

            <Text style={{ ...mono(12.5, L.muted), marginTop: 26, lineHeight: 15 }}>
              EVERY NAME, DATE, PLACE, AND MARRIAGE IS FROM YOUR TREE'S RECORD. THE CONNECTING PROSE
              AND WORLD EVENTS ARE WRITTEN FROM IT — GENERAL HISTORY APPEARS ONLY WHERE THE RECORD'S
              TIME AND PLACE SUPPORT IT. A NEW LINE TAKES THE LEAD EACH DAY.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
