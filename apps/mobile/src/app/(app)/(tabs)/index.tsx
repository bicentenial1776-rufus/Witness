import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import type { ShelfEntry } from '@witness/core/history';
import { dailyIssueOf, pickWeekly } from '@witness/core/findings';
import {
  buildFamilyStages,
  fetchNaraCandidatesForTree,
  fetchNaraCounts,
  weeklyDigest,
  type DigestEntry,
  type FamilyStage,
  type NaraCandidate,
  type NaraCounts,
  type WeeklyDigest,
} from '@witness/core/query';

import { Masthead, PageShell, useBroadsheet } from '@/components/broadsheet';
import { Card } from '@/components/card';
import { KinReveal } from '@/components/kin-reveal';
import { NaraCandidateCard } from '@/components/nara-candidate-card';
import { RecordText } from '@/components/record-text';
import { ThemedText } from '@/components/themed-text';
import { BrandFonts, WideContent, mono } from '@/constants/theme';
import { useLetterpress } from '@/hooks/use-theme';
import { useActiveTree } from '@/lib/active-tree';
import { layIssueTrail, openTrailPiece, type TrailPiece } from '@/lib/issue-trail';
import { armDigestNotification } from '@/lib/digest-notifications';
import { getFeaturedIds, getKinMap, type Kin } from '@/lib/relationship-cache';
import { usePurchases } from '@/lib/purchases';
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

/** The ancestor-of-the-day pick, hydrated. */
interface DailyAncestor {
  id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
}

