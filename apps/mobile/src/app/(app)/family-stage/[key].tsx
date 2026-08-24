import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import {
  stageKeyForPerson,
  type FamilyStage as Stage,
  type FamilyStageIndex,
  type StageBond,
  type StagePerson,
  type StageRow,
} from '@witness/core/query';

import { GuideHelpButton } from '@/components/field-guide';
import { LineageMark } from '@/components/lineage-mark';
import { RecordText } from '@/components/record-text';
import { BrandFonts, Letterpress } from '@/constants/theme';
import { useActiveTree } from '@/lib/active-tree';
import { VISITED_MARK, fetchVisitedSet } from '@/lib/visits';
import { getFamilyStages } from '@/lib/family-stage-cache';
import { getParentageMap } from '@/lib/parentage';
import { getLineageTierMap, type LineageTier } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

const L = Letterpress;

// The rolling window (panel 4h): forty-six years — about half a lifetime —
// visible at once; a vertical drag on the stage is the fine control, the
// slider the coarse one. The reading line sits fixed at this fraction of
// the chart and the years roll beneath it.
const WINDOW_YEARS = 46;
const LINE_FRAC = 0.42;
const SWEEP_MS_PER_YEAR = 110;

const PARENT_W = 46;
const CHILD_W = 34;
const THREAD_GAP = 12;
const UNION_CHILD_GAP = 22; // extra room between the parents and their children
const MIN_THREAD_W = 20;
const GUTTER = 42; // year scale on the left edge

const PALE = '#efe8da'; // died before 18 — the pale ribbon of the legend

const mono = (size: number, color: string = L.ink) => ({
  fontFamily: BrandFonts.mono.regular,
  fontSize: size,
  color,
});

const sexInk = (s: StagePerson['s']) =>
  s === 'M' ? L.inkMen : s === 'F' ? L.inkWomen : L.inkUnrecorded;

/** True when a death is genuinely unrecorded (not living, no death year). */
const deathUnknown = (person: StagePerson): boolean => person.d === null && !person.living;

/**
 * Ribbon end for drawing. Recorded death is itself; a living person runs
 * open to the current year. An UNKNOWN death is not a lifespan we get to
 * invent — draw it to the longest life we can see in this household (the
 * `unknownTo` floor) and mark the end with a "?" rather than a fabricated
 * birth+80 (Rufus, 2026-07-26). Never past the current year.
 */
function ribbonEnd(person: StagePerson, currentYear: number, unknownTo: number): number {
  if (person.d !== null) return person.d;
  if (person.living) return currentYear;
  return Math.min(Math.max(unknownTo, person.b + 1), currentYear);
}

interface BriefRow {
  id: string;
  title: string;
  status: string;
  individual_id: string;
}

/**
 * The Family Stage, turned upright (design panel 4h): the phone rotates
 * the metaphor, not the layout. Time falls down the screen; each person
 * is a vertical thread; the reading line lies across them, boxing every
 * age in the household on one row. The marriage is an amber enclosure
 * around the parent threads; widowhood is the thread continuing past it.
 */
