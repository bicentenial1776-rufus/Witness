// Inline pedigree for the story view (witness-family-context-spec.md §5):
// subject centered, parents on the inner ring above, siblings arced below,
// aunts/uncles on the outer ring beside their parent generation. Radial-lite
// per the spec's locked layout — but drawn with plain positioned Views and
// trig, NOT react-native-skia: the spec assumed a skia stack this repo
// doesn't have (Street View lives in Greg's project), skia can't render on
// the web carrier, and circles-with-initials need no canvas. Zero new
// dependencies; brand tokens throughout.
//
// Tap a node: has_story navigates to that person's Portrait (where their
// story lives); no story shows the lightweight fact card below the chart —
// never a dead node. Read-only by design.

import { useState } from 'react';
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

const SIZE = 300;
const NODE = 44;
const CENTER_NODE = 56;
const MAX_ARC_NODES = 8;

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .join('')
    .toUpperCase();
}

/** Positions `count` nodes along an arc (degrees, 0 = east, CCW). */
function arcPositions(count: number, radius: number, startDeg: number, endDeg: number) {
  if (count === 0) return [];
  if (count === 1) {
    const mid = ((startDeg + endDeg) / 2 / 180) * Math.PI;
    return [{ x: radius * Math.cos(mid), y: -radius * Math.sin(mid) }];
  }
  return Array.from({ length: count }, (_, i) => {
    const deg = startDeg + ((endDeg - startDeg) * i) / (count - 1);
    const rad = (deg / 180) * Math.PI;
    return { x: radius * Math.cos(rad), y: -radius * Math.sin(rad) };
  });
}

function Node({
  person,
  x,
  y,
  size,
  onPress,
  theme,
}: {
  person: ChartPerson;
  x: number;
  y: number;
  size: number;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${person.name}, ${person.relationship}`}
      style={{
        position: 'absolute',
        left: SIZE / 2 + x - size / 2,
        top: SIZE / 2 + y - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: person.has_story ? 1.5 : 1,
        borderColor: person.has_story ? theme.accent : theme.border,
        backgroundColor: theme.backgroundElement,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ThemedText
        style={{
          fontFamily: Fonts.serif,
          fontSize: size > NODE ? 18 : 14,
          color: person.has_story ? theme.accent : theme.text,
        }}
      >
        {initialsOf(person.name)}
      </ThemedText>
    </Pressable>
  );
}

export function PedigreeChart({
  subject,
  parents,
  relatives,
  onOpenPortrait,
}: {
  subject: { id: string; name: string };
  parents: ChartPerson[];
  relatives: RelativeFact[];
  onOpenPortrait: (personId: string) => void;
}) {
  const theme = useTheme();
  const [factCard, setFactCard] = useState<ChartPerson | null>(null);

  const siblings = relatives.filter((r) => r.relationship === 'sibling');
  const auntsUncles = relatives.filter((r) => r.relationship !== 'sibling');
  const shownSiblings = siblings.slice(0, MAX_ARC_NODES);
  const shownAuntsUncles = auntsUncles.slice(0, MAX_ARC_NODES);
  const hiddenCount =
    siblings.length - shownSiblings.length + (auntsUncles.length - shownAuntsUncles.length);

  // Rings: parents at 100px in the upper arc, siblings at 100px below,
  // aunts/uncles at 140px across the top, outside the parents.
  const parentSpread = parents.length > 1 ? 34 : 0;
  const parentPos = arcPositions(parents.length, 96, 90 + parentSpread, 90 - parentSpread);
  const siblingPos = arcPositions(shownSiblings.length, 100, 205, 335);
  const auntUnclePos = arcPositions(shownAuntsUncles.length, 142, 160, 20);

  const tap = (person: ChartPerson) => {
    if (person.has_story) onOpenPortrait(person.id);
    else setFactCard(person);
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

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <View style={{ width: SIZE, height: SIZE }}>
        {/* Ring guides — faint, structural, hairline. */}
        {[100, 142].map((r) => (
          <View
            key={r}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: SIZE / 2 - r,
              top: SIZE / 2 - r,
              width: r * 2,
              height: r * 2,
              borderRadius: r,
              borderWidth: 1,
              borderColor: theme.border,
              opacity: 0.45,
            }}
          />
        ))}

        {/* Subject — center, not tappable (you are already here). */}
        <View
          style={{
            position: 'absolute',
            left: SIZE / 2 - CENTER_NODE / 2,
            top: SIZE / 2 - CENTER_NODE / 2,
            width: CENTER_NODE,
            height: CENTER_NODE,
            borderRadius: CENTER_NODE / 2,
            borderWidth: 2,
            borderColor: theme.accent,
            backgroundColor: theme.backgroundElement,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ThemedText style={{ fontFamily: Fonts.serif, fontSize: 20, color: theme.accent }}>
            {initialsOf(subject.name)}
          </ThemedText>
        </View>

        {parents.map((p, i) => (
          <Node key={p.id} person={p} x={parentPos[i].x} y={parentPos[i].y} size={NODE} onPress={() => tap(p)} theme={theme} />
        ))}
        {shownSiblings.map((r, i) => (
          <Node key={r.person_id} person={factOf(r)} x={siblingPos[i].x} y={siblingPos[i].y} size={NODE} onPress={() => tap(factOf(r))} theme={theme} />
        ))}
        {shownAuntsUncles.map((r, i) => (
          <Node key={r.person_id} person={factOf(r)} x={auntUnclePos[i].x} y={auntUnclePos[i].y} size={38} onPress={() => tap(factOf(r))} theme={theme} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        <ThemedText type="small">◉ {subject.name.split(' ')[0]}</ThemedText>
        {parents.length > 0 && <ThemedText type="small">↑ parents</ThemedText>}
        {shownSiblings.length > 0 && <ThemedText type="small">↓ siblings</ThemedText>}
        {shownAuntsUncles.length > 0 && <ThemedText type="small">⌒ aunts & uncles</ThemedText>}
        {hiddenCount > 0 && <ThemedText type="small">+{hiddenCount} more</ThemedText>}
      </View>

      {factCard && (
        <View
          style={{
            alignSelf: 'stretch',
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.backgroundElement,
            padding: 12,
            gap: 4,
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
    </View>
  );
}
