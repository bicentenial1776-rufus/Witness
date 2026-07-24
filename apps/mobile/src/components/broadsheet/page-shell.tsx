import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { RecordText } from '@/components/record-text';
import { Broadsheet, BrandFonts } from '@/constants/theme';

import { useMarginColumn } from './use-broadsheet';

const C = Broadsheet.color;

/**
 * The masthead every broadsheet page opens with (structure rule 2): title
 * left in Playfair, up to two lines of mono + caption metadata right,
 * closed by the 3px double rule — the app's signature, reserved for
 * mastheads and major section breaks.
 */
export function Masthead({
  title,
  metaMono,
  metaCaption,
}: {
  title: string;
  metaMono?: string;
  metaCaption?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        borderBottomWidth: 3,
        borderBottomColor: C.ink,
        borderStyle: 'double' as never,
        paddingBottom: 14,
        marginBottom: 26,
        gap: 16,
      }}
    >
      <Text
        style={{
          fontFamily: BrandFonts.serif.bold,
          fontSize: Broadsheet.type.display,
          lineHeight: Broadsheet.type.display * 1.05,
          color: C.ink,
          flexShrink: 1,
        }}
      >
        {title}
      </Text>
      <View style={{ alignItems: 'flex-end', gap: 4, paddingBottom: 6 }}>
        {metaMono && <RecordText>{metaMono}</RecordText>}
        {metaCaption && (
          <Text style={{ fontFamily: BrandFonts.sans.regular, fontSize: Broadsheet.type.caption, color: C.inkMuted }}>
            {metaCaption}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * The content grid (structure rule 3): main column + a 300px margin column
 * separated by a hairline. ≥1200px they sit side by side; below, the margin
 * content trails the main flow. The margin holds ledgers, charts, and
 * notes — never primary content.
 */
export function PageShell({
  masthead,
  margin,
  children,
}: {
  masthead: ReactNode;
  margin?: ReactNode;
  children: ReactNode;
}) {
  const sideBySide = useMarginColumn();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paperBg }}>
      <View style={{ paddingHorizontal: 44, paddingTop: 38, paddingBottom: 60, maxWidth: 1460, width: '100%', alignSelf: 'center' }}>
        {masthead}
        {sideBySide && margin ? (
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, paddingRight: 30 }}>{children}</View>
            <View
              style={{
                width: Broadsheet.marginColumn,
                borderLeftWidth: 1,
                borderLeftColor: C.rule,
                paddingLeft: 30,
                gap: 26,
              }}
            >
              {margin}
            </View>
          </View>
        ) : (
          <View style={{ gap: 26 }}>
            {children}
            {margin}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/** A major section break: mono eyebrow over the double rule's little sibling. */
export function SectionBreak({ label }: { label: string }) {
  return (
    <View style={{ marginTop: 40, marginBottom: 18 }}>
      <RecordText eyebrow accent>
        {label}
      </RecordText>
      <View style={{ height: 3, borderTopWidth: 3, borderTopColor: C.ink, borderStyle: 'double' as never, marginTop: 8 }} />
    </View>
  );
}
