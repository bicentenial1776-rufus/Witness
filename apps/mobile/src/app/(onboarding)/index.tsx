import { router } from 'expo-router';
import { type SFSymbol, SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { BrandFonts } from '@/constants/theme';
import { useNarrative } from '@/lib/narrative';

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
const CARD = '#FBF8F3';
const CARD_BORDER = '#E2D9CC';
const CLINICAL_BG = '#DDD8D0';
const CLINICAL_TEXT = '#57534E';

type Palette = {
  fg: string;
  muted: string;
  amber: string;
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progress: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 20 },
  headline: { fontFamily: BrandFonts.serif.semiBold, fontSize: 30, lineHeight: 37 },
  subhead: { fontFamily: BrandFonts.sans.regular, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: BrandFonts.sans.regular, fontSize: 16, lineHeight: 24 },
  micro: { fontFamily: BrandFonts.sans.medium, fontSize: 13, lineHeight: 18 },
  footer: { padding: 24, gap: 12 },
  skip: { textAlign: 'center', fontFamily: BrandFonts.sans.medium, fontSize: 15 },

  // Screen 1 — Hook. Floats fully above the headline block — at lower
  // offsets it lies over the text and hides words behind the card.
  photoCorner: {
    position: 'absolute',
    top: -112,
    right: 8,
    width: 76,
    height: 96,
    backgroundColor: '#EFE6D6',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(28,25,23,0.15)',
    transform: [{ rotate: '9deg' }],
    opacity: 0.9,
  },
  photoCornerLine: { height: 1, backgroundColor: 'rgba(28,25,23,0.14)', marginHorizontal: 10 },

  // Screen 2 — split comparison
  splitRow: { flexDirection: 'row', gap: 12 },
  splitCard: { flex: 1, borderRadius: 14, padding: 14, gap: 6, minHeight: 118, justifyContent: 'center' },
  splitLabel: { fontFamily: BrandFonts.sans.semiBold, fontSize: 15 },

  // Screen 3 — mechanics
  stepsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: { flex: 1, alignItems: 'center', gap: 8 },
  stepIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontFamily: BrandFonts.sans.semiBold, fontSize: 13, textAlign: 'center' },
  stepArrow: { fontSize: 18, marginHorizontal: -2 },

  // Screen 4 — proximity map
  mapCard: {
    height: 240,
    borderRadius: 18,
    backgroundColor: 'rgba(247,243,238,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(247,243,238,0.16)',
    overflow: 'hidden',
  },
  mapPin: { position: 'absolute', alignItems: 'center' },
  mapPinDot: { width: 14, height: 14, borderRadius: 7 },
  mapPinLabel: { fontFamily: BrandFonts.sans.semiBold, fontSize: 12, marginTop: 4 },
  mapLine: { position: 'absolute', height: 1, backgroundColor: 'rgba(224,145,47,0.4)' },
  teaserStrip: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(247,243,238,0.16)',
    paddingTop: 12,
  },

  // Screen 5 — trust
  curiosityCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 18,
    gap: 10,
  },
  curiosityEyebrow: {
    alignSelf: 'flex-start',
    fontFamily: BrandFonts.sans.semiBold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: AMBER,
    backgroundColor: 'rgba(180,83,9,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
});

function Divider({ color }: { color: string }) {
  return <View style={{ height: 1, backgroundColor: color }} />;
}

function Screen1({ amber }: Palette) {
  return (
    <>
      <View>
        <Text style={[styles.headline, { color: PARCHMENT }]}>
          Somewhere in a box, a drawer, a shoebox of photographs — your family has a story it
          hasn&rsquo;t told yet.
        </Text>
        <View style={styles.photoCorner}>
          <View style={{ padding: 10, gap: 6 }}>
            <View style={styles.photoCornerLine} />
            <View style={styles.photoCornerLine} />
            <View style={styles.photoCornerLine} />
          </View>
        </View>
      </View>
      <Text style={[styles.subhead, { color: amber }]}>Witness helps you find it.</Text>
    </>
  );
}