function ancestorRecordLine(person: DailyAncestor): string {
  return person.birth_year !== null || person.death_year !== null
    ? `${person.birth_year ?? '?'}–${person.death_year ?? '?'}`
    : '';
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
 * Home — the daily reading (2026-08-27 redesign; supersedes the weekly
 * issue while keeping its spine). One issue per calendar day, numbered by
 * day of year, the same on every device, and exactly five modules in this
 * order: On this day · Ancestor of the day · A generational story · The
 * family graph of the day · The National Archives. Every pick is
 * date-seeded and deterministic (pickWeekly over the daily key), nothing
 * gates the first paint, and the issue trail follows the reader into the
 * Portraits as before — the edition just turns over at midnight instead
 * of Monday.
 */
export default function Home() {
  const L = useLetterpress();
  const { trees, activeTree, refresh } = useActiveTree();
  const broadsheet = useBroadsheet();
  const { subscription } = usePurchases();
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [relationships, setRelationships] = useState<Map<string, Kin>>(new Map());
  const [ancestor, setAncestor] = useState<DailyAncestor | null>(null);
  const [ancestorNote, setAncestorNote] = useState<string | null>(null);
  const [arc, setArc] = useState<StoryArc | 'loading' | 'failed'>('loading');
  const [stage, setStage] = useState<FamilyStage | null>(null);
  const [naraCounts, setNaraCounts] = useState<NaraCounts | null>(null);
  // The Archives focus: collapsed by default; expanding fetches up to 10
  // pending candidates to judge in place.
  const [naraOpen, setNaraOpen] = useState(false);
  const [naraCards, setNaraCards] = useState<NaraCandidate[] | 'loading' | null>(null);
  // The shelf backs On This Day's fallback only — a historical moment for
  // days with no dated anniversary in the tree.
  const [shelf, setShelf] = useState<ShelfEntry[] | null>(null);

  // Today's issue — new at midnight, the seed for every module's pick.
  const issue = dailyIssueOf(new Date());

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

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Keep next Sunday's digest notification armed with fresh content.
  useEffect(() => {
    if (activeTree) armDigestNotification(activeTree.id).catch(() => {});
  }, [activeTree?.id]);

  // Anniversaries + the ancestor of the day, recomputed on focus so the
  // issue turns over at midnight without a relaunch.
  useFocusEffect(
    useCallback(() => {
      if (!activeTree) return;
      let cancelled = false;
      const treeId = activeTree.id;
      const issueKey = dailyIssueOf(new Date()).key;
      (async () => {
        try {
          const relationshipMap = await getKinMap(treeId).catch(() => new Map<string, Kin>());
          const featuredIds = await getFeaturedIds(treeId).catch(() => new Set<string>());
          const result = await weeklyDigest(supabase, treeId, new Date(), featuredIds);
          if (cancelled) return;
          setRelationships(relationshipMap);
          setDigest(result);

          // The ancestor of the day: a date-seeded walk over the featured
          // pool (honors the lineage scope), skipping the living. A small
          // window is fetched so a living pick just slides to the next.
          const ids = [...featuredIds].sort();
          if (ids.length > 0) {
            const seedPick = pickWeekly(ids, `${issueKey}:ancestor`);
            const start = seedPick ? ids.indexOf(seedPick) : 0;
            const window = Array.from(
              { length: Math.min(12, ids.length) },
              (_, i) => ids[(start + i) % ids.length]!,
            );
            const { data: rows } = await supabase
              .from('individuals')
              .select('id, full_name, birth_year, death_year, living')
              .in('id', window);
            if (cancelled) return;
            const byId = new Map((rows ?? []).map((r) => [r.id, r]));
            const pick = window.map((id) => byId.get(id)).find((p) => p && !p.living) ?? null;
            if (pick) {
              setAncestor(pick);
              const { data: note } = await supabase
                .from('enrichment_cache')
                .select('content')
                .eq('individual_id', pick.id)
                .eq('enrichment_type', 'digest_note')
                .maybeSingle();
              if (!cancelled) setAncestorNote(note?.content ?? null);
            }
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

  // The rest of the modules — each block arrives independently, nothing
  // gates the first paint.
  useFocusEffect(
    useCallback(() => {
      if (!activeTree) return;
      let cancelled = false;
      const treeId = activeTree.id;
      const issueKey = dailyIssueOf(new Date()).key;

      // The family graph of the day: a date-seeded rotation over the
      // households the stage index can draw, biased toward the ones with
      // a dated marriage and a real sibship — those graphs read as a
      // story, not a stub.
      getTreeIndex(treeId)
        .then((index) => {
          if (cancelled) return;
          const stages = buildFamilyStages(index, { currentYear: new Date().getFullYear() });
          const all = [...stages.byKey.values()];
          const interesting = all.filter(
            (s) =>
              s.marriage > 0 &&
              s.marriages.reduce((n, m) => n + m.children.length, 0) >= 3,
          );
          const pool = (interesting.length > 0 ? interesting : all)
            .map((s) => s.key)
            .sort();
          const key = pickWeekly(pool, `${issueKey}:family-graph`);
          setStage(key ? (stages.byKey.get(key) ?? null) : null);
        })
        .catch(() => {});

      fetchNaraCounts(supabase, treeId)
        .then((counts) => {
          if (!cancelled) setNaraCounts(counts);
        })
        .catch(() => {});

      getShelf(treeId)
        .then((entries) => {
          if (!cancelled) setShelf(entries);
        })
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    }, [activeTree?.id]),
  );

  // Lay the issue trail once the modules have their picks, so the
  // Portrait can offer "next in this issue" (audit G1) — now daily.
  const onThisDay = digest?.days.find((d) => isToday(d.occursOn)) ?? null;
  useEffect(() => {
    if (!activeTree) return;
    const trail: TrailPiece[] = [];
    if (onThisDay) {
      trail.push({
        key: 'on-this-day',
        label: 'ON THIS DAY',
        destination: { pathname: '/ancestor/[id]', params: { id: onThisDay.individualId } },
      });
    }
    if (ancestor) {
      trail.push({
        key: 'ancestor',
        label: 'THE ANCESTOR OF THE DAY',
        destination: { pathname: '/ancestor/[id]', params: { id: ancestor.id } },
      });
    }
    if (typeof arc === 'object') {
      trail.push({ key: 'story', label: 'THE GENERATIONAL STORY', destination: { pathname: '/story-arc' } });
    }
    if (stage) {
      trail.push({
        key: 'family-graph',
        label: 'THE FAMILY GRAPH',
        destination: { pathname: '/family-stage/[key]', params: { key: stage.key } },
      });
    }
    if (naraCounts && naraCounts.pending > 0) {
      trail.push({
        key: 'archives',
        label: 'THE ARCHIVES',
        destination: { pathname: '/archives', params: { treeId: activeTree.id } },
      });
    }
    layIssueTrail(issue.number, trail);
  }, [activeTree?.id, issue.number, onThisDay, ancestor, arc, stage, naraCounts]);

  function openArchivesFocus() {
    if (!activeTree) return;
    setNaraOpen(true);
    if (naraCards !== null) return;
    setNaraCards('loading');
    fetchNaraCandidatesForTree(supabase, activeTree.id)
      .then((rows) => {
        setNaraCards(rows.filter((c) => c.status === 'pending').slice(0, 10));
      })
      .catch(() => setNaraCards([]));
  }

  const dayOfYear = issue.number;
  const historicalToday =
    !onThisDay && shelf && shelf.length > 0 ? shelf[dayOfYear % shelf.length] : null;
  const ancestorRelationship = ancestor ? relationships.get(ancestor.id) : undefined;
  const stageChildren = stage
    ? stage.marriages.reduce((n, m) => n + m.children.length, 0)
    : 0;

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

              {/* First-week candor (audit gap G5): the notes are written by
                  a daily job, archive matches by a scheduled worker — a
                  brand-new tree's issue runs thin for reasons the reader
                  can't see. Say so. */}
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

              {/* 1 · On this day — a dated anniversary from the tree, or a
                  historical moment the tree lived through as the fallback. */}
              {(onThisDay || historicalToday) && (
                <Feed eyebrow="On this day">
                  {onThisDay ? (
                    <Pressable
                      onPress={() => {
                        openTrailPiece('on-this-day');
                        router.push({
                          pathname: '/ancestor/[id]',
                          params: { id: onThisDay.individualId },
                        });
                      }}
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
                  <Pressable onPress={() => router.push({ pathname: '/digest', params: { treeId: activeTree.id } })}>
                    <Text style={mono(13, L.amber)}>THIS WEEK IN YOUR FAMILY ›</Text>
                  </Pressable>
                </Feed>
              )}

              {/* 2 · The ancestor of the day — one person, date-seeded from
                  the featured pool, their cached note when the daily job
                  has written one. */}
              {ancestor && (
                <Feed eyebrow="Ancestor of the day">
                  <Pressable
                    onPress={() => {
                      openTrailPiece('ancestor');
                      router.push({ pathname: '/ancestor/[id]', params: { id: ancestor.id } });
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
                      {ancestor.full_name}
                    </Text>
                    {ancestorRecordLine(ancestor) !== '' && (
                      <Text style={mono(13, L.muted)}>{ancestorRecordLine(ancestor)}</Text>
                    )}
                    {ancestorRelationship && (
                      <KinReveal
                        tier={ancestorRelationship.tier}
                        label={ancestorRelationship.label}
                        uppercase
                        style={mono(13, L.deepAmber)}
                      />
                    )}
                    {ancestorNote && (
                      <Text
                        style={{
                          fontFamily: BrandFonts.serif.regular,
                          fontSize: 15.5,
                          lineHeight: 23,
                          color: L.ink,
                          marginTop: 4,
                        }}
                      >
                        {ancestorNote}
                      </Text>
                    )}
                    <Text style={{ ...mono(13, L.amber), marginTop: 4 }}>THEIR FULL STORY ›</Text>
                  </Pressable>
                </Feed>
              )}

              {/* 3 · A generational story — today's line, founder to reader. */}
              {(typeof arc === 'object' || arc === 'loading') && (
                <Feed eyebrow="A generational story">
                  {arc === 'loading' ? (
                    <Text style={mono(13.5, L.muted)}>SETTING TODAY'S STORY…</Text>
                  ) : (
                    <Pressable
                      onPress={() => {
                        openTrailPiece('story');
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
                      <Text style={mono(13, L.deepAmber)}>TODAY'S LINE</Text>
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
                      </Text>
                      {arc.generations[0]?.relationLabel && (
                        <KinReveal
                          tier={relationships.get(arc.generations[0].personId)?.tier ?? 'direct'}
                          label={arc.generations[0].relationLabel}
                          uppercase
                          style={mono(13, L.muted)}
                        />
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
                        {arc.dek}
                      </Text>
                      <Text style={{ ...mono(13, L.amber), marginTop: 4 }}>READ THE LINE ›</Text>
                    </Pressable>
                  )}
                </Feed>
              )}

              {/* 4 · The family graph of the day — one household, date-
                  seeded, biased toward the graphs with a story to draw. */}
              {stage && (
                <Feed eyebrow="Family graph of the day">
                  <Pressable
                    onPress={() => {
                      openTrailPiece('family-graph');
                      router.push({ pathname: '/family-stage/[key]', params: { key: stage.key } });
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
                        fontSize: 22,
                        lineHeight: 28,
                        color: L.ink,
                      }}
                    >
                      {stage.title}
                    </Text>
                    <Text style={mono(13, L.muted)}>
                      {[
                        stage.marriage > 0 ? `MARRIED ${stage.marriage}` : null,
                        stageChildren > 0
                          ? `${stageChildren} ${stageChildren === 1 ? 'CHILD' : 'CHILDREN'}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Text style={{ ...mono(13, L.amber), marginTop: 4 }}>OPEN THE GRAPH ›</Text>
                  </Pressable>
                </Feed>
              )}

              {/* 5 · The National Archives — the waiting count; expanding
                  brings ten pending records to judge without leaving Home. */}
              {naraCounts && naraCounts.pending > 0 && (
                <Feed eyebrow="The National Archives">
                  <Pressable
                    onPress={() => {
                      openTrailPiece('archives');
                      if (naraOpen) {
                        router.push({ pathname: '/archives', params: { treeId: activeTree.id } });
                      } else {
                        openArchivesFocus();
                      }
                    }}
                  >
                    <Text
                      style={{ fontFamily: BrandFonts.serif.regular, fontSize: 15.5, lineHeight: 22, color: L.ink }}
                    >
                      {naraCounts.pending === 1
                        ? 'One federal record awaits your judgment — a match the Archives cannot decide without you.'
                        : `${naraCounts.pending} federal records await your judgment — matches the Archives cannot decide without you.`}
                    </Text>
                  </Pressable>
                  {!naraOpen ? (
                    <Pressable onPress={openArchivesFocus} hitSlop={6}>
                      <Text style={mono(13, L.amber)}>
                        {`LOOK THROUGH ${Math.min(10, naraCounts.pending)} ›`}
                      </Text>
                    </Pressable>
                  ) : naraCards === 'loading' || naraCards === null ? (
                    <ActivityIndicator style={{ marginVertical: 8 }} />
                  ) : (
                    <>
                      {naraCards.map((candidate) => (
                        <NaraCandidateCard
                          key={candidate.id}
                          candidate={candidate}
                          onResolved={(candidateId, status) => {
                            setNaraCards((current) =>
                              Array.isArray(current)
                                ? current.filter((c) => c.id !== candidateId)
                                : current,
                            );
                            setNaraCounts((current) =>
                              current
                                ? {
                                    pending: Math.max(0, current.pending - 1),
                                    confirmed:
                                      current.confirmed + (status === 'confirmed' ? 1 : 0),
                                  }
                                : current,
                            );
                          }}
                        />
                      ))}
                      {naraCards.length === 0 && (
                        <Text
                          style={{ fontFamily: BrandFonts.serif.regular, fontSize: 15.5, color: L.ink }}
                        >
                          These ten are judged — the Archives has the rest.
                        </Text>
                      )}
                      <Pressable
                        onPress={() =>
                          router.push({ pathname: '/archives', params: { treeId: activeTree.id } })
                        }
                        hitSlop={6}
                      >
                        <Text style={mono(13, L.amber)}>
                          {`ALL ${naraCounts.pending} IN THE ARCHIVES ›`}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </Feed>
              )}
            </>
          )
        );

  // Broadsheet carrier (web ≥900px): the same daily issue at a readable
  // measure under a masthead — the rail carries the wordmark and Account.
  if (broadsheet) {
    return (
      <PageShell
        masthead={
          <Masthead
            title="Home"
            metaMono={`NO. ${issue.number} · ${issue.weekOfLabel.toUpperCase()}`}
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
