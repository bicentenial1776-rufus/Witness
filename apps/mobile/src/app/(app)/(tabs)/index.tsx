import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import type { ShelfEntry } from '@witness/core/history';
import {
  fromMigrationPath,
  fromOceanCrossing,
  issueOf,
  pickWeekly,
  type Finding,
} from '@witness/core/findings';
import {
  fetchNaraCounts,
  migrationPaths,
  oceanCrossings,
  treeGenerationSpan,
  weeklyDigest,
  type DigestEntry,
  type NaraCounts,
  type WeeklyDigest,
} from '@witness/core/query';

import { Masthead, PageShell, useBroadsheet } from '@/components/broadsheet';
import { Card } from '@/components/card';
import { RecordText } from '@/components/record-text';
import { ThemedText } from '@/components/themed-text';
import { BrandFonts, Letterpress, WideContent, mono } from '@/constants/theme';
import { useLetterpress } from '@/hooks/use-theme';
import { useActiveTree } from '@/lib/active-tree';
import { getCuriosities, type CuriositySummary } from '@/lib/curiosities-cache';
import { recordEditionPieces } from '@/lib/edition-ledger';
import { getGeographyIndex } from '@/lib/geography-cache';
import { layIssueTrail, openTrailPiece, type TrailPiece } from '@/lib/issue-trail';
import { armDigestNotification } from '@/lib/digest-notifications';
import { getFeaturedIds, getRelationshipMap } from '@/lib/relationship-cache';
import { usePurchases } from '@/lib/purchases';
import { describeResumePoint, getResumePoint } from '@/lib/resume';
import { getShelf } from '@/lib/shelf-cache';
import { getTodayArc, type StoryArc } from '@/lib/story-arc';
import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';


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
  const L = useLetterpress();
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
 * Home — this week's issue (docs/cohesion-design-brief.md, Approach B on
 * A's plumbing; supersedes the plain feed of the phone-IA brief). One
 * edition per ISO week, the same on every device: a lead story from the
 * digest engine's pick with its cached record-grounded note — never a live
 * call — then each desk files ONE piece: the Tree Check a single curiosity,
 * the Archives its waiting count, the pattern engines one crossing or move.
 * Rationing is the point — one is inviting where 443 is oppressive. On This
 * Day, the stat strip, resume, and the Explore shelf carry on below as the
 * standing furniture. Nothing here waits on an external API. The broadsheet
 * carrier (web ≥900px) runs the same issue under a masthead.
 */
