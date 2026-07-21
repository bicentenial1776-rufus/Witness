import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import {
  computeTreeHealth,
  fetchFamilyGraph,
  type GraphPerson,
  type TreeHealthModel,
} from '@witness/core/family';

import { useActiveTree } from '@/lib/active-tree';
import { supabase } from '@/lib/supabase';
import { GenerationRow } from '@/components/ascent/GenerationRow';
import { PulseCard } from '@/components/ascent/PulseCard';
import { HomePersonCircle } from '@/components/ascent/HomePersonCircle';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafaf8',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0dc',
    backgroundColor: '#fafaf8',
  },
  headerSpy: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  summit: {
    textAlign: 'center',
    marginBottom: 48,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 22,
    color: '#888',
  },
  summitFont: {
    fontFamily: 'Georgia',
  },
  goldenThreadTag: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '500',
    color: '#d4af37',
    letterSpacing: 0.5,
  },
  scrollHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginBottom: 24,
    marginTop: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    color: '#999',
  },
});

interface AscentData {
  health: TreeHealthModel;
  homePerson: GraphPerson;
}

/**
 * Demo mode (dev only): a deterministic scripted scroll for recording the
 * tutorial video. Open `mobile://ascent?demo=1` and start the screen capture;
 * after a settle delay the screen climbs from base to summit on this timeline.
 * Timings and stops MUST stay in sync with docs/ascent-vo-script.md.
 *
 * `to` is scroll progress: 1 = base (home person), 0 = summit (gen 8).
 */
const DEMO_SETTLE_MS = 1500;
const DEMO_TIMELINE: { to: number; scrollMs: number; holdMs: number }[] = [
  { to: 1.0, scrollMs: 0, holdMs: 10000 }, // base: You + the Pulse
  { to: 0.8, scrollMs: 3000, holdMs: 10000 }, // gens 1–2: slots, filled vs empty
  { to: 0.55, scrollMs: 3000, holdMs: 9000 }, // mid gens: verified, era labels
  { to: 0.3, scrollMs: 3000, holdMs: 12000 }, // gen 6: walls, beacons, brief
  { to: 0.0, scrollMs: 4000, holdMs: 22000 }, // summit + golden thread + closing loop
];

/**
 * Ascent: vertical, scrollable generation ladder showing tree health from home person upward.
 * Loads scrolled to bottom (home person + summary), user scrolls UP to ascend generations.
 */
