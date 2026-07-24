import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { GeographyIndex } from '@witness/core/query';
import { migrationPaths, placesWithActivity } from '@witness/core/query';
import type { KindredCouple } from '@witness/core/family';
import type { HistoricalEvent } from '@witness/core/history';

import { RecordText } from '@/components/record-text';
import { Broadsheet, BrandFonts } from '@/constants/theme';

import { DataBar, LedgerRow, MarginPanel } from './ledger';
import { Masthead, PageShell, SectionBreak } from './page-shell';
import { QueryDrawer } from './query-drawer';

const C = Broadsheet.color;
const T = Broadsheet.type;

export interface EraCount {
  event: HistoricalEvent;
  aliveCount: number;
}

interface PersonHit {
  id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
}

function Serif({ size = T.ledgerName, color = C.ink, children, ...rest }: React.ComponentProps<typeof Text> & { size?: number; color?: string }) {
  return (
    <Text {...rest} style={{ fontFamily: BrandFonts.serif.regular, fontSize: size, color }}>
      {children}
    </Text>
  );
}

function SectionLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text
      onPress={onPress}
      style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 15, color: C.accent, marginTop: 10 }}
    >
      {label}
    </Text>
  );
}

/**
 * Explore as a broadsheet (redesign §3.2): every section previews its own
 * contents — ranked place bars, the migration ledger, kindred couples with
 * the ∞ spine — with eras, the century histogram, and loose threads in
 * the margin. The four self-describing cards are gone.
 */
