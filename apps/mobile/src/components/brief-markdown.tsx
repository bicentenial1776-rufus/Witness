import { Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandFonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Renders research-brief markdown properly (redesign §3.5): headings in
 * the serif, numbered research questions as a ledger, emphasis honored —
 * no raw ## or ** anywhere. Deliberately small: briefs use headings,
 * numbered and bulleted lists, bold, and paragraphs, and that is all
 * this renders.
 */

function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ fontFamily: BrandFonts.sans.semiBold }}>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </>
  );
}

export function BriefMarkdown({ content }: { content: string }) {
  const theme = useTheme();
  const blocks: React.ReactNode[] = [];
  const lines = content.split('\n');

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) return;

    const h2 = line.match(/^##+\s+(.*)/);
    const h1 = !h2 && line.match(/^#\s+(.*)/);
    const numbered = line.match(/^(\d+)[.)]\s+(.*)/);
    const bullet = line.match(/^[-*•]\s+(.*)/);

    if (h1) {
      blocks.push(
        <Text
          key={index}
          style={{
            fontFamily: BrandFonts.serif.bold,
            fontSize: 26,
            color: theme.text,
            marginTop: blocks.length ? 18 : 0,
          }}
        >
          <Inline text={h1[1]!.replace(/\*\*/g, '')} />
        </Text>,
      );
    } else if (h2) {
      blocks.push(
        <Text
          key={index}
          style={{
            fontFamily: BrandFonts.serif.semiBold,
            fontSize: 21,
            color: theme.text,
            marginTop: blocks.length ? 16 : 0,
          }}
        >
          <Inline text={h2[1]!.replace(/\*\*/g, '')} />
        </Text>,
      );
    } else if (numbered) {
      blocks.push(
        <View
          key={index}
          style={{
            flexDirection: 'row',
            gap: 12,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
          }}
        >
          <Text
            style={{
              fontFamily: BrandFonts.mono.medium,
              fontSize: 13,
              color: theme.accent,
              paddingTop: 2,
            }}
          >
            {numbered[1]!.padStart(2, '0')}
          </Text>
          <ThemedText style={{ flex: 1 }}>
            <Inline text={numbered[2]!} />
          </ThemedText>
        </View>,
      );
    } else if (bullet) {
      blocks.push(
        <View key={index} style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <Text style={{ color: theme.accent, fontSize: 15, paddingTop: 1 }}>✦</Text>
          <ThemedText style={{ flex: 1 }}>
            <Inline text={bullet[1]!} />
          </ThemedText>
        </View>,
      );
    } else {
      blocks.push(
        <ThemedText key={index} style={{ marginTop: blocks.length ? 8 : 0 }}>
          <Inline text={line} />
        </ThemedText>,
      );
    }
  });

  return <View>{blocks}</View>;
}
