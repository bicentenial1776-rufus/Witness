import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { GraphPerson } from '@witness/core/family';

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 24,
  },
  circle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  circleName: {
    fontFamily: 'Georgia',
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  circleYear: {
    fontSize: 12,
    color: 'white',
    marginTop: 4,
    opacity: 0.9,
  },
  nameLabel: {
    fontSize: 12,
    color: '#666',
  },
});

interface HomePersonCircleProps {
  person: GraphPerson;
}

/**
 * Home person circle at the base of the ascent ladder.
 */
export function HomePersonCircle({ person }: HomePersonCircleProps) {
  return (
    <Pressable style={styles.container}>
      <View style={styles.circle}>
        <Text style={styles.circleName}>You</Text>
        <Text style={styles.circleYear}>b. {person.birthYear ?? '?'}</Text>
      </View>
      <Text style={styles.nameLabel}>{person.name}</Text>
    </Pressable>
  );
}
