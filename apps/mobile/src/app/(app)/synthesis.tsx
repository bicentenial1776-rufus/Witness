import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { BrandFonts, Letterpress } from '@/constants/theme';
import { useActiveTree } from '@/lib/active-tree';
import { getSynthesis, type TreeSynthesis } from '@/lib/story-arc';

const L = Letterpress;

const mono = (size: number, color: string = L.ink) => ({
  fontFamily: BrandFonts.mono.regular,
  fontSize: size,
  color,
});

/**
 * The Synthesis — the whole ancestry read at once. Every number in the
 * stats block is computed from the record, never model-written; the essay
 * regenerates when the tree grows, so it morphs with the research.
 */
export default function SynthesisScreen() {
  const { activeTree } = useActiveTree();
  const [synthesis, setSynthesis] = useState<TreeSynthesis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTree) return;
    let cancelled = false;
    getSynthesis(activeTree.id)
      .then((s) => {
        if (!cancelled) setSynthesis(s);
      })
      .catch(() => {
        if (!cancelled) {
          setError('The synthesis could not be read just now — nothing has been lost.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTree?.id]);

  return (
    <View style={{ flex: 1, backgroundColor: L.paper }}>
      <Stack.Screen options={{ title: 'The Synthesis' }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {error !== null && (
          <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 16, color: L.ink, marginTop: 24 }}>
            {error}
          </Text>
        )}
        {synthesis === null && error === null && (
          <View style={{ gap: 10, marginTop: 40, alignItems: 'center' }}>
            <ActivityIndicator />
            <Text style={{ ...mono(10.5, L.muted), textAlign: 'center' }}>
              READING EVERY ANCESTOR AT ONCE — A FRESH SYNTHESIS TAKES A MINUTE
            </Text>
          </View>
        )}

        {synthesis && (
          <>
            <Text style={mono(10, L.deepAmber)}>
              A SYNTHESIS OF {synthesis.ancestorCount.toLocaleString()} DIRECT ANCESTORS ·{' '}
              {synthesis.factCount.toLocaleString()} RECORDED FACTS
            </Text>
            <Text
              style={{
                fontFamily: BrandFonts.serif.semiBold,
                fontSize: 30,
                lineHeight: 36,
                color: L.ink,
                marginTop: 6,
              }}
            >
              {synthesis.title}
            </Text>
            <Text
              style={{
                fontFamily: BrandFonts.serif.regular,
                fontSize: 15.5,
                lineHeight: 23,
                color: L.muted,
                marginTop: 6,
              }}
            >
              {synthesis.dek}
            </Text>

            {/* The credibility block — every number from the record. */}
            <View
              style={{
                marginTop: 16,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: L.rule,
                paddingVertical: 12,
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              {synthesis.stats.map((s) => (
                <View key={s.label} style={{ minWidth: '44%' }}>
                  <Text style={{ fontFamily: BrandFonts.mono.medium, fontSize: 13, color: L.ink }}>
                    {s.value}
                  </Text>
                  <Text style={{ ...mono(8.5, L.muted), letterSpacing: 1, marginTop: 1 }}>
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>

            {synthesis.sections.map((section) => (
              <View key={section.heading} style={{ marginTop: 22 }}>
                <Text
                  style={{
                    fontFamily: BrandFonts.serif.semiBold,
                    fontSize: 19,
                    color: L.ink,
                  }}
                >
                  {section.heading}
                </Text>
                {section.body.split('\n\n').map((paragraph, i) => (
                  <Text
                    key={i}
                    style={{
                      fontFamily: BrandFonts.serif.regular,
                      fontSize: 15.5,
                      lineHeight: 24,
                      color: L.ink,
                      marginTop: 8,
                    }}
                  >
                    {paragraph}
                  </Text>
                ))}
              </View>
            ))}

            <Text style={{ ...mono(9, L.muted), marginTop: 26, lineHeight: 15 }}>
              EVERY NUMBER ABOVE IS COUNTED FROM YOUR TREE'S RECORD, NEVER WRITTEN BY THE MODEL. THE
              ESSAY REGENERATES AS YOUR TREE GROWS — LAST READ{' '}
              {new Date(synthesis.generatedAt).toLocaleDateString().toUpperCase()}.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
