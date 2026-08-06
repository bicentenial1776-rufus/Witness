import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Broadsheet, BrandFonts } from '@/constants/theme';

/**
 * Chart primitives for Getting To Work.
 *
 * Built from Views rather than SVG on purpose: every form here is a bar, a
 * column or a tile, all of which a styled View draws exactly. Adding a
 * rendering dependency to a shipping app to draw rectangles would be a poor
 * trade — reach for react-native-svg when a radial or a true line chart earns
 * it, not before.
 *
 * Colour follows the design system, not invention. Single-series charts wear
 * the accent against an inactive track; the one two-series chart uses a pair
 * validated for colour-vision deficiency (worst adjacent ΔE 20.0 protan
 * against #F5F2EC) and is direct-labelled besides, so identity never rests on
 * hue alone.
 */

const C = Broadsheet.color;

/** Validated categorical pair. Assigned in fixed order, never cycled. */
export const SERIES = ['#B4501A', '#1F6FA8'] as const;

const MARK_RADIUS = 4;

export function ChartFrame({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: C.paperRaised,
        borderWidth: 1,
        borderColor: C.rule,
        borderRadius: 3,
        padding: 20,
        gap: 4,
        flexGrow: 1,
        flexBasis: 320,
        minWidth: 300,
      }}
    >
      <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 20, color: C.ink }}>
        {title}
      </Text>
      {caption ? (
        <Text
          style={{
            fontFamily: BrandFonts.sans.regular,
            fontSize: 13,
            color: C.inkMuted,
            marginBottom: 10,
          }}
        >
          {caption}
        </Text>
      ) : (
        <View style={{ height: 10 }} />
      )}
      {children}
    </View>
  );
}