export default function Home() {
  const L = useLetterpress();
  const { trees, activeTree, refresh } = useActiveTree();
  const broadsheet = useBroadsheet();
  const { subscription } = usePurchases();
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [relationships, setRelationships] = useState<Map<string, string>>(new Map());
  const [heroNote, setHeroNote] = useState<string | null>(null);
  const [curiosities, setCuriosities] = useState<CuriositySummary | null>(null);
  const [naraCounts, setNaraCounts] = useState<NaraCounts | null>(null);
  // The pattern piece keeps its precise destination alongside the finding:
  // a crossing lands on the crosser, a migration on its own path screen. A
  // sentence about Michael Howe must land on Michael Howe, not on a menu.
  const [pattern, setPattern] = useState<{
    finding: Finding;
    destination: { pathname: string; params: Record<string, string> };
  } | null>(null);
  const [shelf, setShelf] = useState<ShelfEntry[] | null>(null);
  // Today's story arc leads the edition; the anniversary hero is the
  // fallback when the arc can't be told (no entitlement, thin tree, net).
  const [arc, setArc] = useState<StoryArc | 'loading' | 'failed'>('loading');
  const [generations, setGenerations] = useState<number | null>(null);
  const [resume, setResume] = useState<{ path: string; title: string; ts: number } | null>(null);

  // The edition — same all week, everywhere; the seed for the desks' picks.
  const issue = issueOf(new Date());

  // Today's line: cached after its first telling, so this is one cheap
  // function round-trip on every Home visit after the first of the day.
  useEffect(() => {
    if (!activeTree) return;
    let cancelled = false;
    setArc('loading');
    getTodayArc(activeTree.id)
      .then((a) => {
        if (!cancelled) setArc(a);
      })
      .catch(() => {
        if (!cancelled) setArc('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [activeTree?.id]);

  // The ledger's write path: record what this edition printed, once the
  // desks have picked. Fire-and-forget — a failed write costs a back
  // issue, never the front page. The same pass lays the issue trail, so
  // the Portrait can offer "next in this issue" (audit G1).
  useEffect(() => {
    if (!activeTree) return;
    const pieces: { finding: Finding; section: string }[] = [];
    const weekly = curiosities ? pickWeekly(curiosities.top, `${issue.key}:tree-check`) : null;
    if (weekly) {
      pieces.push({
        finding: {
          id: `tree-health:${weekly.key}`,
          source: 'tree-health',
          subjectIds: [weekly.individualId],
          sentence: weekly.prompt,
        },
        section: 'tree-check',
      });
    }
    if (pattern) pieces.push({ finding: pattern.finding, section: 'pattern' });
    recordEditionPieces(activeTree.id, issue.key, pieces);

    const hero = digest ? (digest.entries[0] ?? digest.days[0] ?? null) : null;
    const trail: TrailPiece[] = [];
    if (hero) {
      trail.push({
        key: 'lead',
        label: 'THE LEAD',
        destination: { pathname: '/ancestor/[id]', params: { id: hero.individualId } },
      });
    }
    if (weekly) {
      trail.push({
        key: 'tree-check',
        label: 'THE TREE CHECK',
        destination: { pathname: '/ancestor/[id]', params: { id: weekly.individualId } },
      });
    }
    if (naraCounts && naraCounts.pending > 0) {
      trail.push({
        key: 'archives',
        label: 'THE ARCHIVES',
        destination: { pathname: '/archives', params: { treeId: activeTree.id } },
      });
    }
    if (pattern) {
      trail.push({ key: 'pattern', label: 'THE PATTERN', destination: pattern.destination });
    }
    layIssueTrail(issue.number, trail);
  }, [activeTree?.id, issue.key, issue.number, curiosities, pattern, digest, naraCounts]);

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
          const featuredIds = await getFeaturedIds(activeTree.id).catch(() => new Set<string>());
          const result = await weeklyDigest(supabase, activeTree.id, new Date(), featuredIds);
          if (cancelled) return;
          setRelationships(relationshipMap);
          setDigest(result);

          const hero = result.entries[0] ?? result.days[0];
          if (hero) {
            const { data } = await supabase
              .from('enrichment_cache')
              .select('content')
              .eq('individual_id', hero.individualId)
              .eq('enrichment_type', 'digest_note')
              .maybeSingle();
            if (!cancelled) setHeroNote(data?.content ?? null);
          }
        } catch {
          // Home stays quiet on digest errors; the digest screen surfaces them.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeTree?.id]),
  );

  // The rest of the feed — each block arrives independently, nothing
  // gates the first paint.
  useFocusEffect(
    useCallback(() => {
      if (!activeTree) return;
      let cancelled = false;
      const treeId = activeTree.id;

      getCuriosities(treeId)
        .then((summary) => {
          if (!cancelled) setCuriosities(summary);
        })
        .catch(() => {});

      fetchNaraCounts(supabase, treeId)
        .then((counts) => {
          if (!cancelled) setNaraCounts(counts);
        })
        .catch(() => {});

      // The pattern desk: one crossing or one migration, picked for the
      // week from the cached geography index — cheap, deterministic, and
      // the same story until Monday.
      getGeographyIndex(treeId)
        .then((index) => {
          if (cancelled) return;
          const crossingStory = (crossing: (typeof crossings)[number]) => ({
            finding: fromOceanCrossing(crossing),
            destination: {
              pathname: '/ancestor/[id]',
              params: { id: crossing.individual.id },
            },
          });
          const crossings = [
            ...oceanCrossings(index, 'atlantic'),
            ...oceanCrossings(index, 'pacific'),
          ];
          const stories = [
            ...crossings.map(crossingStory),
            ...migrationPaths(index).map((path) => ({
              finding: fromMigrationPath(path),
              destination: {
                pathname: '/migration',
                params: { treeId, from: path.from, to: path.to },
              },
            })),
          ];
          setPattern(pickWeekly(stories, `${issue.key}:pattern`));
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
    }, [activeTree?.id]),
  );

  const hero = digest ? (digest.entries[0] ?? digest.days[0] ?? null) : null;
  const heroRelationship = hero ? relationships.get(hero.individualId) : undefined;
  const onThisDay =
    digest?.days.find((d) => isToday(d.occursOn) && d.individualId !== hero?.individualId) ?? null;
  const dayOfYear = Math.floor(
    (startOfDay(new Date()) - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86_400_000,
  );
  const historicalToday =
    !onThisDay && shelf && shelf.length > 0 ? shelf[dayOfYear % shelf.length] : null;

  // The paywall's Day-5 promise ("we'll remind you before your trial ends")
  // rode entirely on a notification permission the reader may have declined.
  // The issue itself is the backstop: for the trial's last two days, say it
  // plainly, on paper — a user-protective notice, not a conversion nudge.
  const trialEndsAt =
    subscription?.isTrial && subscription.willRenew && subscription.expiresAt
      ? new Date(subscription.expiresAt)
      : null;
  const trialEndsSoon =
    trialEndsAt !== null &&
    trialEndsAt.getTime() > Date.now() &&
    trialEndsAt.getTime() - Date.now() <= 2 * 86_400_000;

  const feedBody =
    trees === null ? (
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
              {/* 0 · The edition dateline — phone only; the broadsheet's
                  masthead already carries the edition number. */}
              {!broadsheet && (
                <Text style={{ ...mono(13, L.muted), marginTop: 20, letterSpacing: 1.4 }}>
                  {`NO. ${issue.number} · ${issue.weekOfLabel.toUpperCase()}`}
                </Text>
              )}

              {/* First-week candor (audit gap G5): the hero's note is written
                  by a daily job, archive matches by a scheduled worker, map
                  pins by the geocoder — a brand-new tree's issue runs thin
                  for reasons the reader can't see. Say so. A refreshed tree
                  inherits its history and skips the apology. */}
              {!activeTree.refreshed_from &&
                Date.now() - new Date(activeTree.imported_at).getTime() < 7 * 86_400_000 && (
                  <Text
                    style={{
                      fontFamily: BrandFonts.serif.regular,
                      fontStyle: 'italic',
                      fontSize: 14.5,
                      lineHeight: 21,
                      color: L.muted,
                      marginTop: 10,
                    }}
                  >
                    Your first issues run thin — the presses are still warming. Richer notes,
                    archive matches, and map pins arrive over the coming days.
                  </Text>
                )}

              {trialEndsSoon && trialEndsAt && (
                <Pressable onPress={() => router.push('/you')}>
                  <Text
                    style={{
                      fontFamily: BrandFonts.serif.regular,
                      fontStyle: 'italic',
                      fontSize: 14.5,
                      lineHeight: 21,
                      color: L.ink,
                      marginTop: 10,
                    }}
                  >
                    {`Your free trial ends ${trialEndsAt.toLocaleDateString(undefined, { weekday: 'long' })} — the subscription starts then unless you cancel. `}
                    <Text style={{ color: L.deepAmber }}>Your subscription ›</Text>
                  </Text>
                </Pressable>
              )}

              {/* 1 · The lead — today's story arc: one recorded line,
                  founder to reader, a new one each day. The anniversary
                  hero remains the fallback when the arc can't be told. */}
              <Feed eyebrow="The lead">
                {typeof arc === 'object' ? (
                  <Pressable
                    onPress={() => {
                      openTrailPiece('lead');
                      router.push('/story-arc' as never);
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: L.rule,
                      backgroundColor: L.raised,
                      padding: 18,
                      gap: 7,
                      shadowColor: L.ink,
                      shadowOpacity: 0.05,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 2 },
                    }}
                  >
                    <Text style={mono(13, L.deepAmber)}>A GENERATIONAL STORY · TODAY'S LINE</Text>
                    <Text
                      style={{
                        fontFamily: BrandFonts.serif.semiBold,
                        fontSize: 26,
                        lineHeight: 32,
                        color: L.ink,
                      }}
                    >
                      {arc.title}
                    </Text>
                    <Text style={mono(13, L.muted)}>
                      {`${arc.generations.length} GENERATIONS · ${arc.generations[0]?.birth ?? '?'}–TODAY`}
                      {arc.generations[0]?.relationLabel
                        ? ` · FROM YOUR ${arc.generations[0].relationLabel.toUpperCase()}`
                        : ''}
                    </Text>
                    <Text
                      style={{
                        fontFamily: BrandFonts.serif.regular,
                        fontSize: 15.5,
                        lineHeight: 23,
                        color: L.ink,
                        marginTop: 4,
                      }}
                    >
                      {arc.dek}
                    </Text>
                    <Text style={{ ...mono(13, L.amber), marginTop: 4 }}>READ THE LINE ›</Text>
                  </Pressable>
                ) : arc === 'loading' ? (
                  <Text style={mono(13.5, L.muted)}>SETTING TODAY'S STORY…</Text>
                ) : !digest ? (
                  <Text style={mono(13.5, L.muted)}>SETTING THE WEEK…</Text>
                ) : !hero ? (
                  <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 17, color: L.ink }}>
                    A quiet week — no dated anniversaries fall in the next seven days.
                  </Text>
                ) : (
                  <Pressable
                    onPress={() => {
                      openTrailPiece('lead');
                      router.push({ pathname: '/ancestor/[id]', params: { id: hero.individualId } });
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: L.rule,
                      backgroundColor: L.raised,
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
                    <Text style={mono(13, L.muted)}>{heroRecordLine(hero).toUpperCase()}</Text>
                    {heroRelationship && (
                      <Text style={mono(13, L.deepAmber)}>YOUR {heroRelationship.toUpperCase()}</Text>
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
                    <Text style={{ ...mono(13, L.amber), marginTop: 4 }}>THEIR FULL STORY ›</Text>
                  </Pressable>
                )}
              </Feed>

              {/* 2 · From the Tree Check — the desk files ONE curiosity a
                  week, the count is a footnote. One is inviting; 443 is a
                  chore list (cohesion brief, Approach B). The prompt lands
                  on the person it names — their Portrait carries the same
                  finding — and only the footnote opens the full workbench. */}
              {curiosities && curiosities.total > 0 && (() => {
                const weekly = pickWeekly(curiosities.top, `${issue.key}:tree-check`);
                return (
                  <Feed eyebrow="From the Tree Check">
                    <View
                      style={{
                        borderLeftWidth: 2,
                        borderLeftColor: L.amber,
                        paddingLeft: 12,
                        paddingVertical: 2,
                        gap: 5,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          if (weekly) {
                            openTrailPiece('tree-check');
                            router.push({
                              pathname: '/ancestor/[id]',
                              params: { id: weekly.individualId },
                            });
                          } else {
                            router.push('/tree-health' as never);
                          }
                        }}
                      >
                        <Text
                          style={{ fontFamily: BrandFonts.serif.regular, fontSize: 15.5, lineHeight: 22, color: L.ink }}
                        >
                          {weekly
                            ? weekly.prompt
                            : `${curiosities.total.toLocaleString()} curiosities in the record — worth a look, nothing urgent.`}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => router.push('/tree-health' as never)} hitSlop={6}>
                        <Text style={mono(13, L.muted)}>
                          {`THIS WEEK'S CURIOSITY · ${curiosities.total.toLocaleString()} OPEN${
                            curiosities.lineName ? ` · MOST IN THE ${curiosities.lineName.toUpperCase()} LINE` : ''
                          } ›`}
                        </Text>
                      </Pressable>
                    </View>
                  </Feed>
                );
              })()}

              {/* 3 · From the Archives — the waiting count, one line. */}
              {naraCounts && naraCounts.pending > 0 && (
                <Feed eyebrow="From the Archives">
                  <Pressable
                    onPress={() => {
                      openTrailPiece('archives');
                      router.push({ pathname: '/archives', params: { treeId: activeTree.id } });
                    }}
                  >
                    <Text
                      style={{ fontFamily: BrandFonts.serif.regular, fontSize: 15.5, lineHeight: 22, color: L.ink }}
                    >
                      {naraCounts.pending === 1
                        ? 'One federal record awaits your judgment — a match the Archives cannot decide without you.'
                        : `${naraCounts.pending} federal records await your judgment — matches the Archives cannot decide without you.`}
                    </Text>
                    <Text style={{ ...mono(13, L.amber), marginTop: 4 }}>TO THE ARCHIVES ›</Text>
                  </Pressable>
                </Feed>
              )}

              {/* 4 · The pattern — one crossing or move, this week's pick.
                  The sentence lands where it points; the footnote is the menu. */}
              {pattern && (
                <Feed eyebrow="The pattern">
                  <Pressable
                    onPress={() => {
                      openTrailPiece('pattern');
                      router.push(pattern.destination as never);
                    }}
                  >
                    <Text
                      style={{ fontFamily: BrandFonts.serif.regular, fontSize: 15.5, lineHeight: 22, color: L.ink }}
                    >
                      {pattern.finding.sentence}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/patterns', params: { treeId: activeTree.id } })
                    }
                    hitSlop={6}
                  >
                    <Text style={mono(13, L.amber)}>MORE PATTERNS ›</Text>
                  </Pressable>
                </Feed>
              )}

              {/* 5 · On This Day */}
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
                          params: { eventId: historicalToday.event.id, treeId: activeTree.id },
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
                    <Text style={mono(13, L.amber)}>THIS WEEK IN YOUR FAMILY ›</Text>
                  </Pressable>
                </Feed>
              )}

              {/* 6 · Your Tree stat strip */}
              <Feed eyebrow="Your tree">
                <Pressable onPress={() => router.push('/tree' as never)}>
                  <Text style={mono(13.5, L.ink)}>
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

              {/* 7 · Pick up where you left off */}
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
                      <Text style={mono(13, L.muted)}>{resumeAgeLabel(resume.ts).toUpperCase()}</Text>
                    </View>
                    <Text style={mono(13, L.amber)}>›</Text>
                  </Pressable>
                </Feed>
              )}

              {/* 8 · Explore shelf */}
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
                          router.push({
                            pathname: '/query/[eventId]',
                            params: { eventId: entry.event.id, treeId: activeTree.id },
                          })
                        }
                        style={{
                          width: 150,
                          borderWidth: 1,
                          borderColor: L.rule,
                          backgroundColor: L.raised,
                          padding: 12,
                          gap: 6,
                          justifyContent: 'space-between',
                        }}
                      >
                        <View style={{ gap: 6 }}>
                          <Text style={mono(12.5, L.deepAmber)}>{String(entry.event.startYear)}</Text>
                          <Text
                            numberOfLines={3}
                            style={{ fontFamily: BrandFonts.serif.regular, fontSize: 16, lineHeight: 21, color: L.ink }}
                          >
                            {entry.event.name}
                          </Text>
                        </View>
                        <Text style={mono(12.5, L.muted)}>
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
                      <Text style={mono(13, L.deepAmber)}>THE LIBRARY ›</Text>
                    </Pressable>
                  </ScrollView>
                </Feed>
              )}
            </>
          )
        );

  // Broadsheet carrier (web ≥900px): the same feed at a readable measure
  // under a masthead — the rail carries the wordmark and Account.
  if (broadsheet) {
    return (
      <PageShell
        masthead={
          <Masthead
            title="Home"
            metaMono={`NO. ${issue.number} · ${new Date()
              .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              .toUpperCase()}`}
            metaCaption={activeTree?.name}
          />
        }
      >
        <View style={{ maxWidth: 680 }}>{feedBody}</View>
      </PageShell>
    );
  }

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

        {feedBody}
      </ScrollView>
    </View>
  );
}
