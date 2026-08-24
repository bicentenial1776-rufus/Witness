// Inline family chart for the story view (witness-family-context-spec.md §5),
// redrawn 2026-08-18 as GENERATION BANDS after the radial-lite draft read as
// abstract (initials-only circles needed a legend to decode). Two bands split
// by time: the parents' generation above — the couple inside an accent
// hairline tie, aunts/uncles seated beside THEIR OWN sibling when the record
// says which side (via_parent_id), unplaced ones at the right — and the
// subject's generation below, the sibship in birth order with the subject
// lit. Squared tiles, hairline rules, names readable on every node; plain
// flexbox, no trig, no canvas, both carriers.
//
// Tap a node: has_story navigates to that person's Portrait (where their
// story lives); no story shows the lightweight fact card below the chart —
// never a dead node. The subject is not tappable (you are already here).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { RecordText } from '@/components/record-text';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { RelativeFact } from '@witness/core/family';

interface ChartPerson {
  id: string;
  name: string;
  relationship: string;
  birth_year?: number | null;
  death_year?: number | null;
  has_story?: boolean;
  living?: boolean;
  proximity_bucket?: RelativeFact['proximity_bucket'];
}

const PROXIMITY_PHRASE: Record<string, string> = {
  same_town: 'lived in the same town',
  same_county: 'lived in the same county',
  within_100mi: 'lived within 100 miles',
  elsewhere: 'lived far apart',
};

/** Band caps: enough family to read the shape, never a wall of tiles. */
const MAX_SIBLINGS = 8;
const MAX_AUNTS_UNCLES = 8;

/** Show/hide is a device preference, remembered across stories. */
const CHART_HIDDEN_KEY = 'witness.family-chart-hidden';

function givenName(name: string): string {
  return name.split(' ').filter(Boolean)[0] ?? name;
}

