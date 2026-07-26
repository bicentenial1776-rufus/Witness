import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import type { ShelfEntry } from '@witness/core/history';
import { treeGenerationSpan, weeklyDigest, type DigestEntry, type WeeklyDigest } from '@witness/core/query';

import { useBroadsheet } from '@/components/broadsheet';
import { ThisWeekBroadsheet, type LivedThroughLine } from '@/components/broadsheet/this-week';
import { Card } from '@/components/card';
import { RecordText } from '@/components/record-text';
import { ThemedText } from '@/components/themed-text';
import { BrandFonts, Letterpress, WideContent } from '@/constants/theme';
import { useActiveTree } from '@/lib/active-tree';
import { getCuriosities, type CuriositySummary } from '@/lib/curiosities-cache';
import { armDigestNotification } from '@/lib/digest-notifications';
import { getEventLibrary } from '@/lib/event-library';
import { getRelationshipMap } from '@/lib/relationship-cache';
import { describeResumePoint, getResumePoint } from '@/lib/resume';
import { getShelf } from '@/lib/shelf-cache';
import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';

const L = Letterpress;

const mono = (size: number, color: string = L.ink) => ({
  fontFamily: BrandFonts.mono.regular,
  fontSize: size,
  color,
});

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const isToday = (d: Date) => startOfDay(d) === startOfDay(new Date());

function anniversaryLine(entry: DigestEntry): string {
  const verb = entry.eventType === 'birth' ? 'Born' : 'Died';
  const when =
    entry.yearsAgo !== null
      ? `${entry.yearsAgo} years ago${entry.year !== null ? ` — ${entry.year}` : ''}`
      : (entry.year?.toString() ?? 'year unknown');
  return `${verb} ${when}`;
}

function heroRecordLine(entry: DigestEntry): string {
  const years =
    entry.birthYear !== null || entry.deathYear !== null
      ? `${entry.birthYear ?? '?'}–${entry.deathYear ?? '?'}`
      : null;
  return [years, entry.placeRaw?.split(',').slice(0, 2).join(',')].filter(Boolean).join(' · ');
}

function resumeAgeLabel(ts: number): string {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / 86_400_000);
  if (days <= 0) return 'Earlier today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function Feed({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 26, borderTopWidth: 1, borderTopColor: L.rule, paddingTop: 12, gap: 10 }}>
      <RecordText eyebrow style={{ color: L.deepAmber }}>
        {eyebrow}
      </RecordText>
      {children}
    </View>
  );
}

/**
 * Home — a vertical feed (docs/phone-ia-design-brief.md §Home; the
 * swipeable-carousel concept is superseded). Featured hero from the digest
 * engine's pick with its cached record-grounded note — never a live call —
 * then the curiosities nudge, On This Day, the stat strip, resume, and the
 * Explore shelf. Nothing here waits on an external API. The broadsheet
 * carrier (web ≥900px) keeps This Week unchanged.
 */
