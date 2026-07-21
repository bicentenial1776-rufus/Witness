import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import type { Beacon } from '@witness/core/family';

import { usePremiumGate } from '@/lib/superwall';

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0dc',
    borderRadius: 8,
    padding: 16,
    marginBottom: 32,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#999',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  beaconSection: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0dc',
    paddingTop: 12,
    marginTop: 12,
  },
  beaconLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  beaconCard: {
    backgroundColor: '#f9f9f7',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  beaconName: {
    fontFamily: 'Georgia',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    color: '#1a1a1a',
  },
  beaconWhy: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'white',
  },
});

interface PulseCardProps {
  headlineStats: {
    filledPercent: number;
    verifiedPercent: number;
    beaconCount: number;
  };
  topBeacon: Beacon | null;
}

/**
 * Pulse card at the bottom showing headline stats and the top priority beacon.
 */
export function PulseCard({ headlineStats, topBeacon }: PulseCardProps) {
  const premiumGate = usePremiumGate();

  return (
    <View style={styles.card}>
      <View style={styles.statsGrid}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{headlineStats.filledPercent}%</Text>
          <Text style={styles.statLabel}>Filled</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{headlineStats.verifiedPercent}%</Text>
          <Text style={styles.statLabel}>Verified</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{headlineStats.beaconCount}</Text>
          <Text style={styles.statLabel}>Beacons</Text>
        </View>
      </View>

      {topBeacon && (
        <View style={styles.beaconSection}>
          <Text style={styles.beaconLabel}>
            Where your effort matters most right now
          </Text>
          <View style={styles.beaconCard}>
            <Text style={styles.beaconName}>
              {topBeacon.individual?.name || 'Unknown'}
            </Text>
            <Text style={styles.beaconWhy}>{topBeacon.whyStatement}</Text>
            <Pressable
              style={styles.button}
              onPress={() => premiumGate(() => router.push('/research'))}
            >
              <Text style={styles.buttonText}>Get Research Brief</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