function Tile({
  person,
  small,
  lit,
  onPress,
  theme,
}: {
  person: ChartPerson;
  small?: boolean;
  /** The subject's own tile — accent-lit, not tappable. */
  lit?: boolean;
  onPress?: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const accented = lit || person.has_story;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${person.name}, ${person.relationship}`}
      style={{
        borderWidth: lit ? 2 : person.has_story ? 1.5 : 1,
        borderColor: accented ? theme.accent : theme.border,
        backgroundColor: theme.backgroundElement,
        paddingVertical: small ? 5 : 7,
        paddingHorizontal: small ? 7 : 9,
        alignItems: 'center',
        gap: 1,
        maxWidth: 96,
      }}
    >
      <ThemedText
        numberOfLines={1} maxFontSizeMultiplier={1.3}
        style={{
          fontFamily: Fonts.serif,
          fontSize: small ? 13 : 15,
          lineHeight: small ? 17 : 19,
          color: accented ? theme.accent : theme.text,
        }}
      >
        {givenName(person.name)}
      </ThemedText>
      <RecordText muted style={{ fontSize: 12.5 }}>
        {person.birth_year ?? '·'}
      </RecordText>
    </Pressable>
  );
}

export function PedigreeChart({
  subject,
  parents,
  relatives,
  onOpenPortrait,
}: {
  subject: { id: string; name: string; birth_year?: number | null };
  parents: ChartPerson[];
  relatives: RelativeFact[];
  onOpenPortrait: (personId: string) => void;
}) {
  const theme = useTheme();
  const [factCard, setFactCard] = useState<ChartPerson | null>(null);
  // null = still reading the preference; render nothing that would jump.
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CHART_HIDDEN_KEY)
      .then((value) => setHidden(value === '1'))
      .catch(() => setHidden(false));
  }, []);

  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    setFactCard(null);
    AsyncStorage.setItem(CHART_HIDDEN_KEY, next ? '1' : '0').catch(() => {});
  };

  const factOf = (r: RelativeFact): ChartPerson => ({
    id: r.person_id,
    name: r.name,
    relationship: r.relationship,
    birth_year: r.birth_year ?? null,
    death_year: r.death_year ?? null,
    has_story: r.has_story,
    living: r.living,
    proximity_bucket: r.proximity_bucket,
  });

  const tap = (person: ChartPerson) => {
    if (person.has_story) onOpenPortrait(person.id);
    else setFactCard(person);
  };

  const byBirth = (a: { birth_year?: number | null }, b: { birth_year?: number | null }) =>
    (a.birth_year ?? 9999) - (b.birth_year ?? 9999);

  // The sibship, subject seated among them in birth order.
  const siblings = relatives.filter((r) => r.relationship === 'sibling');
  const shownSiblings = siblings.slice(0, MAX_SIBLINGS);
  const subjectRow: (ChartPerson & { isSubject?: boolean })[] = [
    ...shownSiblings.map(factOf),
    {
      id: subject.id,
      name: subject.name,
      relationship: 'this story',
      birth_year: subject.birth_year ?? null,
      isSubject: true,
    },
  ].sort(byBirth);

  // Aunts/uncles seated beside their own sibling where the record says
  // which parent that is; unplaced ones close the row.
  const auntsUncles = relatives.filter((r) => r.relationship !== 'sibling').slice(0, MAX_AUNTS_UNCLES);
  const sideOf = (parentId: string) =>
    auntsUncles.filter((r) => r.via_parent_id === parentId).map(factOf).sort(byBirth);
  const placedIds = new Set(parents.flatMap((p) => sideOf(p.id).map((c) => c.id)));
  const unplaced = auntsUncles
    .map(factOf)
    .filter((c) => !placedIds.has(c.id))
    .sort(byBirth);

  const leftSide = parents.length > 0 ? sideOf(parents[0].id) : [];
  const rightSide = [...(parents.length > 1 ? sideOf(parents[1].id) : []), ...unplaced];

  const hiddenCount =
    siblings.length - shownSiblings.length +
    (relatives.filter((r) => r.relationship !== 'sibling').length - auntsUncles.length);

  const elderBand = parents.length > 0 || leftSide.length > 0 || rightSide.length > 0;

  if (hidden === null) return null;

  return (
    <View style={{ alignSelf: 'stretch', gap: 0, marginBottom: 14 }}>
      {/* The chart is offerable, not obligatory: a reader here for the words
          can put the diagram away, and the choice sticks on this device. */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <RecordText eyebrow muted>
          Family chart
        </RecordText>
        <Pressable onPress={toggleHidden} hitSlop={8} accessibilityRole="button">
          <RecordText eyebrow accent>
            {hidden ? 'Show ›' : 'Hide ›'}
          </RecordText>
        </Pressable>
      </View>

      {!hidden && (
        <>
      {/* ELDER BAND — the parents' generation. */}
      {elderBand && (
        <>
          <RecordText eyebrow muted style={{ marginBottom: 6 }}>
            {parents.length === 0
              ? 'Aunts & uncles'
              : leftSide.length + rightSide.length > 0
                ? 'Parents · aunts & uncles'
                : 'Parents'}
          </RecordText>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {leftSide.map((p) => (
              <Tile key={p.id} person={p} small onPress={() => tap(p)} theme={theme} />
            ))}
            {parents.length > 0 && (
              // The couple inside one accent hairline — the marriage tie.
              <View
                style={{
                  flexDirection: 'row',
                  gap: 6,
                  padding: 5,
                  borderWidth: 1,
                  borderColor: theme.accent,
                }}
              >
                {parents.map((p) => (
                  <Tile key={p.id} person={p} onPress={() => tap(p)} theme={theme} />
                ))}
              </View>
            )}
            {rightSide.map((p) => (
              <Tile key={p.id} person={p} small onPress={() => tap(p)} theme={theme} />
            ))}
          </View>

          {/* The descent line, parents to children. */}
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 1, height: 16, backgroundColor: theme.border }} />
          </View>
        </>
      )}

      {/* SIBSHIP BAND — the subject's generation, in birth order. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {subjectRow.map((p) =>
          p.isSubject ? (
            <Tile key={p.id} person={p} lit theme={theme} />
          ) : (
            <Tile key={p.id} person={p} onPress={() => tap(p)} theme={theme} />
          ),
        )}
      </View>
      {(shownSiblings.length > 0 || hiddenCount > 0) && (
        <RecordText eyebrow muted style={{ marginTop: 6, alignSelf: 'center' }}>
          {shownSiblings.length > 0 ? `${givenName(subject.name)} & siblings · birth order` : ''}
          {hiddenCount > 0 ? `${shownSiblings.length > 0 ? ' · ' : ''}+${hiddenCount} more` : ''}
        </RecordText>
      )}

      {factCard && (
        <View
          style={{
            alignSelf: 'stretch',
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.backgroundElement,
            padding: 12,
            gap: 4,
            marginTop: 10,
          }}
        >
          <ThemedText style={{ fontFamily: Fonts.serif, fontSize: 16 }}>{factCard.name}</ThemedText>
          <RecordText>
            {factCard.relationship}
            {factCard.birth_year || factCard.death_year
              ? ` · ${factCard.birth_year ?? '?'}–${factCard.living ? '' : (factCard.death_year ?? '?')}`
              : ''}
          </RecordText>
          {factCard.proximity_bucket && PROXIMITY_PHRASE[factCard.proximity_bucket] && !factCard.living && (
            <ThemedText type="small">They {PROXIMITY_PHRASE[factCard.proximity_bucket]}.</ThemedText>
          )}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
            <ThemedText
              type="small"
              style={{ fontFamily: Fonts.mono, color: theme.accent }}
              onPress={() => {
                setFactCard(null);
                onOpenPortrait(factCard.id);
              }}
            >
              Portrait ›
            </ThemedText>
            <ThemedText
              type="small"
              style={{ fontFamily: Fonts.mono, color: theme.accent }}
              onPress={() => setFactCard(null)}
            >
              Close
            </ThemedText>
          </View>
        </View>
      )}
        </>
      )}
    </View>
  );
}
