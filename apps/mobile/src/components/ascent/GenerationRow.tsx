import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { GenerationStats, AhnentafelSlot, Beacon } from '@witness/core/family';

const styles = StyleSheet.create({
  row: {
    marginBottom: 40,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    color: '#999',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  relationship: {
    fontFamily: 'Georgia',
    fontSize: 16,
    fontWeight: '400',
    color: '#1a1a1a',
  },
  stats: {
    fontSize: 12,
    color: '#999',
  },
  barContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    height: 32,
  },
  segment: {
    flex: 1,
    borderRadius: 2,
    marginHorizontal: 1.5,
  },
  segmentVerified: {
    backgroundColor: '#00a890',
  },
  segmentUnverified: {
    backgroundColor: '#8b7355',
    opacity: 0.6,
  },
  segmentEmpty: {
    backgroundColor: '#2a2a28',
    opacity: 0.2,
  },
  segmentBeacon: {
    backgroundColor: '#f59e0b',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#f0f0ec',
  },
  chipFrontierWall: {
    backgroundColor: '#fff4e6',
  },
  chipFrontierVerify: {
    backgroundColor: '#f3f3f1',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  chipTextWall: {
    color: '#b8860b',
  },
  beaconCard: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0dc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
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
  buttonBrief: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonBriefText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'white',
  },
});

interface GenerationRowProps {
  generation: GenerationStats;
  slots: AhnentafelSlot[];
  beacons: Beacon[];
}

/**
 * Single generation row in the ascent ladder.
 * Shows eyebrow, relationship label, segmented bar, chips (frontier/collapse), and beacon cards.
 */
export function GenerationRow({ generation, slots, beacons }: GenerationRowProps) {
  const verifiedCount = slots.filter(s => s.state === 'verified').length;
  const filledCount = slots.filter(s => s.individual).length;

  // Build chip labels
  const chips = useMemo(() => {
    const result: { label: string; type: 'wall' | 'verify' | 'collapse' }[] = [];

    // TODO: Add frontier and collapse logic here
    // For now, return empty
    return result;
  }, [slots]);

  return (
    <View style={styles.row}>
      <Text style={styles.eyebrow}>GENERATION {generation.generation}</Text>

      <View style={styles.header}>
        <Text style={styles.relationship}>{generation.relationshipName}</Text>
        <Text style={styles.stats}>
          {filledCount} of {generation.slotCount} found / {verifiedCount} verified
        </Text>
      </View>

      {/* Segmented Bar */}
      <View style={styles.barContainer}>
        {slots.map((slot, idx) => (
          <View
            key={`slot-${slot.slot}`}
            style={[
              styles.segment,
              slot.state === 'verified'
                ? styles.segmentVerified
                : slot.state === 'filled_unverified'
                  ? styles.segmentUnverified
                  : styles.segmentEmpty,
              beacons.length > 0 && idx === 0 && styles.segmentBeacon,
            ]}
          />
        ))}
      </View>

      {/* Chips */}
      {chips.length > 0 && (
        <View style={styles.chipsContainer}>
          {chips.map((chip, idx) => (
            <View
              key={idx}
              style={[
                styles.chip,
                chip.type === 'wall' && styles.chipFrontierWall,
                chip.type === 'verify' && styles.chipFrontierVerify,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  chip.type === 'wall' && styles.chipTextWall,
                ]}
              >
                {chip.type === 'wall' ? '⚑ ' : chip.type === 'verify' ? '' : '◈ '}
                {chip.label}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Beacon Cards */}
      {beacons.map((beacon, idx) => (
        <View key={`beacon-${idx}`} style={styles.beaconCard}>
          <Text style={styles.beaconName}>
            {beacon.individual?.name || 'Unknown'}
          </Text>
          <Text style={styles.beaconWhy}>{beacon.whyStatement}</Text>
          <Pressable style={styles.buttonBrief}>
            <Text style={styles.buttonBriefText}>Generate Research Brief</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
