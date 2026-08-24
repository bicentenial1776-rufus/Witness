import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { BrandFonts, Letterpress, mono } from '@/constants/theme';
import { useActiveTree } from '@/lib/active-tree';
import { getTodayArc, type StoryArc } from '@/lib/story-arc';

const L = Letterpress;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

/**
 * The Story Arc — one founder-to-you descent, today's line from the daily
 * rotation. The record's names and dates are laid down server-side; the
 * model wrote only the connective prose and the world chips. The lifespan
 * graphic at the top is the argument: this many centuries, no gap.
 */
export default function StoryArcScreen() {
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
                  if (g.birth === null) return null;
                  const end = g.living ? currentYear : (g.death ?? Math.min(g.birth + 1, currentYear));
                  const left = ((g.birth - lives.start) / lives.span) * 100;
                  const width = Math.max(((end - g.birth) / lives.span) * 100, 1.5);
                  const given = g.name.split(' ')[0].toUpperCase();
                  const labelInside = width > 22;
                  return (
                    <View key={g.personId} style={{ height: 14 }}>
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
                          ...mono(12, labelInside ? L.paper : L.muted),
                          position: 'absolute',
                          left: labelInside ? `${left}%` : `${Math.min(left + width, 88)}%`,
                          paddingLeft: 4,
                          top: 1.5,
                          letterSpacing: 1,
                        }}
                      >
                        {given}
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
                <View
                  key={g.personId}
                  style={{
                    marginTop: 18,
                    paddingLeft: 14,
                    borderLeftWidth: 2,
                    borderLeftColor: L.amber,
                  }}
                >
                  <Text style={mono(12.5, L.deepAmber)}>
                    {ROMAN[i] ?? String(i + 1)}
                    {g.relationLabel ? ` · YOUR ${g.relationLabel.toUpperCase()}` : ''}
                  </Text>
                  <Pressable
                    disabled={g.living}
                    onPress={() =>
                      router.push({ pathname: '/ancestor/[id]', params: { id: g.personId } })
                    }
                  >
                    <Text
                      style={{
                        fontFamily: BrandFonts.serif.semiBold,
                        fontSize: 20,
                        color: L.ink,
                        marginTop: 2,
                      }}
                    >
                      {g.name}
                      <Text style={mono(13, L.muted)}>
                        {'  '}
                        {g.living ? `b. ${g.birth ?? '?'}` : `${g.birth ?? '?'}–${g.death ?? '?'}`}
                      </Text>
                    </Text>
                  </Pressable>
                  {g.factLine && (
                    <Text style={{ ...mono(12.5, L.deepAmber), marginTop: 3 }}>
                      {g.factLine.toUpperCase()}
                    </Text>
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
                  {g.world.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      <Text style={{ ...mono(12, L.muted), letterSpacing: 1.5, alignSelf: 'center' }}>
                        THE WORLD
                      </Text>
                      {g.world.map((w) => (
                        <View
                          key={w}
                          style={{
                            borderWidth: 1,
                            borderColor: L.rule,
                            backgroundColor: '#f4efe6',
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                          }}
                        >
                          <Text style={mono(12.5, L.ink)}>{w}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
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
