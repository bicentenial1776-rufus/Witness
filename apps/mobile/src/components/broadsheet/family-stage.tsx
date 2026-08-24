import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { HISTORICAL_EVENTS, PRESIDENCIES } from '@witness/core/history';
import {
  buildFamilyStages,
  type FamilyStage as Stage,
  type FamilyStageIndex,
  type StagePerson,
} from '@witness/core/query';

import { RecordText } from '@/components/record-text';
import { Broadsheet, BrandFonts, Letterpress, mono } from '@/constants/theme';
import { consumePendingStage } from '@/lib/stage-handoff';
import { getTreeIndex } from '@/lib/tree-index-cache';

const C = Broadsheet.color;

// The letterpress system from design panel 4g — now the app-wide tokens.
const PAPER = Letterpress.paper;
const INK = Letterpress.ink;
const AMBER = Letterpress.amber;
const DEEP_AMBER = Letterpress.deepAmber;
const INK_MEN = Letterpress.inkMen;
const INK_WOMEN = Letterpress.inkWomen;
const INK_UNRECORDED = Letterpress.inkUnrecorded;

const NAME_GUTTER = 190;
const PARENT_RIBBON = 22;
const CHILD_RIBBON = 18;
const ROW_PAD = 9;
const BOND_HEIGHT = 12;
const SWEEP_MS_PER_YEAR = 110;

const sexInk = (s: StagePerson['s']) => (s === 'M' ? INK_MEN : s === 'F' ? INK_WOMEN : INK_UNRECORDED);

function ageWord(years: number): string {
  if (years < 1) return 'in infancy';
  return `aged ${years}`;
}

/**
 * The Family Graph — one household drawn as lifelines against a shared
 * time axis. Web carrier: the whole family span scales to fit, nothing
 * scrolls off, and a vertical reading line sweeps left to right.
 * Depth comes from shadow only — never translateZ, which slides edges
 * off the years they mark.
 */
