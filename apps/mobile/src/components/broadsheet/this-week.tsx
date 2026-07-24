import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { DigestEntry, WeeklyDigest } from '@witness/core/query';

import { RecordText } from '@/components/record-text';
import { Broadsheet, BrandFonts } from '@/constants/theme';

import { DataBar, LedgerRow, MarginPanel } from './ledger';
import { Masthead, PageShell, SectionBreak } from './page-shell';

const C = Broadsheet.color;
const T = Broadsheet.type;

export interface LivedThroughLine {
  eventId: string;
  year: number;
  name: string;
  age: number;
}

export interface DayCount {
  label: string;
  count: number;
}

function mono(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('en-US', opts).toUpperCase();
}

function anniversaryLine(entry: DigestEntry): string {
  const verb = entry.eventType === 'birth' ? 'Born' : 'Died';
  return entry.yearsAgo !== null
    ? `${verb} ${entry.yearsAgo} years ago${entry.year !== null ? ` — ${entry.year}` : ''}`
    : `${verb} ${entry.year ?? ''}`;
}

/** Serif narrative with an orange drop cap on the first letter. */
function DropCapParagraph({ text }: { text: string }) {
  const first = text.charAt(0);
  const rest = text.slice(1);
  return (
    <Text
      style={{
        fontFamily: BrandFonts.sans.regular,
        fontSize: 20,
        lineHeight: 32,
        color: C.inkSecondary,
        maxWidth: 640,
      }}
    >
      <Text style={{ fontFamily: BrandFonts.serif.bold, fontSize: 52, lineHeight: 52, color: C.accent }}>
        {first}
      </Text>
      {rest}
    </Text>
  );
}

/**
 * This Week as a broadsheet (redesign §3.1): one featured life at full
 * display scale, the rest of the week as ledger rows, the day-count
 * ledger and "while they lived" panel in the margin.
 */
