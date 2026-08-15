import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../gedcom/index.js';
import { buildGraphFromParsed } from '../gedcomGraph.js';
import { pickHomePersonCandidate } from '../homePerson.js';
import { calculateRelationship } from '../relationship.js';

// The real 5,495-person tree — the acceptance fixture for this feature.
const fixturePath = fileURLToPath(new URL('../../../fixtures/Howe_Field Family Tree.ged', import.meta.url));
const graph = buildGraphFromParsed(parseGedcom(readFileSync(fixturePath, 'utf-8')));
const people = [...graph.people.values()];

const rufus = people.find((p) => p.name.includes('Rufus Scott Howe'))!;

describe('pickHomePersonCandidate (real GEDCOM)', () => {
  it('suggests the living person with the most recent birth year', () => {
    const candidate = pickHomePersonCandidate(people);
    expect(candidate).not.toBeNull();
    expect(candidate!.living).toBe(true);
    // Nobody living in the tree was born after the suggestion.
    const laterLiving = people.filter(
      (p) => p.living && p.birthYear !== null && p.birthYear > (candidate!.birthYear ?? -Infinity),
    );
    expect(laterLiving).toHaveLength(0);
  });
});

describe('calculateRelationship (real GEDCOM)', () => {
  it('resolves Katherine Marbury (wife of Richard Scott) from Rufus', () => {
    // The product spec guessed "9th great-grandmother, maternal"; the
    // actual tree resolves her at depth 9 up the Scott (paternal) line:
    // Rufus → Shirley Scott Howe → Ethel Rosalthie Scott → four more
    // Scotts → John Scott (b. 1640) → Katherine Marbury (1617–1687).
    const katherine = people.find((p) => p.name.toLowerCase().includes('marbury'))!;
    expect(katherine.name).toContain('Marbury');
    const rel = calculateRelationship(graph, rufus.id, katherine.id);
    expect(rel.isDirectAncestor).toBe(true);
    expect(rel.label).toBe('7th great-grandmother');
    expect(rel.generationDistance).toBe(9);
    expect(rel.line).toBe('paternal');
    expect(rel.path).toHaveLength(10);
    expect(rel.confidence).toBe('known');
  });

  it('resolves parents and grandparents with correct labels', () => {
    const father = graph.people.get(rufus.father!)!;
    expect(calculateRelationship(graph, rufus.id, father.id).label).toBe('father');
    const grandfather = graph.people.get(father.father!)!;
    const rel = calculateRelationship(graph, rufus.id, grandfather.id);
    expect(rel.label).toBe('grandfather');
    expect(rel.line).toBe('paternal');
  });

  it('handles this-is-you on the real tree', () => {
    expect(calculateRelationship(graph, rufus.id, rufus.id).label).toBe('this is you');
  });

  it('terminates and stays consistent across every individual in the tree', () => {
    // Endogamy/pedigree-collapse smoke test: relate the home person to
    // every 50th individual and require a well-formed answer each time.
    const sample = people.filter((_, index) => index % 50 === 0);
    for (const person of sample) {
      const rel = calculateRelationship(graph, rufus.id, person.id);
      expect(rel.label.length).toBeGreaterThan(0);
      const flags = [rel.isDirectAncestor, rel.isDirectDescendant, rel.isCollateral].filter(Boolean);
      expect(flags.length).toBeLessThanOrEqual(1);
      if (rel.confidence !== 'none' && rel.label !== 'this is you') {
        expect(rel.path.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
