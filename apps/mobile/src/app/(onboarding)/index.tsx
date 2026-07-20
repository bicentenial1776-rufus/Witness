import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { useProfile } from '@/lib/profile';

// Fixed brand colors, not the device theme: this is a scripted narrative
// sequence (like the marketing preview site and the discovery card), and
// it should look like Witness everywhere rather than follow the reader's
// light/dark preference.
const INK = '#1C1917';
const PARCHMENT = '#F7F3EE';
const PARCHMENT_MUTED = 'rgba(247,243,238,0.72)';
const AMBER = '#B45309';
const AMBER_LIGHT = '#E0913A';
const STONE = '#57534E';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progress: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 20 },
  eyebrow: { fontSize: 13, letterSpacing: 3, fontWeight: '600', textTransform: 'uppercase' },
  headline: { fontSize: 32, fontWeight: '700', lineHeight: 38 },
  body: { fontSize: 17, lineHeight: 25 },
  footer: { padding: 24, gap: 12 },
  skip: { textAlign: 'center', fontSize: 15, fontWeight: '500' },
  queryCard: { backgroundColor: '#FBF8F3', borderRadius: 15, padding: 20, gap: 12 },
  queryResult: { fontSize: 26, fontWeight: '700', color: AMBER },
  queryDivider: { height: 1, backgroundColor: '#E2D9CC' },
  queryDetail: { fontSize: 15, lineHeight: 21, color: STONE },
  pingWrap: { alignSelf: 'center', width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  pingOuter: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(224,145,47,0.18)' },
  pingInner: { width: 20, height: 20, borderRadius: 10, backgroundColor: AMBER_LIGHT },
});

type Screen = {
  eyebrow: string;
  headline: string;
  body: React.ReactNode;
  dark: boolean;
};

const SCREENS: Screen[] = [
  {
    eyebrow: 'WITNESSES TO HISTORY',
    dark: true,
    headline: "You've built a tree of thousands.",
    body: (
      <>
        <Text style={[styles.body, { color: PARCHMENT_MUTED }]}>
          But you can't ask it the simplest questions. Who was alive when history happened around
          them? Who's buried near where you're standing right now? Which of their lives was
          extraordinary?
        </Text>
        <Text style={[styles.body, { color: PARCHMENT_MUTED }]}>
          A tree that can't answer that isn't finished. It's just a list.
        </Text>
      </>
    ),
  },
  {
    eyebrow: 'ASK IT ANYTHING',
    dark: false,
    headline: 'Who was alive during the Civil War?',
    body: (
      <>
        <View style={styles.queryCard}>
          <Text style={styles.queryResult}>1,046 ancestors</Text>
          <View style={styles.queryDivider} />
          <Text style={styles.queryDetail}>
            Catherine Marbury Scott, age 42 · Elijah Scott, age 17 · Mary Haskell, age 61 · and
            1,043 more
          </Text>
        </View>
        <Text style={[styles.body, { color: STONE }]}>
          One question. A moment ago your tree couldn't answer it — now it can, instantly, for
          anything you ask.
        </Text>
      </>
    ),
  },
  {
    eyebrow: 'STAND WHERE THEY STOOD',
    dark: true,
    headline: "You're standing near an ancestor's grave.",
    body: (
      <>
        <View style={styles.pingWrap}>
          <View style={styles.pingOuter} />
          <View style={styles.pingInner} />
        </View>
        <Text style={[styles.body, { color: PARCHMENT_MUTED }]}>
          Witness knows where your ancestors lived, died, and were buried — and tells you the
          moment you're near one, wherever you happen to be.
        </Text>
      </>
    ),
  },
  {
    eyebrow: 'MEET THEM',
    dark: false,
    headline: 'Meet Catherine Marbury Scott.',
    body: (
      <Text style={[styles.body, { color: STONE }]}>
        1621–1687. Half-sister of Anne Hutchinson, banished from Massachusetts Bay for her faith.
        Catherine crossed an ocean, buried children, and outlived a war — one life among thousands
        in a tree, and the most remarkable one in yours. Witness finds her without you ever having
        to go looking.
      </Text>
    ),
  },
  {
    eyebrow: 'BY INVITATION',
    dark: true,
    headline: 'Import your GEDCOM and start discovering.',
    body: (
      <Text style={[styles.body, { color: PARCHMENT_MUTED }]}>
        Bring the tree you've already built. Witness turns it into answers.
      </Text>
    ),
  },
];

export default function Onboarding() {
  const { markOnboardingComplete } = useProfile();
  const [index, setIndex] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);

  const isLast = index === SCREENS.length - 1;
  const screen = SCREENS[index];
  const bg = screen.dark ? INK : PARCHMENT;
  const fg = screen.dark ? PARCHMENT : INK;
  const muted = screen.dark ? PARCHMENT_MUTED : STONE;
  const amber = screen.dark ? AMBER_LIGHT : AMBER;
  const dotTrack = screen.dark ? 'rgba(247,243,238,0.2)' : 'rgba(28,25,23,0.15)';

  async function advance() {
    if (!isLast) {
      setIndex(index + 1);
      return;
    }
    setIsFinishing(true);
    await markOnboardingComplete();
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: bg }]} edges={['top', 'bottom']}>
      <View style={styles.progress}>
        {SCREENS.map((_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i <= index ? amber : dotTrack }]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, { color: amber }]}>{screen.eyebrow}</Text>
        <Text style={[styles.headline, { color: fg }]}>{screen.headline}</Text>
        <View style={{ gap: 12 }}>{screen.body}</View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isLast ? 'Import your GEDCOM and start discovering' : 'Continue'}
          busy={isFinishing}
          onPress={advance}
        />
        {!isLast && (
          <Text style={[styles.skip, { color: muted }]} onPress={() => setIndex(SCREENS.length - 1)}>
            Skip
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}