function Screen2() {
  return (
    <>
      <Text style={[styles.headline, { color: INK }]}>Names and dates aren&rsquo;t a story.</Text>
      <Text style={[styles.body, { color: STONE }]}>
        Most family tree tools give you a chart. A list of who begat whom. Witness gives you{' '}
        <Text style={{ fontStyle: 'italic' }}>context</Text> — the newspaper clipping, the
        neighborhood, the world your ancestors actually lived in.
      </Text>
      <View style={styles.splitRow}>
        <View style={[styles.splitCard, { backgroundColor: CLINICAL_BG }]}>
          <Text style={[styles.splitLabel, { color: CLINICAL_TEXT }]}>James Whitfield</Text>
          <Divider color="rgba(28,25,23,0.15)" />
          <Text style={[styles.body, { fontSize: 14, lineHeight: 19, color: CLINICAL_TEXT }]}>
            b. 1842 — d. 1901
          </Text>
        </View>
        <View style={[styles.splitCard, { backgroundColor: CARD, borderWidth: 1, borderColor: CARD_BORDER }]}>
          <Text style={[styles.splitLabel, { color: INK }]}>James Whitfield</Text>
          <Divider color={CARD_BORDER} />
          <Text style={[styles.body, { fontSize: 14, lineHeight: 19, color: STONE }]}>
            Cooper by trade, three streets from where you live now. Buried the year the railroad
            came to town.
          </Text>
        </View>
      </View>
    </>
  );
}

function Screen3() {
  const steps: { icon: SFSymbol; label: string }[] = [
    { icon: 'square.and.arrow.down', label: 'Import' },
    { icon: 'doc.text.magnifyingglass', label: 'Cross-reference' },
    { icon: 'sparkles', label: 'Discover' },
  ];
  return (
    <>
      <Text style={[styles.headline, { color: INK }]}>
        Import what you have. Witness does the rest.
      </Text>
      <Text style={[styles.body, { color: STONE }]}>
        Bring your GEDCOM file — from Ancestry, FamilySearch, or any tree software. Witness
        cross-references it against historical records, digitized newspapers, and place data to
        surface what&rsquo;s actually there.
      </Text>
      <View style={styles.stepsRow}>
        {steps.map((step, i) => (
          <View key={step.label} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={styles.step}>
              <View style={[styles.stepIcon, { backgroundColor: CARD, borderWidth: 1, borderColor: CARD_BORDER }]}>
                <SymbolView name={step.icon} size={24} tintColor={AMBER} />
              </View>
              <Text style={[styles.stepLabel, { color: INK }]}>{step.label}</Text>
            </View>
            {i < steps.length - 1 && <Text style={[styles.stepArrow, { color: STONE }]}>{'→'}</Text>}
          </View>
        ))}
      </View>
    </>
  );
}

function Screen4({ amber }: Palette) {
  const pins = [
    { top: 40, left: 40, label: '14 miles · 1902', dot: PARCHMENT },
    { top: 150, left: 210, label: '3 miles · 1954', dot: PARCHMENT },
  ];
  const you = { top: 110, left: 140 };
  return (
    <>
      <Text style={[styles.headline, { color: PARCHMENT }]}>
        See how close you&rsquo;ve always been.
      </Text>
      <Text style={[styles.body, { color: PARCHMENT_MUTED }]}>
        Witness maps where your ancestors lived — and how near they are to you right now. The
        farm, the tenement, the town your family left. Some of them may be closer than you think.
      </Text>
      <View style={styles.mapCard}>
        {pins.map((pin) => {
          const dx = pin.left - you.left;
          const dy = pin.top - you.top;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <View key={pin.label}>
              <View
                style={[
                  styles.mapLine,
                  {
                    width: length,
                    top: you.top + 7,
                    left: you.left + 7,
                    transform: [{ rotate: `${angle}deg` }],
                    transformOrigin: 'left center',
                  },
                ]}
              />
              <View style={[styles.mapPin, { top: pin.top, left: pin.left }]}>
                <View style={[styles.mapPinDot, { backgroundColor: pin.dot }]} />
                <Text style={[styles.mapPinLabel, { color: PARCHMENT }]}>{pin.label}</Text>
              </View>
            </View>
          );
        })}
        <View style={[styles.mapPin, { top: you.top, left: you.left }]}>
          <SymbolView name="location.fill" size={22} tintColor={amber} />
          <Text style={[styles.mapPinLabel, { color: amber }]}>You</Text>
        </View>
      </View>
      <Text style={[styles.micro, { color: PARCHMENT_MUTED }]}>
        You&rsquo;ll see this for your own family in your first week.
      </Text>
      <View style={styles.teaserStrip}>
        <Text style={[styles.micro, { color: PARCHMENT_MUTED, fontStyle: 'italic' }]}>
          Coming soon: walk the actual street your ancestors lived on, reconstructed in Family
          Street View.
        </Text>
      </View>
    </>
  );
}

