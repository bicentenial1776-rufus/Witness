import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../gedcom/index.js';
import { buildGraphFromParsed } from '../gedcomGraph.js';
import { bloodRelativeIds, computeRelationshipRows } from '../precompute.js';
import { ancestorDepths, calculateRelationship } from '../relationship.js';
import type { FamilyGraph } from '../graph.js';

const fixturePath = fileURLToPath(new URL('../../../fixtures/Howe_Field Family Tree.ged', import.meta.url));
const graph = buildGraphFromParsed(parseGedcom(readFileSync(fixturePath, 'utf-8')));
const people = [...graph.people.values()];
const rufus = people.find((p) => p.name.includes('Rufus Scott Howe'))!;

/** The pre-optimization prefilter, verbatim: one ancestorDepths BFS per person. */
function bruteForceBloodRelativeIds(g: FamilyGraph, homeId: string): string[] {
  const homeAncestors = ancestorDepths(g, homeId);
  const ids: string[] = [];
  for (const person of g.people.values()) {
    if (person.id === homeId) continue;
    if (homeAncestors.has(person.id)) {
      ids.push(person.id);
      continue;
    }
    const theirs = ancestorDepths(g, person.id);
    if (theirs.has(homeId)) {
      ids.push(person.id);
      continue;
    }
    for (const ancestorId of theirs.keys()) {
      if (homeAncestors.has(ancestorId)) {
        ids.push(person.id);
        break;
      }
    }
  }
  return ids;
}

describe('precompute (real GEDCOM)', () => {
  it('downward-walk prefilter covers exactly the brute-force blood relatives after labeling', () => {
    // The child-link walk may surface extra candidates (child-links are a
    // superset of parent-links), but never miss one: every brute-force
    // relative must be a candidate.
    const fast = new Set(bloodRelativeIds(graph, rufus.id));
    const brute = new Set(bruteForceBloodRelativeIds(graph, rufus.id));
    for (const id of brute) expect(fast.has(id), `prefilter missed ${id}`).toBe(true);
  });

  it('produces row-for-row the same output as unmemoized per-person labeling', () => {
    const rows = computeRelationshipRows(graph, rufus.id);
    // Baseline: label every person in the tree the slow way and keep blood.
    const baseline = new Map<string, ReturnType<typeof calculateRelationship>>();
    for (const person of people) {
      if (person.id === rufus.id) continue;
      const result = calculateRelationship(graph, rufus.id, person.id);
      if (!result.isDirectAncestor && !result.isDirectDescendant && !result.isCollateral) continue;
      if (result.confidence === 'none') continue;
      baseline.set(person.id, result);
    }
    expect(rows).toHaveLength(baseline.size);
    for (const row of rows) {
      const expected = baseline.get(row.individual_id);
      expect(expected, `unexpected blood relative ${row.individual_id}`).toBeDefined();
      expect(row.label).toBe(expected!.label);
      expect(row.generation_distance).toBe(expected!.generationDistance);
      expect(row.line).toBe(expected!.line);
      expect(row.path).toEqual(expected!.path);
      expect(row.is_direct_ancestor).toBe(expected!.isDirectAncestor);
      expect(row.is_direct_descendant).toBe(expected!.isDirectDescendant);
      expect(row.is_collateral).toBe(expected!.isCollateral);
    }
  });

  it('stays inside the edge-function CPU budget', () => {
    // Regressing to the O(people × BFS) shape puts this back at tens of
    // seconds; the budgeted shape runs in hundreds of milliseconds.
    const start = performance.now();
    computeRelationshipRows(graph, rufus.id);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
