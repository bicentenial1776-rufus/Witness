import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { GeographyIndex } from '@witness/core/query';
import type { HistoricalEvent, ShelfEntry } from '@witness/core/history';

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

function eventYears(event: HistoricalEvent): string {
  return event.startYear === event.endYear
    ? String(event.startYear)
    : `${event.startYear}–${event.endYear}`;
}

/**
 * Explore as a broadsheet, options mirroring the phone exactly (Rufus,
 * 2026-07-24): the curated shelf, The Library, and the Ways In — in the
 * broadsheet's clothes. Anything that answers with a list of people (a
 * shelf moment, a searched moment, an era) opens the who-was-alive
 * drawer; a person in the drawer goes to their page.
 */
export function ExploreBroadsheet({
  index,
  shelf,
  eras,
  naraCounts,
  treeId,
  searchPeople,
  searchMoments,
  search,
  onSearch,
}: {
  index: GeographyIndex;
  shelf: ShelfEntry[] | null;
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

  const waysIn: { title: string; detail: string; path: string }[] = [
    {
      title: 'In the National Archives',
      detail: naraCounts
        ? `${naraCounts.pending} to review · ${naraCounts.confirmed} confirmed`
        : 'Federal records matched to your ancestors, awaiting your judgment',
      path: '/archives',
    },
    {
      title: 'Where your family lived',
      detail: 'Every state, province, and country in your tree',
      path: '/places',
    },
    {
      title: 'Where your family began',
      detail: 'The earliest places your tree reaches back to',
      path: '/origins',
    },
    {
      title: 'Migration paths',
      detail: 'The moves your family made, generation by generation',
      path: '/migrations',
    },
    {
      title: 'Ocean crossings',
      detail: 'Ancestors who crossed the Atlantic or Pacific',
      path: '/crossings',
    },
    {
      title: 'Kindred couples',
      detail: 'Spouses who shared an ancestor — however far back',
      path: '/kindred',
    },
  ];

  return (
    <>
    <PageShell
      masthead={
        <Masthead
          title="Explore"
          metaMono={`${index.individuals.size.toLocaleString()} PEOPLE · ${index.events.length.toLocaleString()} EVENTS`}
          metaCaption="Your family's history, every way in"
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
            <Text
              onPress={() => router.push({ pathname: '/research', params: { treeId } })}
              style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 14, color: C.accent, marginTop: 2 }}
            >
              Turn one into a brief →
            </Text>
          </MarginPanel>
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
            <LedgerRow key={event.id} onPress={() => setDrawerEvent(event.id)}>
              <Serif size={19}>{event.name}</Serif>
              <View style={{ flex: 1 }} />
              <RecordText muted>{eventYears(event)}</RecordText>
            </LedgerRow>
          ))}
        </View>
      ) : (
        <>
          <SectionBreak label="From your family’s history" />
          {shelf === null ? (
            <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 15, color: C.inkMuted }}>
              Reading the tree…
            </Text>
          ) : (
            <View>
              {shelf.map((entry, i) => (
                <LedgerRow key={entry.event.id} first={i === 0} onPress={() => setDrawerEvent(entry.event.id)}>
                  <View style={{ flex: 1 }}>
                    {entry.anniversaryLabel && (
                      <RecordText eyebrow accent>
                        {entry.anniversaryLabel}
                      </RecordText>
                    )}
                    <Serif>{entry.event.name}</Serif>
                    <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14, color: C.inkMuted, marginTop: 2 }}>
                      {eventYears(entry.event)} · {entry.event.region} — {entry.event.summary}
                    </Text>
                  </View>
                  <RecordText accent>{entry.aliveCount.toLocaleString()} ALIVE ›</RecordText>
                </LedgerRow>
              ))}
            </View>
          )}

          <SectionBreak label="The Library" />
          <LedgerRow first onPress={() => router.push('/library')}>
            <View style={{ flex: 1 }}>
              <Serif>Every question, with your answers</Serif>
              <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14, color: C.inkMuted, marginTop: 2 }}>
                Lives in wartime, the world&rsquo;s great events, long lives &amp; short, where they
                lived — each question counted against your own tree.
              </Text>
            </View>
            <RecordText accent>BROWSE ›</RecordText>
          </LedgerRow>

          <SectionBreak label="Ways in" />
          <View>
            {waysIn.map((way, i) => (
              <LedgerRow
                key={way.path}
                first={i === 0}
                onPress={() => router.push({ pathname: way.path as never, params: { treeId } } as never)}
              >
                <View style={{ flex: 1 }}>
                  <Serif>{way.title}</Serif>
                  <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14, color: C.inkMuted, marginTop: 2 }}>
                    {way.detail}
                  </Text>
                </View>
                <RecordText muted>›</RecordText>
              </LedgerRow>
            ))}
          </View>

        </>
      )}
    </PageShell>
      {drawerEvent && (
        <QueryDrawer eventId={drawerEvent} treeId={treeId} onClose={() => setDrawerEvent(null)} />
      )}
    </>
  );
}