export default function AscentScreen() {
  const { activeTree } = useActiveTree();
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  const demoMode = __DEV__ && demo === '1';
  const scrollRef = useRef<ScrollView>(null);
  const startedAtBase = useRef(false);
  const demoStarted = useRef(false);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);
  const [headerSpy, setHeaderSpy] = useState('You · Home');
  const [data, setData] = useState<AscentData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const treeId = activeTree?.id;
  const homePersonId = activeTree?.home_person_id;

  useEffect(() => {
    if (!treeId || !homePersonId) return;
    let cancelled = false;
    fetchFamilyGraph(supabase, treeId)
      .then((graph) => {
        if (cancelled) return;
        const health = computeTreeHealth(treeId, graph, homePersonId);
        const homePerson = graph.people.get(homePersonId)!;
        setData({ health, homePerson });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [treeId, homePersonId]);

  const maybeStartDemo = useCallback(() => {
    if (!demoMode || demoStarted.current) return;
    const maxScroll = contentHeight.current - viewportHeight.current;
    if (maxScroll <= 0) return;
    demoStarted.current = true;

    // Flatten the timeline into absolute keyframes, then drive with rAF so
    // velocity is constant regardless of frame rate.
    const segments: { t0: number; t1: number; from: number; to: number }[] = [];
    let t = DEMO_SETTLE_MS;
    let at = 1.0;
    for (const step of DEMO_TIMELINE) {
      if (step.scrollMs > 0) {
        segments.push({ t0: t, t1: t + step.scrollMs, from: at, to: step.to });
        t += step.scrollMs;
      }
      at = step.to;
      segments.push({ t0: t, t1: t + step.holdMs, from: at, to: at });
      t += step.holdMs;
    }

    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const segment = segments.find((s) => elapsed >= s.t0 && elapsed < s.t1);
      if (!segment) {
        if (elapsed >= t) return; // timeline finished
        requestAnimationFrame(tick);
        return;
      }
      const ratio = segment.t1 === segment.t0 ? 1 : (elapsed - segment.t0) / (segment.t1 - segment.t0);
      const progress = segment.from + (segment.to - segment.from) * ratio;
      scrollRef.current?.scrollTo({ y: progress * maxScroll, animated: false });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [demoMode]);

  const handleScroll = useCallback((event: { nativeEvent: { contentSize: { height: number }; layoutMeasurement: { height: number }; contentOffset: { y: number } } }) => {
    const contentHeight = event.nativeEvent.contentSize.height;
    const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;
    const scrollOffset = event.nativeEvent.contentOffset.y;
    const totalScroll = contentHeight - scrollViewHeight;
    const progress = scrollOffset / Math.max(totalScroll, 1);

    // Update header spy based on scroll position (page is ordered gen 8 → home)
    if (progress > 0.8) {
      setHeaderSpy('You · Home');
    } else if (progress > 0.6) {
      setHeaderSpy('Gen 2 · Grandparents');
    } else if (progress > 0.4) {
      setHeaderSpy('Gen 4 · 2nd Great-Grandparents');
    } else if (progress > 0.2) {
      setHeaderSpy('Gen 6 · 4th Great-Grandparents');
    } else {
      setHeaderSpy('Gen 8 · 6th Great-Grandparents');
    }
  }, []);

  if (!activeTree || !homePersonId) {
    return (
      <SafeAreaView edges={["bottom"]} style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={{ color: '#666' }}>
            {activeTree ? 'Set a home person to see your ascent.' : 'Import a tree to begin.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView edges={["bottom"]} style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={{ color: '#666' }}>Unable to load tree health: {error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView edges={["bottom"]} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a1a1a" />
          <Text style={styles.loadingText}>Climbing your tree…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { health, homePerson } = data;

  // Reverse-sort generations so user scrolls UP to ascend (order: gen 8 → gen 1 → home)
  const generationsFromBottomToTop = [...health.generationStats].reverse();
  const goldenThread = health.goldenThreads[0];

  return (
    <SafeAreaView edges={["bottom"]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerSpy}>{headerSpy}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
          maybeStartDemo();
        }}
        onContentSizeChange={(_w, h) => {
          contentHeight.current = h;
          // The ascent starts at the base — home person in view, ancestors above
          if (!startedAtBase.current) {
            startedAtBase.current = true;
            scrollRef.current?.scrollToEnd({ animated: false });
          }
          maybeStartDemo();
        }}
      >
        <View style={styles.scrollContent}>
          {/* Summit */}
          <Text style={[styles.summit, styles.summitFont]}>
            Here the records thin. This is where research begins.
          </Text>

          {/* Golden thread label if any threads exist */}
          {goldenThread && <Text style={styles.goldenThreadTag}>{goldenThread.label}</Text>}

          {/* Generation rows (reversed: gen 8 down to gen 1) */}
          {generationsFromBottomToTop.map((gen) => (
            <GenerationRow
              key={gen.generation}
              generation={gen}
              slots={Array.from(health.ahnentafel.values()).filter(
                (s) => s.generation === gen.generation,
              )}
              beacons={health.beacons.filter((b) => b.generation === gen.generation)}
            />
          ))}

          {/* Base: scroll hint + home person + pulse card */}
          <Text style={styles.scrollHint}>↑ Scroll up to climb your tree</Text>

          <HomePersonCircle person={homePerson} />

          <PulseCard headlineStats={health.headlineStats} topBeacon={health.beacons[0] ?? null} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