export function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View
      style={{
        backgroundColor: C.paperRaised,
        borderWidth: 1,
        borderColor: C.rule,
        borderRadius: 3,
        paddingVertical: 18,
        paddingHorizontal: 20,
        flexGrow: 1,
        flexBasis: 150,
        minWidth: 130,
      }}
    >
      {/* A headline number is not a chart — it is the number. */}
      <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 30, color: C.ink }}>
        {value}
      </Text>
      <Text
        style={{
          fontFamily: BrandFonts.sans.regular,
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: C.inkMuted,
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export interface Datum {
  key: string;
  /** Axis label — kept short; long ones are thinned rather than rotated. */
  label: string;
  value: number;
  /** What the tooltip says. Falls back to "label: value". */
  detail?: string;
}

/**
 * Axis labels live in their own row, never inside the fixed plot height.
 *
 * Only the labels actually shown get cells, and they share the full width
 * between them. Giving every column a cell and blanking most of them left the
 * survivors a few pixels wide, so a dense axis rendered as "1. 1. 1." — the
 * ellipsis of a year that had nowhere to go.
 */
function AxisRow({ data, stride }: { data: Datum[]; stride: number }) {
  const shown = data.filter((_, i) => i % stride === 0);
  return (
    <View style={{ flexDirection: 'row', marginTop: 5 }}>
      {shown.map((d) => (
        <View key={d.key} style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BrandFonts.mono.regular,
              fontSize: 10,
              color: C.inkFaint,
              // Left-aligned so each label sits near the column it names;
              // centring in a wide shared cell would drift it half a stride.
              textAlign: shown.length > 2 ? 'left' : 'center',
            }}
            numberOfLines={1}
          >
            {d.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Columns for a count over time. A count has a true zero, so the bars start
 * there and their heights are honestly comparable.
 *
 * Only the plot occupies the fixed height — labels sit in rows above and below
 * it, because putting them inside meant the tallest column's value and the
 * axis text were both sliced off by the container.
 */
export function ColumnChart({ data, height = 130 }: { data: Datum[]; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.value));
  // Dense charts have columns a few pixels wide; a value label over one is
  // unreadable at any width, so those rely on hover and the peak callout.
  const dense = data.length > 16;
  const stride = Math.max(1, Math.ceil(data.length / (dense ? 6 : 8)));
  const peakDatum = data.find((d) => d.value === max);

  return (
    <View>
      <Text
        style={{
          fontFamily: BrandFonts.sans.semiBold,
          fontSize: 12,
          color: C.inkSecondary,
          marginBottom: 4,
        }}
        numberOfLines={1}
      >
        {peakDatum ? `Peak — ${peakDatum.detail ?? `${peakDatum.label}: ${max.toLocaleString()}`}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 2 }}>
        {data.map((d) => {
          const active = hover === d.key;
          return (
            <Pressable
              key={d.key}
              onHoverIn={() => setHover(d.key)}
              onHoverOut={() => setHover(null)}
              style={{ flex: 1, justifyContent: 'flex-end', height: '100%' }}
            >
              <View
                style={{
                  height: Math.max(2, (d.value / max) * height),
                  backgroundColor: active ? C.accentHover : C.accent,
                  // Rounded at the data end only, anchored to the baseline.
                  borderTopLeftRadius: MARK_RADIUS,
                  borderTopRightRadius: MARK_RADIUS,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <AxisRow data={data} stride={stride} />
      <Tooltip datum={data.find((d) => d.key === hover)} />
    </View>
  );
}

/**
 * A dot plot for a measure that lives in a narrow band well away from zero —
 * average lifespan, average age at marriage.
 *
 * Drawn from zero these were columns of near-identical height encoding almost
 * nothing, and the fix for that is emphatically not a truncated bar: a bar's
 * length *is* its value, so clipping its baseline lies about the ratio. A dot
 * carries no such promise, so the scale can open out to the data's own range —
 * which is printed on the axis so nobody has to infer it.
 */
export function TrendDots({ data, unit, height = 130 }: { data: Datum[]; unit: string; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  if (data.length === 0) return <Empty />;
  const values = data.map((d) => d.value);
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  const span = Math.max(1, hi - lo);
  const stride = Math.max(1, Math.ceil(data.length / 8));

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 11, color: C.inkFaint }}>
          scale {lo}–{hi} {unit}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 2 }}>
        {data.map((d) => {
          const active = hover === d.key;
          const y = ((d.value - lo) / span) * (height - 18);
          return (
            <Pressable
              key={d.key}
              onHoverIn={() => setHover(d.key)}
              onHoverOut={() => setHover(null)}
              style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }}
            >
              {/* Stem to the floor of the *scale*, not of zero — it ties the
                  dot to its column without claiming a zero baseline. */}
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  height: y,
                  width: 2,
                  backgroundColor: C.barInactive,
                }}
              />
              <Text
                style={{
                  position: 'absolute',
                  bottom: y + 12,
                  fontFamily: BrandFonts.sans.semiBold,
                  fontSize: 11,
                  color: C.inkSecondary,
                  opacity: active ? 1 : 0,
                }}
                numberOfLines={1}
              >
                {d.value.toFixed(1)}
              </Text>
              <View
                style={{
                  position: 'absolute',
                  bottom: y - 4,
                  width: active ? 11 : 9,
                  height: active ? 11 : 9,
                  borderRadius: 6,
                  backgroundColor: active ? C.accentHover : C.accent,
                  // 2px surface ring keeps neighbouring dots from merging.
                  borderWidth: 2,
                  borderColor: C.paperRaised,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <AxisRow data={data} stride={stride} />
      <Tooltip datum={data.find((d) => d.key === hover)} />
    </View>
  );
}

/** Horizontal bars for a ranking. Magnitude against a shared baseline. */
export function BarList({ data }: { data: Datum[] }) {
  const [hover, setHover] = useState<string | null>(null);
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.value));

  return (
    <View style={{ gap: 7 }}>
      {data.map((d) => {
        const active = hover === d.key;
        return (
          <Pressable
            key={d.key}
            onHoverIn={() => setHover(d.key)}
            onHoverOut={() => setHover(null)}
            style={{ gap: 3 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text
                style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14, color: C.ink, flex: 1 }}
                numberOfLines={1}
              >
                {d.label}
              </Text>
              <Text
                style={{ fontFamily: BrandFonts.sans.semiBold, fontSize: 14, color: C.inkSecondary }}
              >
                {d.detail ?? d.value.toLocaleString()}
              </Text>
            </View>
            <View style={{ height: 7, backgroundColor: C.barInactive, borderRadius: MARK_RADIUS }}>
              <View
                style={{
                  width: `${Math.max(1, (d.value / max) * 100)}%`,
                  height: '100%',
                  backgroundColor: active ? C.accentHover : C.accent,
                  borderRadius: MARK_RADIUS,
                }}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Two named series side by side. The only place a second hue appears, so it
 * carries a legend *and* direct labels — identity never rests on colour.
 */
export function PairedBars({
  data,
  unit,
}: {
  data: { key: string; label: string; value: number }[];
  unit: string;
}) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.value));
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 24 }}>
        {data.map((d, i) => (
          <View key={d.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            <Text
              style={{
                fontFamily: BrandFonts.serif.regular,
                fontSize: 22,
                color: C.ink,
                marginBottom: 4,
              }}
            >
              {d.value.toFixed(1)}
            </Text>
            <View
              style={{
                width: '100%',
                height: Math.max(3, (d.value / max) * 62),
                backgroundColor: SERIES[i % SERIES.length],
                borderTopLeftRadius: MARK_RADIUS,
                borderTopRightRadius: MARK_RADIUS,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
        {data.map((d, i) => (
          <View key={d.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: SERIES[i % SERIES.length],
              }}
            />
            <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 13, color: C.inkSecondary }}>
              {d.label} · {d.value.toFixed(1)} {unit}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Tooltip({ datum }: { datum?: Datum }) {
  return (
    <View style={{ height: 20, justifyContent: 'center' }}>
      <Text
        style={{ fontFamily: BrandFonts.sans.regular, fontSize: 12, color: C.inkSecondary }}
        numberOfLines={1}
      >
        {datum ? (datum.detail ?? `${datum.label}: ${datum.value.toLocaleString()}`) : ''}
      </Text>
    </View>
  );
}

function Empty() {
  return (
    <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: 14, color: C.inkMuted }}>
      Not enough dated records in your tree to draw this yet.
    </Text>
  );
}