export default function FamilyStageScreen() {
  const { key: paramKey } = useLocalSearchParams<{ key?: string }>();
  const { activeTree } = useActiveTree();
  const currentYear = new Date().getFullYear();

  const [stages, setStages] = useState<FamilyStageIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(0);
  const [lineYear, setLineYear] = useState<number | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [sheet, setSheet] = useState<'group' | 'briefs' | null>(null);
  const [briefs, setBriefs] = useState<BriefRow[] | null>(null);
  const [marriageIdx, setMarriageIdx] = useState(0);
  const [tiers, setTiers] = useState<Map<string, LineageTier>>(new Map());
  const [parentage, setParentage] = useState<Map<string, string>>(new Map());

  const sweepRaf = useRef<number | null>(null);
  const dragStartYear = useRef(0);

  useEffect(() => {
    if (!activeTree) return;
    let cancelled = false;
    getFamilyStages(activeTree.id)
      .then((index) => {
        if (cancelled) return;
        setStages(index);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTree?.id]);

  // Lineage marks + parentage for the family group sheet. Best-effort —
  // the sheet reads fine without them (no home person → no marks).
  useEffect(() => {
    if (!activeTree) return;
    let cancelled = false;
    getLineageTierMap(activeTree.id)
      .then((map) => {
        if (!cancelled) setTiers(map);
      })
      .catch(() => {});
    getParentageMap(activeTree.id)
      .then((map) => {
        if (!cancelled) setParentage(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTree?.id]);

  // Pick the household: the route's key, else the household that key names a
  // parent of. The middle case is what lets a screen that knows only a person
  // (the Portrait) link here — stage keys are the HEAD's id, so a wife's own
  // id never matches directly.
  //
  // A PERSON key that resolves to nothing gets the honest empty state below,
  // never a silent substitute — the old fallback teleported the reader to the
  // tree's top household, which read as "the stage opened the wrong family"
  // (Rufus, 2026-08-18). Only `/family-stage/root` (the Tree tab's door, and
  // resumed pre-rename links) means "any household": it falls to the picker's
  // first.
  const unstageable =
    stages !== null &&
    !!paramKey &&
    paramKey !== 'root' &&
    stageKeyForPerson(stages, paramKey) === null;
  useEffect(() => {
    if (!stages) return;
    const key =
      paramKey && paramKey !== 'root'
        ? stageKeyForPerson(stages, paramKey)
        : stages.topLevel[0]?.key;
    if (key) setCurrentKey(key);
  }, [stages, paramKey]);

  const stage: Stage | null = (currentKey && stages?.byKey.get(currentKey)) || null;

  // One marriage shown at a time; the switcher picks the set. The head is
  // shared across every marriage, so the view is [spouse, bond, head,
  // children] for the selected set (Rufus, 2026-07-26).
  const marriage = stage
    ? stage.marriages[Math.min(marriageIdx, stage.marriages.length - 1)] ?? null
    : null;

  const viewRows = useMemo<StageRow[]>(
    () =>
      stage && marriage
        ? [
            ...(marriage.spouse ? [marriage.spouse] : []),
            marriage.bond,
            stage.head,
            ...marriage.children,
          ]
        : [],
    [stage, marriage],
  );
  const people = useMemo(
    () => viewRows.filter((r): r is StagePerson => r.kind === 'person'),
    [viewRows],
  );
  const bonds = useMemo(
    () => viewRows.filter((r): r is StageBond => r.kind === 'bond'),
    [viewRows],
  );

  // Up-hops: the graph each person was a CHILD in — an inverse index over
  // the stages already loaded, no new fetch. Parents hop up through this;
  // children hop down through their own `mfam`.
  const childhoodKey = useMemo(() => {
    const map = new Map<string, string>();
    if (!stages) return map;
    for (const s of stages.byKey.values())
      for (const m of s.marriages)
        for (const c of m.children) if (!map.has(c.id)) map.set(c.id, s.key);
    return map;
  }, [stages]);

  // A new household starts on its first marriage.
  useEffect(() => {
    setMarriageIdx(0);
  }, [stage?.key]);

  // Open on the shown marriage's year; switching sets re-anchors the line.
  useEffect(() => {
    if (marriage) setLineYear(marriage.marriageYear);
    setSweeping(false);
  }, [stage?.key, marriageIdx]);

  // Stop the sweep on unmount or stage change.
  useEffect(() => {
    return () => {
      if (sweepRaf.current !== null) cancelAnimationFrame(sweepRaf.current);
    };
  }, [stage?.key]);

  // Briefs for this household's members, fetched when the sheet opens.
  // Betsey's star (2026-08-19): group-sheet members already visited.
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!people.length) {
      setVisitedIds(new Set());
      return;
    }
    let cancelled = false;
    void fetchVisitedSet(people.map((p) => p.id)).then((set) => {
      if (!cancelled) setVisitedIds(set);
    });
    return () => {
      cancelled = true;
    };
  }, [people]);

  useEffect(() => {
    if (sheet !== 'briefs' || !stage) return;
    let cancelled = false;
    setBriefs(null);
    const ids = people.map((p) => p.id);
    supabase
      .from('research_briefs')
      .select('id, title, status, individual_id')
      .in('individual_id', ids)
      .neq('status', 'archived')
      .then(({ data }) => {
        if (!cancelled) setBriefs((data as BriefRow[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [sheet, stage?.key]);

  const pxPerYear = chartHeight > 0 ? chartHeight / WINDOW_YEARS : 0;
  // Axis and slider follow the SELECTED marriage's span, not the whole
  // household — switching sets re-scales the years.
  const domainStart = marriage?.domainStart ?? 0;
  const domainEnd = marriage?.domainEnd ?? 1;
  const line = lineYear ?? domainStart;
  const windowStart = line - WINDOW_YEARS * LINE_FRAC;
  const y = (year: number) => (year - windowStart) * pxPerYear;
  const clampLine = (year: number) => Math.min(domainEnd, Math.max(domainStart, year));

  function stopSweep() {
    if (sweepRaf.current !== null) cancelAnimationFrame(sweepRaf.current);
    sweepRaf.current = null;
    setSweeping(false);
  }

  function startSweep() {
    if (!stage) return;
    setSweeping(true);
    let last = performance.now();
    let year = lineYear ?? (marriage ? marriage.marriageYear : domainStart);
    if (year >= domainEnd - 0.5) year = domainStart; // a finished sweep restarts
    const step = (now: number) => {
      year += (now - last) / SWEEP_MS_PER_YEAR;
      last = now;
      if (year >= domainEnd) {
        setLineYear(domainEnd);
        stopSweep();
        return;
      }
      setLineYear(year);
      sweepRaf.current = requestAnimationFrame(step);
    };
    sweepRaf.current = requestAnimationFrame(step);
  }

  // Vertical drag on the stage — the fine control. Dragging the roll down
  // moves time backward, matching pulling a scroll toward you.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        stopSweep();
        dragStartYear.current = lineRef.current;
      },
      onPanResponderMove: (_e, g) => {
        if (pxPerYearRef.current <= 0) return;
        setLineYear(clampRef.current(dragStartYear.current - g.dy / pxPerYearRef.current));
      },
    }),
  ).current;
  // Refs so the long-lived PanResponder sees fresh values.
  const lineRef = useRef(line);
  lineRef.current = line;
  const pxPerYearRef = useRef(pxPerYear);
  pxPerYearRef.current = pxPerYear;
  const clampRef = useRef(clampLine);
  clampRef.current = clampLine;

  // Slider — the coarse control.
  const [sliderWidth, setSliderWidth] = useState(0);
  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => stopSweep(),
      onPanResponderMove: (e) => {
        const w = sliderWidthRef.current;
        if (w <= 0) return;
        const frac = Math.min(1, Math.max(0, e.nativeEvent.locationX / w));
        setLineYear(domainRef.current[0] + frac * (domainRef.current[1] - domainRef.current[0]));
      },
    }),
  ).current;
  const sliderWidthRef = useRef(0);
  sliderWidthRef.current = sliderWidth;
  const domainRef = useRef<[number, number]>([domainStart, domainEnd]);
  domainRef.current = [domainStart, domainEnd];

  if (!activeTree || failed) {
    return (
      <View style={{ flex: 1, backgroundColor: L.paper, padding: 24, paddingTop: 72 }}>
        <RecordText eyebrow style={{ color: L.deepAmber }}>
          The family graph
        </RecordText>
        <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 20, color: L.ink, marginTop: 10 }}>
          {failed ? 'The stage could not be set — try again shortly.' : 'No tree yet.'}
        </Text>
      </View>
    );
  }

  if (unstageable) {
    return (
      <View style={{ flex: 1, backgroundColor: L.paper, padding: 24, paddingTop: 72 }}>
        <RecordText eyebrow style={{ color: L.deepAmber }}>
          The family graph
        </RecordText>
        <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 20, color: L.ink, marginTop: 10 }}>
          This household can&rsquo;t be drawn as a length of time yet.
        </Text>
        <Text style={{ ...mono(10.5, L.muted), marginTop: 10, lineHeight: 16 }}>
          THE STAGE NEEDS A DATED MARRIAGE AND AT LEAST ONE CHILD WITH A RECORDED BIRTH YEAR.
        </Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginTop: 18, alignSelf: 'flex-start' }}>
          <Text style={mono(12, L.amber)}>← BACK</Text>
        </Pressable>
      </View>
    );
  }

  if (!stage || !marriage) {
    return (
      <View style={{ flex: 1, backgroundColor: L.paper, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={mono(12, L.inkUnrecorded)}>SETTING THE STAGE…</Text>
      </View>
    );
  }

  // Thread slots in row order; a caption row becomes a slim divider slot.
  // An extra gap sets the parents' union apart from the children it
  // produced, so the brood reads as belonging to this marriage (Rufus).
  const slots: { person?: StagePerson; caption?: string; width: number; x: number }[] = [];
  let xCursor = 0;
  let prevRole: StagePerson['role'] | null = null;
  for (const row of viewRows) {
    if (row.kind === 'person') {
      if (row.role === 'child' && prevRole !== null && prevRole !== 'child') {
        xCursor += UNION_CHILD_GAP;
      }
      const width = row.role === 'child' ? CHILD_W : PARENT_W;
      slots.push({ person: row, width, x: xCursor });
      xCursor += width + THREAD_GAP;
      prevRole = row.role;
    } else if (row.kind === 'caption') {
      slots.push({ caption: row.caption, width: 16, x: xCursor });
      xCursor += 16 + THREAD_GAP;
    }
  }
  const threadsWidth = Math.max(xCursor - THREAD_GAP, 0);
  const slotByPerson = new Map(slots.filter((s) => s.person).map((s) => [s.person!.id, s]));

  // Bond k spans the person rows on either side of it (row order is
  // [spouse, bond, head, bond, spouse, …]).
  const enclosures = bonds.map((bond) => {
    const at = viewRows.indexOf(bond);
    const before = viewRows[at - 1];
    const after = viewRows[at + 1];
    const left = before?.kind === 'person' ? slotByPerson.get(before.id) : undefined;
    const right = after?.kind === 'person' ? slotByPerson.get(after.id) : undefined;
    if (!left || !right) return null;
    const x0 = Math.min(left.x, right.x) - 3;
    const x1 = Math.max(left.x + left.width, right.x + right.width) + 3;
    return { bond, x0, x1 };
  });

  const lineY = chartHeight * LINE_FRAC;
  // The floor an unknown-death ribbon reaches: the longest life we can
  // actually see in this household (any known death, else the marriage).
  const unknownTo = Math.max(
    ...people.filter((p) => p.d !== null).map((p) => p.d as number),
    marriage.marriageYear,
  );
  // The head's NEXT marriage, if any — a spouse who outlived this union
  // was left at that point, not at death (Rufus, 2026-07-26). We have no
  // divorce date in the record, so the next marriage is the honest cutoff.
  const nextMarriageYear = stage.marriages[marriageIdx + 1]?.marriageYear ?? null;
  /** Where a spouse's ribbon should stop: their death, but never past the
      head's next marriage while they were still living. */
  const spouseEnd = (spouse: StagePerson): number => {
    const natural = ribbonEnd(spouse, currentYear, unknownTo);
    if (nextMarriageYear !== null && natural > nextMarriageYear) return nextMarriageYear;
    return natural;
  };
  const membersAlive = people.filter(
    (p) => p.b <= line && ribbonEnd(p, currentYear, unknownTo) >= line,
  );
  const children = people.filter((p) => p.role === 'child');
  const atHome = children.filter(
    (c) => c.b <= line && line < c.b + 18 && (c.d === null || c.d > line),
  );
  const eldestAtHome = atHome.length
    ? Math.max(...atHome.map((c) => Math.floor(line - c.b)))
    : null;
  const firstBond = bonds[0] ?? null;
  const unionText = !firstBond
    ? null
    : line < firstBond.from
      ? 'not yet married'
      : firstBond.to !== null && line > firstBond.to
        ? `closed after ${firstBond.to - firstBond.from} years`
        : `${Math.floor(line - firstBond.from)} years married`;
  // Children's marriages surface in the reading band as the line passes them.
  const passing = people.filter((p) => p.m && p.m.y <= line && p.m.y > line - 4);

  const decadeStart = Math.floor(windowStart / 10) * 10;
  const decades: number[] = [];
  for (let yr = decadeStart; yr <= windowStart + WINDOW_YEARS + 10; yr += 10) decades.push(yr);

  return (
    <View style={{ flex: 1, backgroundColor: L.paper }}>
      {/* Header — back means BACK: the reader returns to whatever screen
          they were just on (a Portrait, the Register, the previous graph
          in a chain of hops). dismissTo('/register') used to dump readers
          who arrived from a Portrait onto a screen they'd never seen
          (Rufus, 2026-08-23). The register stays the no-history fallback
          for cold deep links. */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          paddingTop: 64,
          paddingHorizontal: 20,
        }}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.dismissTo('/register' as never))}
          hitSlop={10}
        >
          <Text style={mono(12, L.amber)}>← BACK</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <RecordText eyebrow style={{ color: L.muted }}>
            The family graph
          </RecordText>
          <GuideHelpButton page="family-stage.html" color={L.amber} />
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <Text
          numberOfLines={2}
          style={{ fontFamily: BrandFonts.serif.semiBold, fontSize: 25, lineHeight: 31, color: L.ink }}
        >
          {stage.title}
        </Text>
        <Text style={{ ...mono(10.5, L.muted), marginTop: 5 }}>{stage.sub.toUpperCase()}</Text>
        {stage.scrubEnd > stage.marriage && (
          <Text style={{ ...mono(10.5, L.deepAmber), marginTop: 3 }}>
            THE FAMILY LASTED {stage.scrubEnd - stage.marriage} YEARS · {stage.marriage}–{stage.scrubEnd}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {(
            [
              [L.inkMen, 'MAN'],
              [L.inkWomen, 'WOMAN'],
              [PALE, 'DIED BEFORE 18'],
              [L.inkUnrecorded, 'NOT RECORDED'],
            ] as const
          ).map(([color, label]) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 9, height: 9, backgroundColor: color, borderWidth: label === 'DIED BEFORE 18' ? 1 : 0, borderColor: L.rule }} />
              <Text style={mono(9.5, L.muted)}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Set-switcher — one chip per marriage when the head married more
            than once (Rufus, 2026-07-26). Each set re-scales the axis. */}
        {stage.marriages.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingTop: 10, paddingRight: 12 }}
          >
            {stage.marriages.map((m, i) => {
              const active = i === marriageIdx;
              return (
                <Pressable
                  key={`${m.marriageYear}-${i}`}
                  onPress={() => setMarriageIdx(i)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderWidth: 1,
                    borderColor: active ? L.amber : L.rule,
                    backgroundColor: active ? L.amber : 'transparent',
                  }}
                >
                  <Text style={mono(9.5, active ? L.paper : L.ink)}>
                    {m.spouseName.split(' ')[0].toUpperCase()} · {m.marriageYear}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* The stage: threads against falling time. */}
      <View
        style={{ flex: 1, marginTop: 10, marginHorizontal: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: L.rule }}
        onLayout={(e: LayoutChangeEvent) => setChartHeight(e.nativeEvent.layout.height)}
        {...pan.panHandlers}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ width: Math.max(threadsWidth + GUTTER + 8, 0) }}
        >
          <View style={{ width: threadsWidth + GUTTER + 8, height: '100%' }}>
            {/* Decade ruling */}
            {chartHeight > 0 &&
              decades.map((decade) => {
                const dy = y(decade);
                if (dy < -20 || dy > chartHeight + 20) return null;
                return (
                  <View key={decade} style={{ position: 'absolute', left: 0, right: 0, top: dy }}>
                    <View style={{ position: 'absolute', left: GUTTER - 6, right: 0, height: 1, backgroundColor: L.rule, opacity: 0.6 }} />
                    <Text style={{ ...mono(9.5, L.inkUnrecorded), position: 'absolute', left: 0, top: -4 }}>
                      {decade}
                    </Text>
                  </View>
                );
              })}

            {/* Marriage enclosures */}
            {chartHeight > 0 &&
              enclosures.map((enc, i) => {
                if (!enc) return null;
                const top = y(enc.bond.from);
                const bottom = y(enc.bond.to ?? Math.min(currentYear, domainEnd));
                return (
                  <View
                    key={`enc${i}`}
                    style={{
                      position: 'absolute',
                      left: GUTTER + enc.x0,
                      width: enc.x1 - enc.x0,
                      top,
                      height: Math.max(bottom - top, 0),
                      backgroundColor: 'rgba(176,116,31,0.13)',
                      borderWidth: 1,
                      borderColor: 'rgba(176,116,31,0.55)',
                    }}
                  />
                );
              })}

            {/* Threads */}
            {chartHeight > 0 &&
              slots.map((slot) => {
                if (slot.caption) {
                  return (
                    <Text
                      key={`cap-${slot.x}`}
                      style={{
                        ...mono(9, L.deepAmber),
                        position: 'absolute',
                        left: GUTTER + slot.x + 12,
                        top: 10,
                        width: chartHeight,
                        transform: [{ rotate: '90deg' }],
                        transformOrigin: 'top left' as never,
                      }}
                      numberOfLines={1}
                    >
                      {slot.caption.toUpperCase()}
                    </Text>
                  );
                }
                const person = slot.person!;
                // Where can this ribbon take you? Children hop DOWN to the
                // graph they head; parents hop UP to the graph they were a
                // child in. No further family = no press (Rufus's call).
                const hopKey =
                  person.role === 'child'
                    ? person.mfam && person.mfam !== stage.key && stages?.byKey.has(person.mfam)
                      ? person.mfam
                      : null
                    : childhoodKey.get(person.id) !== stage.key
                      ? (childhoodKey.get(person.id) ?? null)
                      : null;
                const isDirect = tiers.get(person.id) === 'direct';
                // A spouse who outlived this union is dropped at the head's
                // next marriage; everyone else runs to their own end.
                const end =
                  person.role === 'spouse'
                    ? spouseEnd(person)
                    : ribbonEnd(person, currentYear, unknownTo);
                // Truncated because the head remarried, not because they died.
                const leftAtRemarriage =
                  person.role === 'spouse' &&
                  nextMarriageYear !== null &&
                  ribbonEnd(person, currentYear, unknownTo) > nextMarriageYear;
                const top = y(person.b);
                const bottom = y(end);
                if (bottom < 0 || top > chartHeight) return null;
                const diedYoung = person.d !== null && person.d - person.b < 18;
                const unrecorded = deathUnknown(person) && !leftAtRemarriage;
                const ink = sexInk(person.s);
                // The head carries his full name (surname included) so the
                // husband is identifiable in every set; others show given only.
                const given = person.role === 'head' ? person.n : person.n.split(' ')[0];
                const age = person.b <= line && end >= line ? Math.floor(line - person.b) : null;
                // The name sticks to the top edge as the roll passes — and
                // steps down past any badges capping the ribbon.
                const badgeTop = Math.max(top + 3, 3);
                const nameTop = Math.max(top + 4, 4) + (hopKey ? 19 : 0) + (isDirect ? 19 : 0);
                return (
                  <Pressable
                    key={person.id}
                    disabled={!hopKey}
                    onPress={() =>
                      hopKey &&
                      router.push({ pathname: '/family-stage/[key]', params: { key: hopKey } } as never)
                    }
                    style={{ position: 'absolute', left: GUTTER + slot.x, width: slot.width, top: 0, bottom: 0 }}
                  >
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: Math.max(top, -2),
                        height: Math.max(Math.min(bottom, chartHeight + 2) - Math.max(top, -2), 0),
                        backgroundColor: diedYoung ? PALE : ink,
                        opacity: unrecorded ? 0.45 : 1,
                        borderWidth: diedYoung ? 1 : 0,
                        borderColor: ink,
                      }}
                    />
                    {bottom > 30 && (
                      <Text
                        numberOfLines={1}
                        style={{
                          position: 'absolute',
                          left: slot.width / 2 + 4,
                          top: nameTop,
                          width: 120,
                          fontFamily: BrandFonts.mono.medium,
                          fontSize: 10.5,
                          letterSpacing: 1,
                          color: diedYoung ? L.ink : L.paper,
                          transform: [{ rotate: '90deg' }],
                          transformOrigin: 'top left' as never,
                        }}
                      >
                        {given.toUpperCase()}
                      </Text>
                    )}
                    {/* Left at the head's remarriage: an open cap (not a
                        death) marks where this spouse leaves the stage. */}
                    {leftAtRemarriage && bottom > 0 && bottom < chartHeight + 2 && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          left: -2,
                          right: -2,
                          top: Math.min(bottom, chartHeight) - 1,
                          height: 2,
                          backgroundColor: L.deepAmber,
                        }}
                      />
                    )}
                    {/* Unknown death: a "?" caps the speculative end so the
                        faint ribbon never reads as a real lifespan. */}
                    {unrecorded && bottom > 0 && bottom < chartHeight + 2 && (
                      <View
                        style={{
                          position: 'absolute',
                          alignSelf: 'center',
                          top: Math.min(bottom, chartHeight) - 14,
                          backgroundColor: L.paper,
                          borderWidth: 1,
                          borderColor: sexInk(person.s),
                          paddingHorizontal: 3,
                        }}
                      >
                        <Text style={mono(9.5, sexInk(person.s))}>?</Text>
                      </View>
                    )}
                    {age !== null && (
                      <View
                        style={{
                          position: 'absolute',
                          alignSelf: 'center',
                          top: lineY - 9,
                          backgroundColor: L.ink,
                          paddingHorizontal: 4,
                          paddingVertical: 2,
                          borderWidth: 1,
                          borderColor: L.paper,
                        }}
                      >
                        <Text style={mono(10, L.paper)}>{age}</Text>
                      </View>
                    )}
                    {/* Another graph to view: ↑ = the parents' childhood
                        household, ↓ = the family this child went on to head. */}
                    {hopKey && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          alignSelf: 'center',
                          top: badgeTop,
                          backgroundColor: L.paper,
                          borderWidth: 1,
                          borderColor: L.ink,
                          paddingHorizontal: 4,
                          paddingVertical: 1,
                        }}
                      >
                        <Text style={mono(9.5, L.ink)}>{person.role === 'child' ? '↓' : '↑'}</Text>
                      </View>
                    )}
                    {/* The direct ancestor in this household — the app's
                        lineage mark, so the eye finds the bloodline child. */}
                    {isDirect && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          alignSelf: 'center',
                          top: badgeTop + (hopKey ? 19 : 0),
                          backgroundColor: L.amber,
                          borderWidth: 1,
                          borderColor: L.paper,
                          paddingHorizontal: 4,
                          paddingVertical: 1,
                        }}
                      >
                        <LineageMark tier="direct" size={10} color={L.paper} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
          </View>
        </ScrollView>

        {/* The reading line — fixed; the years roll beneath it. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: lineY, height: 1, backgroundColor: L.amber }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: lineY - 8, backgroundColor: L.amber, paddingHorizontal: 3, paddingVertical: 1 }}>
          <Text style={mono(9, L.paper)}>{Math.floor(line)}</Text>
        </View>
      </View>

      {/* The reading band. */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 4 }}>
        {unionText && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ ...mono(9.5, L.muted), width: 62 }}>UNION</Text>
            <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13, color: L.ink }}>{unionText}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={{ ...mono(9.5, L.muted), width: 62 }}>AT HOME</Text>
          <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13, color: L.ink }}>
            {atHome.length === 0
              ? 'no children under eighteen'
              : `${atHome.length} under eighteen, eldest ${eldestAtHome}`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={{ ...mono(9.5, L.muted), width: 62 }}>LIVING</Text>
          <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13, color: L.ink }}>
            {membersAlive.length} of the {people.length} in this group
          </Text>
        </View>
        {passing.map((p) => (
          <View key={`m-${p.id}`} style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ ...mono(9.5, L.deepAmber), width: 62 }}>{p.m!.y}</Text>
            <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13, color: L.ink }}>
              {p.n.split(' ')[0]} married {p.m!.spouse}
            </Text>
          </View>
        ))}
      </View>

      {/* Chips · slider · sweep. */}
      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 26, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(
            [
              ['FAMILY GROUP', () => setSheet('group'), true],
              ['BRIEFS', () => setSheet('briefs'), true],
              ['SHARE · SOON', () => {}, false],
            ] as const
          ).map(([label, onPress, enabled]) => (
            <Pressable
              key={label}
              onPress={onPress}
              disabled={!enabled}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: enabled ? L.ink : L.rule,
                opacity: enabled ? 1 : 0.6,
              }}
            >
              <Text style={mono(9, enabled ? L.ink : L.muted)}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View
          style={{ height: 28, justifyContent: 'center' }}
          onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
          {...sliderPan.panHandlers}
        >
          <View style={{ height: 2, backgroundColor: L.rule }} />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: Math.max(
                0,
                Math.min(sliderWidth - 14, ((line - domainStart) / Math.max(domainEnd - domainStart, 1)) * sliderWidth - 7),
              ),
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: L.amber,
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 }}>
          <Text style={mono(9.5, L.muted)}>{marriage.marriageYear} · THE MARRIAGE</Text>
          <Text style={mono(9.5, L.muted)}>{marriage.scrubEnd} · THE LAST CHILD</Text>
        </View>

        <Pressable
          onPress={() => (sweeping ? stopSweep() : startSweep())}
          style={{ backgroundColor: sweeping ? L.deepAmber : L.ink, paddingVertical: 12, alignItems: 'center' }}
        >
          <Text style={mono(10.5, L.paper)}>{sweeping ? 'HOLD THE YEAR' : 'SWEEP THE YEARS'}</Text>
        </Pressable>
      </View>

      {/* Sheets — the "whole of it" facts, collapsed into chips (panel 4h). */}
      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(26,24,21,0.35)' }} onPress={() => setSheet(null)} />
        <View style={{ backgroundColor: L.paper, borderTopWidth: 2, borderTopColor: L.ink, maxHeight: '60%', padding: 20, paddingBottom: 36 }}>
          <RecordText eyebrow style={{ color: L.deepAmber }}>
            {sheet === 'group' ? 'The family group' : 'Research briefs'}
          </RecordText>
          <ScrollView style={{ marginTop: 10 }}>
            {sheet === 'group' &&
              people.map((p) => (
                <View
                  key={p.id}
                  style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: L.rule }}
                >
                  <Pressable
                    style={{ flexShrink: 1 }}
                    onPress={() => {
                      setSheet(null);
                      router.push({ pathname: '/ancestor/[id]', params: { id: p.id } });
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 16, color: L.ink, flexShrink: 1 }}>
                        {p.n}
                      </Text>
                      <LineageMark tier={tiers.get(p.id)} size={11} color={L.deepAmber} />
                      {visitedIds.has(p.id) && <Text style={mono(9, L.muted)}>{VISITED_MARK}</Text>}
                    </View>
                    <Text style={mono(9, L.muted)}>
                      {p.b}–{p.living ? '' : (p.d ?? '?')} · {p.role.toUpperCase()}
                    </Text>
                    {parentage.has(p.id) && (
                      <Text style={mono(9, L.muted)}>{parentage.get(p.id)!.toUpperCase()}</Text>
                    )}
                  </Pressable>
                  {p.mfam && stages?.byKey.has(p.mfam) && (
                    <Pressable
                      onPress={() => {
                        setSheet(null);
                        router.push({ pathname: '/family-stage/[key]', params: { key: p.mfam } } as never);
                      }}
                    >
                      <Text style={mono(9, L.amber)}>THEIR GRAPH ›</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            {sheet === 'briefs' &&
              (briefs === null ? (
                <Text style={mono(10, L.muted)}>READING THE DESK…</Text>
              ) : briefs.length === 0 ? (
                <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 15, color: L.ink }}>
                  No briefs yet for this household — start one from any member's page.
                </Text>
              ) : (
                briefs.map((brief) => (
                  <Pressable
                    key={brief.id}
                    style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: L.rule }}
                    onPress={() => {
                      setSheet(null);
                      router.push({ pathname: '/research/[briefId]', params: { briefId: brief.id } });
                    }}
                  >
                    <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 16, color: L.ink }}>{brief.title}</Text>
                    <Text style={mono(9, L.muted)}>{brief.status.toUpperCase()}</Text>
                  </Pressable>
                ))
              ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