export function ExploreBroadsheet({
  index,
  kindred,
  eras,
  naraCounts,
  treeId,
  searchPeople,
  searchMoments,
  search,
  onSearch,
}: {
  index: GeographyIndex;
  kindred: KindredCouple[];
  eras: EraCount[];
  naraCounts: { pending: number; confirmed: number } | null;
  treeId: string;
  searchPeople: PersonHit[];
  searchMoments: HistoricalEvent[];
  search: string;
  onSearch: (value: string) => void;
}) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [drawerEvent, setDrawerEvent] = useState<string | null>(null);
  const searching = search.trim().length > 1;

  const topPlaces = useMemo(() => placesWithActivity(index).slice(0, 8), [index]);
  const maxPlace = topPlaces[0]?.eventCount ?? 1;
  const totalPlaces = useMemo(
    () => [...index.places.values()].filter((p) => p.latitude !== null).length,
    [index],
  );

  const paths = useMemo(() => migrationPaths(index), [index]);
  const topPaths = paths.slice(0, 5);
  const maxPath = topPaths[0]?.count ?? 1;

  const centuries = useMemo(() => {
    const counts = new Map<number, number>();
    for (const person of index.individuals.values()) {
      if (person.birth_year === null) continue;
      const century = Math.floor(person.birth_year / 100) * 100;
      counts.set(century, (counts.get(century) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).filter(([c]) => c >= 1500);
  }, [index]);
  const maxCentury = Math.max(1, ...centuries.map(([, n]) => n));

  const looseThreads = useMemo(() => {
    const placed = new Set<string>();
    for (const event of index.events) if (event.placeId) placed.add(event.individualId);
    let datedNoPlace = 0;
    const surnameCounts = new Map<string, number>();
    for (const person of index.individuals.values()) {
      if (person.birth_year !== null && !placed.has(person.id)) datedNoPlace++;
      if (person.surname) surnameCounts.set(person.surname, (surnameCounts.get(person.surname) ?? 0) + 1);
    }
    const orphanSurnames = [...surnameCounts.values()].filter((n) => n === 1).length;
    return { datedNoPlace, orphanSurnames };
  }, [index]);

  return (
    <>
    <PageShell
      masthead={
        <Masthead
          title="Explore"
          metaMono={`${index.individuals.size.toLocaleString()} PEOPLE · ${index.events.length.toLocaleString()} EVENTS`}
          metaCaption="Every section previews what it holds"
        />
      }
      margin={
        <>
          <View style={{ gap: 10 }}>
            <RecordText eyebrow muted>
              Who was alive during…
            </RecordText>
            {eras.map(({ event, aliveCount }) => (
              <Pressable
                key={event.id}
                onPress={() => setDrawerEvent(event.id)}
                style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}
              >
                <RecordText style={{ width: 44, flexShrink: 0 }}>{event.startYear}</RecordText>
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontFamily: BrandFonts.sans.regular, fontSize: 14.5, color: C.inkSecondary }}
                >
                  {event.name}
                </Text>
                <RecordText accent>{aliveCount}</RecordText>
              </Pressable>
            ))}
          </View>

          <View style={{ gap: 8 }}>
            <RecordText eyebrow muted>
              People per century
            </RecordText>
            {centuries.map(([century, count]) => (
              <View key={century} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <RecordText numberOfLines={1} style={{ width: 46, flexShrink: 0 }}>
                  {century / 100 + 1}c
                </RecordText>
                <DataBar value={count} max={maxCentury} leader={count === maxCentury} />
                <RecordText muted numberOfLines={1} style={{ width: 56, flexShrink: 0, textAlign: 'right' }}>
                  {count.toLocaleString()}
                </RecordText>
              </View>
            ))}
          </View>

          <MarginPanel>
            <RecordText eyebrow muted>
              Loose threads
            </RecordText>
            <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14.5, color: C.inkSecondary }}>
              {looseThreads.datedNoPlace.toLocaleString()} people carry a year but no place.
            </Text>
            <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14.5, color: C.inkSecondary }}>
              {looseThreads.orphanSurnames} surnames appear exactly once.
            </Text>
            {naraCounts && (naraCounts.pending > 0 || naraCounts.confirmed > 0) && (
              <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14.5, color: C.inkSecondary }}>
                {naraCounts.pending} National Archives finds await your judgment.
              </Text>
            )}
            <Text
              onPress={() => router.push({ pathname: '/archives', params: { treeId } })}
              style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 14, color: C.accent, marginTop: 2 }}
            >
              Open the archives →
            </Text>
          </MarginPanel>

          <View style={{ gap: 7 }}>
            <RecordText eyebrow muted>
              Also
            </RecordText>
            {(
              [
                ['The Library', '/library'],
                ['Moments in history', '/library/moments'],
                ['The Ascent', '/ascent'],
                ['Where your family began', '/origins'],
                ['Ocean crossings', '/crossings'],
              ] as const
            ).map(([label, path]) => (
              <Text
                key={path}
                onPress={() => router.push({ pathname: path as never, params: { treeId } } as never)}
                style={{ fontFamily: BrandFonts.sans.regular, fontSize: 15, color: C.accent }}
              >
                {label} ›
              </Text>
            ))}
          </View>
        </>
      }
    >
      {/* Search as a broadsheet line, not an input box. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 16,
          borderBottomWidth: 1,
          borderBottomColor: searchFocused ? C.ink : C.rule,
          paddingBottom: 8,
        }}
      >
        <RecordText eyebrow accent>
          Search
        </RecordText>
        <TextInput
          value={search}
          onChangeText={onSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="a name, a place, a year — “Elizabeth Dane”, “Mayflower”, “1675”"
          placeholderTextColor={C.inkFaint}
          style={{
            flex: 1,
            fontFamily: BrandFonts.serif.italic,
            fontSize: 19,
            color: C.ink,
            paddingVertical: 2,
            ...({ outlineStyle: 'none' } as object),
          }}
        />
      </View>

      {searching ? (
        <View style={{ marginTop: 8 }}>
          {searchPeople.length === 0 && searchMoments.length === 0 && (
            <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: T.body, color: C.inkMuted, marginTop: 14 }}>
              Nothing matches — try a broader word.
            </Text>
          )}
          {searchPeople.map((person, i) => (
            <LedgerRow
              key={person.id}
              first={i === 0}
              onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: person.id } })}
            >
              <Serif>{person.full_name}</Serif>
              <View style={{ flex: 1 }} />
              <RecordText muted>
                {person.birth_year ?? '?'} – {person.death_year ?? '?'}
              </RecordText>
            </LedgerRow>
          ))}
          {searchMoments.map((event) => (
            <LedgerRow
              key={event.id}
              onPress={() =>
                router.push({ pathname: '/query/[eventId]', params: { eventId: event.id, treeId } })
              }
            >
              <Serif size={19}>{event.name}</Serif>
              <View style={{ flex: 1 }} />
              <RecordText muted>
                {event.startYear === event.endYear ? event.startYear : `${event.startYear}–${event.endYear}`}
              </RecordText>
            </LedgerRow>
          ))}
        </View>
      ) : (
        <>
          <SectionBreak label="Where your family lived" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 40 }}>
            {topPlaces.map(({ place, eventCount }) => (
              <Pressable
                key={place.id}
                onPress={() =>
                  router.push({ pathname: '/place/[placeId]', params: { placeId: place.id, treeId } })
                }
                style={{ width: '45%', minWidth: 260, marginBottom: 14 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Serif size={20}>{place.parts[0] ?? place.raw}</Serif>
                  <RecordText muted>{eventCount}</RecordText>
                </View>
                <View style={{ marginTop: 5 }}>
                  <DataBar value={eventCount} max={maxPlace} leader={eventCount === maxPlace} />
                </View>
              </Pressable>
            ))}
          </View>
          <SectionLink
            label={`All ${totalPlaces.toLocaleString()} places →`}
            onPress={() => router.push({ pathname: '/places', params: { treeId } })}
          />

          <SectionBreak label="Migration paths" />
          <View>
            {topPaths.map((path, i) => (
              <LedgerRow key={`${path.from}-${path.to}`} first={i === 0}>
                <View style={{ flex: 1 }}>
                  <Serif>
                    {path.from} → {path.to}
                  </Serif>
                  <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14, color: C.inkMuted, marginTop: 2 }}>
                    {path.medianYear ? `peak c. ${path.medianYear}` : 'years unrecorded'}
                    {path.movers[0] ? ` · e.g. ${path.movers[0].name}` : ''}
                  </Text>
                </View>
                <View style={{ width: 110 }}>
                  <DataBar value={path.count} max={maxPath} leader={path.count === maxPath} />
                </View>
                <RecordText style={{ width: 34, textAlign: 'right' }}>{path.count}</RecordText>
              </LedgerRow>
            ))}
          </View>
          <SectionLink
            label={`All ${paths.length} paths →`}
            onPress={() => router.push({ pathname: '/migrations', params: { treeId } })}
          />

          {kindred.length > 0 && (
            <>
              <SectionBreak label="Kindred couples" />
              <View>
                {kindred.map((couple, i) => (
                  <LedgerRow key={`${couple.spouseA.id}-${couple.spouseB.id}`} first={i === 0}>
                    <View style={{ flex: 1 }}>
                      <Serif>
                        {couple.spouseA.name} <Text style={{ color: C.accent }}>∞</Text> {couple.spouseB.name}
                      </Serif>
                      <RecordText muted style={{ marginTop: 3 }}>
                        {couple.spouseA.birthYear ?? '?'}–{couple.spouseA.deathYear ?? '?'} ·{' '}
                        {couple.spouseB.birthYear ?? '?'}–{couple.spouseB.deathYear ?? '?'}
                      </RecordText>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <RecordText accent>{couple.label}</RecordText>
                      <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13.5, color: C.inkMuted }}>
                        via {couple.commonAncestor.name}
                      </Text>
                    </View>
                  </LedgerRow>
                ))}
              </View>
              <SectionLink label="All kindred couples →" onPress={() => router.push({ pathname: '/kindred', params: { treeId } })} />
            </>
          )}
        </>
      )}
    </PageShell>
      {drawerEvent && (
        <QueryDrawer eventId={drawerEvent} treeId={treeId} onClose={() => setDrawerEvent(null)} />
      )}
    </>
  );
}