export default function Home() {
  const { trees, activeTree, refresh } = useActiveTree();
  const broadsheet = useBroadsheet();
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());
  const [topNote, setTopNote] = useState<string | null>(null);
  const [heroNote, setHeroNote] = useState<string | null>(null);
  const [livedThrough, setLivedThrough] = useState<LivedThroughLine[]>([]);
  const [curiosities, setCuriosities] = useState<CuriositySummary | null>(null);
  const [shelf, setShelf] = useState<ShelfEntry[] | null>(null);
  const [generations, setGenerations] = useState<number | null>(null);
  const [resume, setResume] = useState<{ path: string; title: string; ts: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Keep next Sunday's digest notification armed with fresh content.
  useEffect(() => {
    if (activeTree) armDigestNotification(activeTree.id).catch(() => {});
  }, [activeTree?.id]);

  // The rolling week, recomputed on focus so the feed moves on at midnight
  // without a relaunch. Notes are read from cache, never generated here —
  // the featured-today job writes them ahead of us.
  useFocusEffect(
    useCallback(() => {
      if (!activeTree) return;
      let cancelled = false;
      (async () => {
        try {
          const relationshipMap = await getRelationshipMap(activeTree.id).catch(
            () => new Map<string, string>(),
          );
          const result = await weeklyDigest(
            supabase,
            activeTree.id,
            new Date(),
            new Set(relationshipMap.keys()),
          );
          if (cancelled) return;
          setRelationships(relationshipMap);
          setDigest(result);

          const top = result.days[0];
          const hero = result.entries[0] ?? result.days[0];
          const noteFor = async (individualId: string) => {
            const { data } = await supabase
              .from('enrichment_cache')
              .select('content')
              .eq('individual_id', individualId)
              .eq('enrichment_type', 'digest_note')
              .maybeSingle();
            return data?.content ?? null;
          };
          if (top) {
            const note = await noteFor(top.individualId);
            if (cancelled) return;
            setTopNote(note);
            if (hero && hero.individualId !== top.individualId) {
              const heroOwn = await noteFor(hero.individualId);
              if (!cancelled) setHeroNote(heroOwn);
            } else {
              setHeroNote(note);
            }
          }

          // Broadsheet margin data: the "while they lived" world events
          // for the featured life.
          if (broadsheet && top) {
            if (top.birthYear !== null) {
              const library = await getEventLibrary();
              const lastYear = top.deathYear ?? top.birthYear + 80;
              const inLife = library.filter(
                (e) => e.startYear >= top.birthYear! && e.startYear <= lastYear,
              );
              const picks = [
                ...inLife.filter((e) => e.tier === 'major'),
                ...inLife.filter((e) => e.tier !== 'major'),
              ]
                .slice(0, 3)
                .sort((a, b) => a.startYear - b.startYear);
              if (!cancelled) {
                setLivedThrough(
                  picks.map((e) => ({
                    eventId: e.id,
                    year: e.startYear,
                    name: e.name,
                    age: e.startYear - top.birthYear!,
                  })),
                );
              }
            }
          }
        } catch {
          // Home stays quiet on digest errors; the digest screen surfaces them.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeTree?.id, broadsheet]),
  );

  // The rest of the feed — each block arrives independently, nothing
  // gates the first paint.
  useFocusEffect(
    useCallback(() => {
      if (!activeTree || broadsheet) return;
      let cancelled = false;
      const treeId = activeTree.id;

      getCuriosities(treeId)
        .then((summary) => {
          if (!cancelled) setCuriosities(summary);
        })
        .catch(() => {});

      getShelf(treeId)
        .then((entries) => {
          if (!cancelled) setShelf(entries);
        })
        .catch(() => {});

      getTreeIndex(treeId)
        .then((index) => {
          if (!cancelled) setGenerations(treeGenerationSpan(index));
        })
        .catch(() => {});

      (async () => {
        const point = await getResumePoint();
        if (!point || cancelled) return;
        const title = await describeResumePoint(point, treeId);
        if (title && !cancelled) setResume({ path: point.path, title, ts: point.ts });
      })().catch(() => {});

      return () => {
        cancelled = true;
      };
    }, [activeTree?.id, broadsheet]),
  );

  // Broadsheet layout (web ≥900px) — This Week, unchanged by the phone feed.
  if (broadsheet && activeTree && digest) {
    return (
      <ThisWeekBroadsheet
        digest={digest}
        relationships={relationships}
        topNote={topNote}
        livedThrough={livedThrough}
        treeId={activeTree.id}
      />
    );
  }

  const hero = digest ? (digest.entries[0] ?? digest.days[0] ?? null) : null;
  const heroRelationship = hero ? relationships.get(hero.individualId) : undefined;
  const onThisDay =
    digest?.days.find((d) => isToday(d.occursOn) && d.individualId !== hero?.individualId) ?? null;
  const dayOfYear = Math.floor(
    (startOfDay(new Date()) - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86_400_000,
  );
  const historicalToday =
    !onThisDay && shelf && shelf.length > 0 ? shelf[dayOfYear % shelf.length] : null;

  return (
    <View style={{ flex: 1, backgroundColor: L.paper }}>
      <ScrollView
        contentContainerStyle={{ ...WideContent, padding: 24, paddingTop: 72, paddingBottom: 48 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <RecordText eyebrow style={{ color: L.amber }}>
            Witness
          </RecordText>
          <Pressable
            onPress={() => router.push('/you')}
            hitSlop={12}
            accessibilityLabel="Your account and trees"
          >
            <SymbolView name="gearshape" size={24} tintColor={L.muted} />
          </Pressable>
        </View>

        {trees === null ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : trees.length === 0 ? (
          <Card onPress={() => router.push('/import-guide')} style={{ marginTop: 16 }}>
            <ThemedText type="subtitle">Bring your family in</ThemedText>
            <ThemedText>
              Your tree lives on Ancestry, FamilySearch, or another platform — Witness will walk
              you through getting it out and bringing it to life.
            </ThemedText>
            <ThemedText type="link">Show me how ›</ThemedText>
          </Card>
        ) : (
          activeTree && (
            <>
              {/* 1 · Featured Today */}
              <Feed eyebrow="Featured today">
                {!digest ? (
                  <Text style={mono(11, L.muted)}>SETTING THE WEEK…</Text>
                ) : !hero ? (
                  <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 17, color: L.ink }}>
                    A quiet week — no dated anniversaries fall in the next seven days.
                  </Text>
                ) : (
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/ancestor/[id]', params: { id: hero.individualId } })
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: L.rule,
                      backgroundColor: '#ffffff',
                      padding: 18,
                      gap: 7,
                      shadowColor: L.ink,
                      shadowOpacity: 0.05,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 2 },
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: BrandFonts.serif.semiBold,
                        fontSize: 26,
                        lineHeight: 32,
                        color: L.ink,
                      }}
                    >
                      {hero.fullName}
                    </Text>
                    <Text style={mono(10.5, L.muted)}>{heroRecordLine(hero).toUpperCase()}</Text>
                    {heroRelationship && (
                      <Text style={mono(10.5, L.deepAmber)}>YOUR {heroRelationship.toUpperCase()}</Text>
                    )}
                    <Text
                      style={{
                        fontFamily: BrandFonts.serif.regular,
                        fontSize: 15.5,
                        lineHeight: 23,
                        color: L.ink,
                        marginTop: 4,
                      }}
                    >
                      {heroNote ??
                        `${anniversaryLine(hero)}${hero.placeRaw ? ` · ${hero.placeRaw.split(',')[0]}` : ''}.`}
                    </Text>
                    <Text style={{ ...mono(10.5, L.amber), marginTop: 4 }}>THEIR FULL STORY ›</Text>
                  </Pressable>
                )}
              </Feed>

              {/* 2 · Curiosities nudge */}
              {curiosities && curiosities.total > 0 && (
                <Pressable
                  onPress={() => router.push('/tree' as never)}
                  style={{
                    marginTop: 18,
                    borderLeftWidth: 2,
                    borderLeftColor: L.amber,
                    paddingLeft: 12,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{ fontFamily: BrandFonts.serif.regular, fontSize: 15.5, lineHeight: 22, color: L.ink }}
                  >
                    {curiosities.lineName
                      ? `${curiosities.total.toLocaleString()} curiosities, most in the ${curiosities.lineName} line — worth a look, nothing urgent.`
                      : `${curiosities.total.toLocaleString()} curiosities in the record — worth a look, nothing urgent.`}
                  </Text>
                </Pressable>
              )}

              {/* 3 · On This Day */}
              {(onThisDay || historicalToday) && (
                <Feed eyebrow="On this day">
                  {onThisDay ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/ancestor/[id]',
                          params: { id: onThisDay.individualId },
                        })
                      }
                    >
                      <Text
                        style={{ fontFamily: BrandFonts.serif.regular, fontSize: 17, lineHeight: 25, color: L.ink }}
                      >
                        {onThisDay.fullName} — {anniversaryLine(onThisDay).toLowerCase()}
                        {onThisDay.placeRaw ? ` · ${onThisDay.placeRaw.split(',')[0]}` : ''}
                      </Text>
                    </Pressable>
                  ) : historicalToday ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/query/[eventId]',
                          params: { eventId: historicalToday.event.id },
                        })
                      }
                    >
                      <Text
                        style={{ fontFamily: BrandFonts.serif.regular, fontSize: 17, lineHeight: 25, color: L.ink }}
                      >
                        {historicalToday.event.name}, {historicalToday.event.startYear} —{' '}
                        {historicalToday.aliveCount.toLocaleString()} of your people were alive for it.
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => activeTree && router.push({ pathname: '/digest', params: { treeId: activeTree.id } })}>
                    <Text style={mono(10.5, L.amber)}>THIS WEEK IN YOUR FAMILY ›</Text>
                  </Pressable>
                </Feed>
              )}

              {/* 4 · Your Tree stat strip */}
              <Feed eyebrow="Your tree">
                <Pressable onPress={() => router.push('/tree' as never)}>
                  <Text style={mono(11.5, L.ink)}>
                    {[
                      `${Number(activeTree.individual_count).toLocaleString()} PEOPLE`,
                      `${Number(activeTree.family_count).toLocaleString()} FAMILIES`,
                      generations !== null ? `${generations} GENERATIONS` : null,
                    ]
                      .filter(Boolean)
                      .join('  ·  ')}
                  </Text>
                </Pressable>
              </Feed>

              {/* 5 · Pick up where you left off */}
              {resume && (
                <Feed eyebrow="Pick up where you left off">
                  <Pressable
                    onPress={() => router.push(resume.path as never)}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
                  >
                    <View style={{ flexShrink: 1, gap: 3 }}>
                      <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 19, color: L.ink }}>
                        {resume.title}
                      </Text>
                      <Text style={mono(10, L.muted)}>{resumeAgeLabel(resume.ts).toUpperCase()}</Text>
                    </View>
                    <Text style={mono(12, L.amber)}>›</Text>
                  </Pressable>
                </Feed>
              )}

              {/* 6 · Explore shelf */}
              {shelf && shelf.length > 0 && (
                <Feed eyebrow="Explore">
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 10, paddingRight: 12 }}
                    style={{ marginHorizontal: -2 }}
                  >
                    {shelf.slice(0, 8).map((entry) => (
                      <Pressable
                        key={entry.event.id}
                        onPress={() =>
                          router.push({ pathname: '/query/[eventId]', params: { eventId: entry.event.id } })
                        }
                        style={{
                          width: 150,
                          borderWidth: 1,
                          borderColor: L.rule,
                          backgroundColor: '#ffffff',
                          padding: 12,
                          gap: 6,
                          justifyContent: 'space-between',
                        }}
                      >
                        <View style={{ gap: 6 }}>
                          <Text style={mono(9.5, L.deepAmber)}>{String(entry.event.startYear)}</Text>
                          <Text
                            numberOfLines={3}
                            style={{ fontFamily: BrandFonts.serif.regular, fontSize: 16, lineHeight: 21, color: L.ink }}
                          >
                            {entry.event.name}
                          </Text>
                        </View>
                        <Text style={mono(9.5, L.muted)}>
                          {entry.aliveCount.toLocaleString()} ALIVE
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => router.push('/library' as never)}
                      style={{
                        width: 110,
                        borderWidth: 1,
                        borderColor: L.deepAmber,
                        borderStyle: 'dashed' as never,
                        padding: 12,
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={mono(10, L.deepAmber)}>THE LIBRARY ›</Text>
                    </Pressable>
                  </ScrollView>
                </Feed>
              )}
            </>
          )
        )}
      </ScrollView>
    </View>
  );
}