export function ThisWeekBroadsheet({
  digest,
  relationships,
  topNote,
  dayCounts,
  livedThrough,
  treeId,
}: {
  digest: WeeklyDigest;
  relationships: Map<string, string>;
  topNote: string | null;
  dayCounts: DayCount[];
  livedThrough: LivedThroughLine[];
  treeId: string;
}) {
  const featured = digest.days[0];
  const rest = digest.days.slice(1);
  const featuredIds = new Set(digest.entries.map((e) => e.eventId));
  const maxDayCount = Math.max(1, ...dayCounts.map((d) => d.count));
  const firstName = featured?.fullName.split(' ')[0];

  const open = (entry: DigestEntry) =>
    router.push({ pathname: '/ancestor/[id]', params: { id: entry.individualId } });

  return (
    <PageShell
      masthead={
        <Masthead
          title="This Week in Your Family"
          metaMono={`${mono(digest.weekStart, { month: 'short', day: 'numeric' })} – ${mono(digest.weekEnd, { month: 'short', day: 'numeric', year: 'numeric' })}`}
          metaCaption={`${digest.days.length} chosen from ${digest.candidateCount} anniversaries`}
        />
      }
      margin={
        <>
          <View style={{ gap: 9 }}>
            <RecordText eyebrow muted>
              The week&rsquo;s ledger
            </RecordText>
            {dayCounts.map((day) => (
              <View key={day.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <RecordText numberOfLines={1} style={{ width: 86 }}>{day.label}</RecordText>
                <DataBar value={day.count} max={maxDayCount} leader={day.count === maxDayCount} />
                <RecordText muted style={{ width: 24, textAlign: 'right' }}>
                  {day.count}
                </RecordText>
              </View>
            ))}
          </View>

          {featured && livedThrough.length > 0 && (
            <MarginPanel>
              <RecordText eyebrow muted>
                While {featured.sex === 'F' ? 'she' : featured.sex === 'M' ? 'he' : 'they'} lived
              </RecordText>
              {livedThrough.map((line) => (
                <Pressable
                  key={line.eventId}
                  onPress={() =>
                    router.push({ pathname: '/query/[eventId]', params: { eventId: line.eventId, treeId } })
                  }
                  style={{ gap: 1 }}
                >
                  <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 15, color: C.inkSecondary }}>
                    <RecordText>{line.year}</RecordText>
                    {'  '}
                    {line.name}
                  </Text>
                  <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13, color: C.inkMuted }}>
                    {firstName} was {line.age}
                  </Text>
                </Pressable>
              ))}
              <Text
                style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 14, color: C.accent, marginTop: 4 }}
                onPress={() =>
                  livedThrough[0] &&
                  router.push({
                    pathname: '/query/[eventId]',
                    params: { eventId: livedThrough[0].eventId, treeId },
                  })
                }
              >
                Who else was alive →
              </Text>
            </MarginPanel>
          )}
        </>
      }
    >
      {featured ? (
        <View>
          <RecordText eyebrow accent>
            ✦ Featured · {mono(featured.occursOn, { weekday: 'long', month: 'long', day: 'numeric' })}
          </RecordText>
          <Pressable onPress={() => open(featured)}>
            <Text
              style={{
                fontFamily: BrandFonts.serif.bold,
                fontSize: T.featuredName,
                lineHeight: T.featuredName * 1.06,
                color: C.ink,
                marginTop: 10,
              }}
            >
              {featured.fullName}
            </Text>
          </Pressable>
          {relationships.get(featured.individualId) && (
            <Text
              style={{ fontFamily: BrandFonts.serif.italic, fontSize: 21, color: C.inkSecondary, marginTop: 6 }}
            >
              Your {relationships.get(featured.individualId)}
            </Text>
          )}
          <RecordText style={{ marginTop: 12 }}>
            {featured.birthYear ?? '?'} – {featured.deathYear ?? '?'} ·{' '}
            {featured.eventType === 'birth' ? 'Born' : 'Died'} {featured.yearsAgo ?? '?'} years ago
          </RecordText>
          {featured.placeRaw && (
            <View style={{ borderTopWidth: 1, borderTopColor: C.rule, marginTop: 12, paddingTop: 10, maxWidth: 640 }}>
              <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 18, color: C.inkSecondary }}>
                {featured.placeRaw}
              </Text>
            </View>
          )}
          {topNote && (
            <View style={{ marginTop: 18 }}>
              <DropCapParagraph text={topNote} />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 26, marginTop: 20 }}>
            <Text
              style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 17, color: C.accent }}
              onPress={() => open(featured)}
            >
              {firstName ? `${firstName}’s full story →` : 'Their full story →'}
            </Text>
            <Text
              style={{ fontFamily: BrandFonts.sans.regular, fontSize: 17, color: C.accent }}
              onPress={() => router.push('/map')}
            >
              See the map
            </Text>
          </View>
        </View>
      ) : (
        <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: T.body, color: C.inkSecondary }}>
          A quiet week — no dated anniversaries in your tree fall in the next seven days.
        </Text>
      )}

      {rest.length > 0 && (
        <>
          <SectionBreak label="Also this week" />
          <View>
            {rest.map((entry, index) => (
              <LedgerRow key={entry.eventId} first={index === 0} onPress={() => open(entry)}>
                <RecordText style={{ width: 118 }}>
                  {featuredIds.has(entry.eventId) ? '✦ ' : ''}
                  {mono(entry.occursOn, { weekday: 'short', month: 'numeric', day: 'numeric' })}
                </RecordText>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: T.ledgerName, color: C.ink }}>
                    {entry.fullName}
                  </Text>
                  <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14.5, color: C.inkMuted, marginTop: 2 }}>
                    {anniversaryLine(entry)}
                    {entry.placeRaw ? ` · ${entry.placeRaw.split(',')[0]}` : ''}
                  </Text>
                </View>
                {relationships.get(entry.individualId) && (
                  <Text style={{ fontFamily: BrandFonts.serif.italic, fontSize: 16, color: C.inkMuted }}>
                    your {relationships.get(entry.individualId)}
                  </Text>
                )}
              </LedgerRow>
            ))}
          </View>
        </>
      )}
    </PageShell>
  );
}
