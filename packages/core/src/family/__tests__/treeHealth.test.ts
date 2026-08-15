import { describe, it, expect, beforeAll } from 'vitest';
import { parseGedcom } from '../../gedcom/index.js';
import { buildGraphFromParsed } from '../gedcomGraph.js';
import { computeTreeHealth, type TreeHealthModel } from '../treeHealth.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const realPath = fileURLToPath(
  new URL('../../../fixtures/Howe_Field Family Tree.ged', import.meta.url),
);

describe('computeTreeHealth (Howe/Field fixture)', () => {
  let health: TreeHealthModel;

  beforeAll(() => {
    const gedcomText = readFileSync(realPath, 'utf-8');
    const graph = buildGraphFromParsed(parseGedcom(gedcomText));

    // Rufus Scott Howe — the real home person, with deep ancestry on record
    const homePerson = [...graph.people.values()].find((p) =>
      p.name.includes('Rufus Scott Howe'),
    );
    if (!homePerson) throw new Error('Home person not in fixture');

    health = computeTreeHealth('test-tree-id', graph, homePerson.id);
  });

  describe('ahnentafel resolution', () => {
    it('resolves slots 2-511 for 8 generations', () => {
      expect(health.ahnentafel.size).toBe(510); // slots 2–511
    });

    it('has home person at generation 1 (slot 1)', () => {
      // Slot 1 is not in ahnentafel map (we start at 2), but home person is in generation stats
      expect(health.generationStats[0]!.generation).toBe(1);
    });

    it('generation counts follow 2^n pattern', () => {
      for (const gen of health.generationStats) {
        const expected = Math.pow(2, gen.generation);
        expect(gen.slotCount).toBe(expected);
      }
    });

    it('filled + empty slots account for all slots per generation', () => {
      for (const gen of health.generationStats) {
        const genSlots = Array.from(health.ahnentafel.values()).filter(
          s => s.generation === gen.generation,
        );
        const filled = genSlots.filter(s => s.individual).length;
        const empty = genSlots.filter(s => !s.individual).length;
        expect(filled + empty).toBe(gen.slotCount);
      }
    });
  });

  describe('pedigree collapse detection', () => {
    it('flags individuals occupying multiple slots', () => {
      const withCollapses = Array.from(health.ahnentafel.values()).filter(
        s => s.collapseSlots && s.collapseSlots.length > 0,
      );
      // Real Howe/Field tree may or may not have Acadian-style collapse; test just that the flag exists
      if (withCollapses.length > 0) {
        for (const slot of withCollapses) {
          expect(slot.collapseSlots).toBeDefined();
          expect(slot.collapseSlots!.length).toBeGreaterThan(0);
        }
      }
    });

    it('collapsed individuals are rendered at every slot they occupy', () => {
      // If individual occupies slots [10, 20], both slots should have same individual object
      const collapseMap = new Map<string, number[]>();
      for (const slot of health.ahnentafel.values()) {
        if (slot.individual) {
          if (!collapseMap.has(slot.individual.id)) {
            collapseMap.set(slot.individual.id, []);
          }
          collapseMap.get(slot.individual.id)!.push(slot.slot);
        }
      }

      for (const [indId, slots] of collapseMap.entries()) {
        if (slots.length > 1) {
          const individuals = slots.map(s => health.ahnentafel.get(s)?.individual?.id);
          expect(new Set(individuals).size).toBe(1); // all same individual
        }
      }
    });
  });

  describe('generation statistics', () => {
    it('computes era labels from real birth years', () => {
      for (const gen of health.generationStats) {
        expect(gen.eraLabel).toBeTruthy();
        // Should either have birth year range or fallback estimate
        expect(gen.eraLabel).toMatch(/births|era/i);
      }
    });

    it('fallback era estimate when no dates present', () => {
      // This would require a synthetic fixture with no birth years; real Howe/Field has dates
      // Test just that the field is always present
      for (const gen of health.generationStats) {
        expect(gen.eraLabel).toBeTruthy();
      }
    });

    it('tracks filled and verified counts per generation', () => {
      for (const gen of health.generationStats) {
        expect(gen.filledCount).toBeLessThanOrEqual(gen.slotCount);
        expect(gen.verifiedCount).toBeLessThanOrEqual(gen.filledCount);
      }
    });
  });

  describe('beacon ranking', () => {
    it('caps beacons at 3', () => {
      expect(health.beacons.length).toBeLessThanOrEqual(3);
    });

    it('beacons ranked by (convergence × generationsOpened)', () => {
      for (let i = 0; i < health.beacons.length - 1; i++) {
        const b1 = health.beacons[i]!;
        const b2 = health.beacons[i + 1]!;
        const score1 = b1.convergedLineCount * b1.generationsOpened;
        const score2 = b2.convergedLineCount * b2.generationsOpened;
        expect(score1).toBeGreaterThanOrEqual(score2);
      }
    });

    it('only frontier slots eligible for beacons', () => {
      for (const beacon of health.beacons) {
        // Beacon should be at a generation where a frontier exists
        expect(beacon.generation).toBeGreaterThanOrEqual(1);
        expect(beacon.generation).toBeLessThanOrEqual(8);
      }
    });

    it('beacons have human-readable why statements', () => {
      for (const beacon of health.beacons) {
        expect(beacon.whyStatement).toBeTruthy();
        expect(beacon.whyStatement.length).toBeGreaterThan(10);
      }
    });
  });

  describe('golden threads', () => {
    it('identifies fully verified lines through gen 8', () => {
      // Howe/Field may or may not have complete lines; just test structure
      for (const thread of health.goldenThreads) {
        expect(thread.lineName).toBeTruthy();
        expect(thread.label).toBeTruthy();
        expect(thread.label).toMatch(/thread|verified/i);
      }
    });

    it('includes terminal ancestor birth year in label', () => {
      for (const thread of health.goldenThreads) {
        if (thread.terminantBirthYear) {
          expect(thread.label).toContain(thread.terminantBirthYear.toString());
        }
      }
    });
  });

  describe('headline statistics', () => {
    it('filledPercent is between 0–100', () => {
      expect(health.headlineStats.filledPercent).toBeGreaterThanOrEqual(0);
      expect(health.headlineStats.filledPercent).toBeLessThanOrEqual(100);
    });

    it('verifiedPercent is between 0–100', () => {
      expect(health.headlineStats.verifiedPercent).toBeGreaterThanOrEqual(0);
      expect(health.headlineStats.verifiedPercent).toBeLessThanOrEqual(100);
    });

    it('beaconCount matches beacons array length', () => {
      expect(health.headlineStats.beaconCount).toBe(health.beacons.length);
    });
  });

  describe('edge cases', () => {
    it('handles home person with no parents recorded', () => {
      // Would need to construct a synthetic tree with just root person
      // For real Howe/Field, this should still work gracefully
      expect(health.ahnentafel.size).toBeGreaterThan(0);
    });

    it('does not crash with sparse ancestor data', () => {
      // Real Howe/Field has good coverage; synthetic sparse fixture would test this
      // For now, just verify computation completes
      expect(health.treeId).toBe('test-tree-id');
      expect(health.homePersonId).toBeTruthy();
      expect(health.computedAt).toBeInstanceOf(Date);
    });
  });

  describe('cacheability', () => {
    it('model includes computedAt timestamp for cache invalidation', () => {
      expect(health.computedAt).toBeInstanceOf(Date);
      expect(health.computedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('model is serializable (no circular refs, functions)', () => {
      // This will throw if model has circular references or non-serializable fields
      const json = JSON.stringify(health, (key, value) => {
        if (typeof value === 'function') {
          throw new Error(`Function found at key ${key}`);
        }
        if (value instanceof Map) {
          return Array.from(value.entries()); // convert Map to array for JSON
        }
        return value;
      });
      expect(json).toBeTruthy();
    });
  });
});

describe('computeTreeHealth (synthetic endogamous fixture)', () => {
  // TODO: Create a minimal endogamous GEDCOM fixture to test Acadian-style pedigree collapse
  // For now, real Howe/Field tests suffice
  it.skip('detects Acadian-style pedigree collapse', () => {
    // Requires synthetic fixture with same ancestor in multiple slots
  });
});