export function FamilyStage({ treeId }: { treeId: string }) {
  const [stages, setStages] = useState<FamilyStageIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [year, setYear] = useState(0);
  const [sweeping, setSweeping] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showPresidents, setShowPresidents] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);
  const sweepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTreeIndex(treeId)
      .then((index) => {
        if (cancelled) return;
        const built = buildFamilyStages(index, { currentYear: new Date().getFullYear() });
        setStages(built);
        const opening = built.topLevel[0];
        if (opening) {
          setCurrentKey(opening.key);
          setYear(opening.scrubStart);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const stage = currentKey ? (stages?.byKey.get(currentKey) ?? null) : null;

  const stopSweep = () => {
    if (sweepTimer.current) clearInterval(sweepTimer.current);
    sweepTimer.current = null;
    setSweeping(false);
  };

  // Clear the sweep on unmount and whenever the family changes.
  useEffect(() => stopSweep, [currentKey]);

  // The Register hands households here: arriving on the Tree tab with a
  // pending key opens that stage. Consume only once stages have loaded — on a
  // cold arrival this effect fires before the index resolves, and an
  // early consume destroyed the key the re-run needed (the handoff
  // silently opened nothing).
  useFocusEffect(
    useCallback(() => {
      if (!stages) return;
      const pending = consumePendingStage();
      if (pending && stages.byKey.has(pending)) {
        const next = stages.byKey.get(pending)!;
        setCurrentKey(pending);
        setYear(next.scrubStart);
      }
    }, [stages]),
  );

  function toggleSweep() {
    if (sweeping) {
      stopSweep();
      return;
    }
    if (!stage) return;
    if (year >= stage.scrubEnd) setYear(stage.scrubStart);
    setSweeping(true);
    sweepTimer.current = setInterval(() => {
      setYear((current) => {
        if (!stage || current >= stage.scrubEnd) {
          stopSweep();
          return current;
        }
        return current + 1;
      });
    }, SWEEP_MS_PER_YEAR);
  }

  function openStage(key: string) {
    const next = stages?.byKey.get(key);
    if (!next) return;
    stopSweep();
    setCurrentKey(key);
    setYear(next.scrubStart);
  }

  if (failed) return null; // the Tree tab carries on without the stage
  if (!stages || !stage) {
    return (
      <View style={{ marginBottom: 28 }}>
        <RecordText eyebrow accent>
          The Family Graph
        </RecordText>
        <View
          style={{
            marginTop: 10,
            height: 260,
            backgroundColor: PAPER,
            borderWidth: 1,
            borderColor: C.rule,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={mono(13, INK_UNRECORDED)}>SETTING THE STAGE…</Text>
        </View>
      </View>
    );
  }

  const { domainStart, domainEnd } = stage;
  const x = (yr: number) =>
    chartWidth > 0 ? ((yr - domainStart) / (domainEnd - domainStart)) * chartWidth : 0;

  const persons = stage.rows.filter((row): row is StagePerson => row.kind === 'person');
  const children = persons.filter((p) => p.role === 'child');
  const currentYr = new Date().getFullYear();
  // A person's known end: death, or today for the living, or null when
  // the record is silent — silence is not the same as living.
  const endOf = (p: StagePerson) => (p.d !== null ? p.d : p.living ? currentYr : null);
  const lostYoung = children.filter((c) => c.d !== null && c.d - c.b < 18);

  // The live reading, computed at the reading line.
  const gone = persons.filter((p) => p.d !== null && p.d <= year);
  const atHome = children.filter((c) => c.b <= year && year < c.b + 18 && !(c.d !== null && c.d <= year));
  const bonds = stage.rows.filter((row) => row.kind === 'bond');
  const marriageState = (() => {
    const active = bonds.find((b) => b.from <= year && (b.to === null || year < b.to));
    if (active) return `married ${year - active.from} ${year - active.from === 1 ? 'year' : 'years'}`;
    const ended = [...bonds].reverse().find((b) => b.to !== null && year >= b.to);
    if (ended) return `widowed ${year - ended.to!} ${year - ended.to! === 1 ? 'year' : 'years'}`;
    return 'before the marriage';
  })();
  const childYears = (() => {
    let total = 0;
    for (let yr = stage.scrubStart; yr <= stage.scrubEnd; yr++) {
      if (children.some((c) => c.b <= yr && yr < c.b + 18 && !(c.d !== null && c.d <= yr))) total++;
    }
    return total;
  })();

  const marriedChildren = children.filter((c) => c.m);

  // Person rows carry an index into the visual stack so bonds can span
  // their neighbours — derived from position, never hardcoded.
  let personOrdinal = -1;
  const rowNodes = stage.rows.map((row, i) => {
    if (row.kind === 'caption') {
      return (
        <View key={`cap-${i}`} style={{ flexDirection: 'row', paddingVertical: 3 }}>
          <View style={{ width: NAME_GUTTER }} />
          <Text
            style={{
              fontFamily: BrandFonts.serif.italic,
              fontSize: 12.5,
              color: INK_UNRECORDED,
            }}
          >
            {row.caption}
          </Text>
        </View>
      );
    }

    if (row.kind === 'bond') {
      const to = row.to ?? Math.min(year, domainEnd);
      const filledTo = Math.min(year, row.to ?? year);
      return (
        <View key={`bond-${i}`} style={{ flexDirection: 'row', height: BOND_HEIGHT + 4, alignItems: 'center' }}>
          <View style={{ width: NAME_GUTTER, paddingRight: 10, alignItems: 'flex-end' }}>
            <Text style={mono(12.5, DEEP_AMBER)}>{row.note.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, height: BOND_HEIGHT }}>
            {/* the whole marriage, faint */}
            <View
              style={{
                position: 'absolute',
                left: x(row.from),
                width: Math.max(2, x(row.to ?? domainEnd) - x(row.from)),
                top: 1,
                height: BOND_HEIGHT - 2,
                backgroundColor: AMBER,
                opacity: 0.22,
              }}
            />
            {/* lived-so-far fill */}
            {year > row.from && (
              <View
                style={{
                  position: 'absolute',
                  left: x(row.from),
                  width: Math.max(0, x(Math.max(row.from, filledTo)) - x(row.from)),
                  top: 1,
                  height: BOND_HEIGHT - 2,
                  backgroundColor: AMBER,
                  shadowColor: INK,
                  shadowOpacity: 0.25,
                  shadowRadius: 2,
                  shadowOffset: { width: 0, height: 1 },
                }}
              />
            )}
          </View>
        </View>
      );
    }

    // Person row
    personOrdinal++;
    const isChild = row.role === 'child';
    const ribbonH = isChild ? CHILD_RIBBON : PARENT_RIBBON;
    const ink = sexInk(row.s);
    const end = endOf(row);
    const diedYoung = row.d !== null && row.d - row.b < 18;
    const faintEnd = row.d ?? domainEnd; // open ribbons run on, never sealed
    const solidEnd = end === null ? Math.min(year, faintEnd) : Math.min(year, end);
    const showAge = row.b <= year && (end === null ? year <= faintEnd : year <= end);
    const age = year - row.b;
    const approxAge = end === null && row.d === null && !row.living; // unknown death: age is a floor, not a fact

    return (
      <View key={row.id} style={{ flexDirection: 'row', height: ribbonH + ROW_PAD, alignItems: 'center' }}>
        <View style={{ width: NAME_GUTTER, paddingRight: 10, alignItems: 'flex-end' }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: isChild ? BrandFonts.serif.regular : BrandFonts.serif.semiBold,
              fontSize: 13.5,
              color: INK,
            }}
          >
            {row.n}
          </Text>
          <Text style={mono(12.5, INK_UNRECORDED)}>
            {row.b}–{row.d ?? (row.living ? '' : '?')}
            {diedYoung ? ` · ${ageWord(row.d! - row.b)}` : ''}
          </Text>
        </View>
        <View style={{ flex: 1, height: ribbonH }}>
          {/* whole life, faint */}
          <View
            style={{
              position: 'absolute',
              left: x(row.b),
              width: Math.max(2, x(faintEnd) - x(row.b)),
              top: 0,
              height: ribbonH,
              backgroundColor: diedYoung ? PAPER : ink,
              opacity: diedYoung ? 1 : 0.18,
              borderWidth: diedYoung ? 1 : 0,
              borderColor: ink,
            }}
          />
          {/* lived-so-far, solid — scrubbing fills the family in */}
          {year > row.b && (
            <View
              style={{
                position: 'absolute',
                left: x(row.b),
                width: Math.max(0, x(Math.max(row.b, solidEnd)) - x(row.b)),
                top: 0,
                height: ribbonH,
                backgroundColor: diedYoung ? 'rgba(176,116,31,0.14)' : ink,
                opacity: diedYoung ? 1 : 0.9,
                shadowColor: INK,
                shadowOpacity: diedYoung ? 0 : 0.3,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
              }}
            />
          )}
          {/* a short life is not a small one: closed by a single upright stroke */}
          {row.d !== null && (
            <View
              style={{
                position: 'absolute',
                left: x(row.d),
                width: diedYoung ? 2 : 0,
                top: -2,
                height: diedYoung ? ribbonH + 4 : 0,
                backgroundColor: ink,
              }}
            />
          )}
          {/* the child's own marriage: a tick, pale until the line arrives */}
          {row.m && (
            <Pressable
              disabled={!row.mfam}
              onPress={() => row.mfam && openStage(row.mfam)}
              style={{ position: 'absolute', left: x(row.m.y) - 1, top: -3, alignItems: 'flex-start' }}
              hitSlop={6}
            >
              <View
                style={{
                  width: 2,
                  height: ribbonH + 6,
                  backgroundColor: year >= row.m.y ? AMBER : 'rgba(176,116,31,0.3)',
                }}
              />
              <Text style={mono(12, year >= row.m.y ? DEEP_AMBER : INK_UNRECORDED)} numberOfLines={1}>
                m. {row.m.spouse.split(' ')[0]}
                {row.mfam ? ' →' : ''}
              </Text>
            </Pressable>
          )}
          {/* age at the reading line — having a number is the household's shape */}
          {showAge && (
            <View
              style={{
                position: 'absolute',
                left: Math.min(Math.max(x(year) - 11, 0), Math.max(chartWidth - 24, 0)),
                top: (ribbonH - 15) / 2,
                borderWidth: 1,
                borderColor: INK,
                backgroundColor: PAPER,
                paddingHorizontal: 3,
                height: 15,
                justifyContent: 'center',
              }}
            >
              <Text style={mono(12.5, INK)}>
                {approxAge ? '~' : ''}
                {age}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  });
  void personOrdinal;

  // Tick step breathes with the span so labels never collide.
  const span = domainEnd - domainStart;
  const tickStep = span > 240 ? 50 : span > 120 ? 20 : 10;
  const decadeTicks: number[] = [];
  for (let yr = Math.ceil(domainStart / tickStep) * tickStep; yr <= domainEnd; yr += tickStep)
    decadeTicks.push(yr);

  return (
    <View style={{ marginBottom: 8 }}>
      <RecordText eyebrow accent>
        The Family Graph
      </RecordText>

      {/* Household picker — top-level families only */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {stages.topLevel.map((option) => {
          const active = option.key === stage.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => openStage(option.key)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderWidth: 1,
                borderColor: active ? AMBER : C.rule,
                backgroundColor: active ? AMBER : 'transparent',
              }}
            >
              <Text style={mono(13, active ? PAPER : INK)}>{option.label.toUpperCase()}</Text>
            </Pressable>
          );
        })}
        {!stages.topLevel.some((option) => option.key === stage.key) && (
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: AMBER }}>
            <Text style={mono(13, PAPER)}>{stage.label.toUpperCase()}</Text>
          </View>
        )}
        <Pressable
          onPress={() => router.push('/register' as never)}
          style={{ paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: DEEP_AMBER, borderStyle: 'dashed' as never }}
        >
          <Text style={mono(13, DEEP_AMBER)}>THE REGISTER — ALL {stages.byKey.size} ›</Text>
        </Pressable>
      </View>

      {/* The stage */}
      <View
        style={{
          marginTop: 12,
          backgroundColor: PAPER,
          borderWidth: 1,
          borderColor: C.rule,
          padding: 20,
          shadowColor: INK,
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        <Text style={{ fontFamily: BrandFonts.serif.semiBold, fontSize: 21, color: INK }}>
          {stage.title}
        </Text>
        <Text style={{ ...mono(13, INK_UNRECORDED), marginTop: 3 }}>{stage.sub.toUpperCase()}</Text>

        <View style={{ marginTop: 16 }}>
          {/* chart area with washes + reading line behind/above the rows */}
          <View style={{ position: 'relative' }}>
            <View
              style={{ position: 'absolute', left: NAME_GUTTER, right: 0, top: 0, bottom: 0 }}
              onLayout={(event: LayoutChangeEvent) => setChartWidth(event.nativeEvent.layout.width)}
            >
              {/* decade grid */}
              {decadeTicks.map((yr) => (
                <View
                  key={yr}
                  style={{
                    position: 'absolute',
                    left: x(yr),
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: 'rgba(26,24,21,0.06)',
                  }}
                />
              ))}
              {/* history washes — absences read against history */}
              {showEvents &&
                HISTORICAL_EVENTS.filter((e) => e.endYear >= domainStart && e.startYear <= domainEnd)
                  .slice(0, 40)
                  .map((e) => (
                    <View
                      key={e.id}
                      style={{
                        position: 'absolute',
                        left: x(Math.max(e.startYear, domainStart)),
                        width: Math.max(2, x(Math.min(e.endYear, domainEnd)) - x(Math.max(e.startYear, domainStart))),
                        top: 0,
                        bottom: 14,
                        backgroundColor: 'rgba(176,116,31,0.06)',
                        borderLeftWidth: 1,
                        borderLeftColor: 'rgba(176,116,31,0.25)',
                      }}
                    >
                      <Text numberOfLines={1} style={{ ...mono(12, DEEP_AMBER), opacity: 0.8 }}>
                        {e.name}
                      </Text>
                    </View>
                  ))}
              {showPresidents &&
                PRESIDENCIES.filter((p) => p.end >= domainStart && p.start <= domainEnd).map((p, idx) => (
                  <View
                    key={`${p.name}-${p.start}`}
                    style={{
                      position: 'absolute',
                      left: x(Math.max(p.start, domainStart)),
                      width: Math.max(1, x(Math.min(p.end, domainEnd)) - x(Math.max(p.start, domainStart))),
                      top: 0,
                      bottom: 0,
                      backgroundColor: idx % 2 ? 'rgba(26,24,21,0.03)' : 'transparent',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <Text numberOfLines={1} style={mono(12, INK_UNRECORDED)}>
                      {p.name}
                    </Text>
                  </View>
                ))}
              {/* the reading line */}
              <View
                style={{
                  position: 'absolute',
                  left: x(year),
                  top: -18,
                  bottom: 0,
                  width: 1.5,
                  backgroundColor: AMBER,
                  zIndex: 5,
                }}
              >
                <View style={{ position: 'absolute', top: -2, left: -16, backgroundColor: AMBER, paddingHorizontal: 4 }}>
                  <Text style={mono(13, PAPER)}>{year}</Text>
                </View>
              </View>
            </View>

            <View style={{ paddingTop: 18 }}>{rowNodes}</View>
          </View>

          {/* axis */}
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <View style={{ width: NAME_GUTTER }} />
            <View style={{ flex: 1, height: 16, borderTopWidth: 1, borderTopColor: C.rule }}>
              {decadeTicks.map((yr) => (
                <Text key={yr} style={{ ...mono(12, INK_UNRECORDED), position: 'absolute', left: x(yr) - 12, top: 2 }}>
                  {yr}
                </Text>
              ))}
            </View>
          </View>
        </View>

        {/* scrub track + controls */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <Pressable
            onPress={toggleSweep}
            style={{ borderWidth: 1, borderColor: AMBER, backgroundColor: sweeping ? AMBER : 'transparent', paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={mono(13, sweeping ? PAPER : DEEP_AMBER)}>
              {sweeping ? 'HOLD' : 'SWEEP THE YEARS'}
            </Text>
          </Pressable>
          <View
            style={{ flex: 1, height: 26, justifyContent: 'center' }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(event) => {
              stopSweep();
              const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / Math.max(1, chartWidth)));
              setYear(Math.round(stage.scrubStart + ratio * (stage.scrubEnd - stage.scrubStart)));
            }}
            onResponderMove={(event) => {
              const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / Math.max(1, chartWidth)));
              setYear(Math.round(stage.scrubStart + ratio * (stage.scrubEnd - stage.scrubStart)));
            }}
          >
            <View style={{ height: 3, backgroundColor: C.rule }} />
            <View
              style={{
                position: 'absolute',
                left: `${((year - stage.scrubStart) / Math.max(1, stage.scrubEnd - stage.scrubStart)) * 100}%`,
                width: 13,
                height: 13,
                marginLeft: -6,
                borderRadius: 7,
                backgroundColor: AMBER,
                borderWidth: 1.5,
                borderColor: PAPER,
                shadowColor: INK,
                shadowOpacity: 0.3,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
              }}
            />
          </View>
          <Text style={mono(13, INK_UNRECORDED)}>
            {stage.scrubStart}–{stage.scrubEnd}
          </Text>
        </View>

        {/* overlays + legend */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
          {(
            [
              ['World events', showEvents, () => setShowEvents((s) => !s)],
              ['Presidents', showPresidents, () => setShowPresidents((s) => !s)],
            ] as const
          ).map(([label, on, toggle]) => (
            <Pressable key={label} onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View
                style={{ width: 11, height: 11, borderWidth: 1, borderColor: DEEP_AMBER, backgroundColor: on ? AMBER : 'transparent' }}
              />
              <Text style={mono(12.5, INK)}>{label}</Text>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          {(
            [
              ['men', INK_MEN],
              ['women', INK_WOMEN],
              ['sex not recorded', INK_UNRECORDED],
            ] as const
          ).map(([label, color]) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 14, height: 7, backgroundColor: color }} />
              <Text style={mono(12.5, INK_UNRECORDED)}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Detail band — directly beneath, never beside, so it stays in view */}
      <View
        style={{
          flexDirection: 'row',
          gap: 24,
          marginTop: 10,
          backgroundColor: PAPER,
          borderWidth: 1,
          borderColor: C.rule,
          padding: 16,
        }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <RecordText eyebrow muted>
            In {year}
          </RecordText>
          <Text style={mono(13.5, INK)}>{marriageState}</Text>
          <Text style={mono(13.5, INK)}>
            {atHome.length} {atHome.length === 1 ? 'child' : 'children'} at home
          </Text>
          {gone.length > 0 && (
            <Text style={mono(13, INK_UNRECORDED)} numberOfLines={2}>
              gone: {gone.map((p) => p.n.split(' ')[0]).join(', ')}
            </Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <RecordText eyebrow muted>
            The whole of it
          </RecordText>
          <Text style={mono(13.5, INK)}>
            {stage.scrubStart}–{stage.scrubEnd} · {stage.scrubEnd - stage.scrubStart} years
          </Text>
          <Text style={mono(13.5, INK)}>{childYears} years with a child under eighteen</Text>
          <Text style={mono(13, INK_UNRECORDED)}>
            {children.length} born{lostYoung.length > 0 ? ` · ${lostYoung.length} lost young` : ''}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <RecordText eyebrow muted>
            Onward
          </RecordText>
          {marriedChildren.slice(0, 3).map((child) => (
            <Pressable key={child.id} disabled={!child.mfam} onPress={() => child.mfam && openStage(child.mfam)}>
              <Text style={mono(13, child.mfam ? DEEP_AMBER : INK_UNRECORDED)} numberOfLines={1}>
                {child.mfam ? '→ ' : ''}
                {child.n.split(' ')[0]} m. {child.m!.spouse.split(' ')[0]}, {child.m!.y}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: stage.key } })}>
            <Text style={mono(13, DEEP_AMBER)}>Open {persons.find((p) => p.role === 'head')?.n.split(' ')[0]} ›</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