function Screen5() {
  return (
    <>
      <Text style={[styles.headline, { color: INK }]}>
        Witness shows you possibilities. You decide what&rsquo;s true.
      </Text>
      <Text style={[styles.body, { color: STONE }]}>
        AI-assisted research means Witness will sometimes surface a match, a record, or a
        connection that&rsquo;s <Text style={{ fontStyle: 'italic' }}>worth investigating</Text> —
        not a fact carved in stone. Every finding is presented as a lead, never a claim. Your
        family&rsquo;s history stays yours to interpret.
      </Text>
      <View style={[styles.curiosityCard, { backgroundColor: CARD, borderColor: CARD_BORDER }]}>
        <Text style={styles.curiosityEyebrow}>POSSIBLE MATCH</Text>
        <Text style={[styles.body, { color: INK }]}>
          An Elizabeth Coyne appears in an 1861 shipping manifest — matching your family&rsquo;s
          timeline, three years before your known record begins.
        </Text>
        <Text style={[styles.micro, { color: STONE }]}>Worth investigating — not yet confirmed.</Text>
      </View>
    </>
  );
}

function Screen6() {
  return (
    <>
      <Text style={[styles.headline, { color: PARCHMENT }]}>
        Your family&rsquo;s story is waiting. Let&rsquo;s go find it.
      </Text>
      <Text style={[styles.body, { color: PARCHMENT_MUTED }]}>
        Everything you just saw, built from your own tree.
      </Text>
      {/* The price, before the wall asks for anything — nobody should
          invest an email and a story's worth of attention before knowing
          the terms (ux audit batch 4). */}
      <Text style={[styles.micro, { color: PARCHMENT_MUTED }]}>
        Witness is $19.99 a year after a free 7-day trial — that&rsquo;s the only price.
      </Text>
    </>
  );
}

const DARK_SCREENS = new Set([0, 3, 5]);
const SCREEN_COUNT = 6;

export default function Onboarding() {
  const { markSeen } = useNarrative();
  const [index, setIndex] = useState(0);

  const isLast = index === SCREEN_COUNT - 1;
  const dark = DARK_SCREENS.has(index);
  const bg = dark ? INK : PARCHMENT;
  const muted = dark ? PARCHMENT_MUTED : STONE;
  const amber = dark ? AMBER_LIGHT : AMBER;
  const dotTrack = dark ? 'rgba(247,243,238,0.2)' : 'rgba(28,25,23,0.15)';

  // The narrative now plays before any account exists, so it ends at the
  // doors — Create account, or Sign in for a returning reader on a fresh
  // install. Navigate first, then flip the device flag: the flag unmounts
  // this group, and the destination should already be on the stack.
  function leaveFor(destination: '/sign-up' | '/sign-in') {
    router.replace(destination);
    markSeen();
  }

  function advance() {
    if (!isLast) setIndex(index + 1);
    else leaveFor('/sign-up');
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: bg }]} edges={['top', 'bottom']}>
      <View style={styles.progress}>
        {Array.from({ length: SCREEN_COUNT }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i <= index ? amber : dotTrack }]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {index === 0 && <Screen1 fg={bg === INK ? PARCHMENT : INK} muted={muted} amber={amber} />}
        {index === 1 && <Screen2 />}
        {index === 2 && <Screen3 />}
        {index === 3 && <Screen4 fg={PARCHMENT} muted={muted} amber={amber} />}
        {index === 4 && <Screen5 />}
        {index === 5 && <Screen6 />}
      </ScrollView>

      <View style={styles.footer}>
        <Button title={isLast ? 'Create my account' : 'Continue'} onPress={advance} />
        {isLast ? (
          <Text style={[styles.skip, { color: muted }]} onPress={() => leaveFor('/sign-in')}>
            Already have Witness? Sign in
          </Text>
        ) : (
          <Text style={[styles.skip, { color: muted }]} onPress={() => setIndex(SCREEN_COUNT - 1)}>
            Skip
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}
