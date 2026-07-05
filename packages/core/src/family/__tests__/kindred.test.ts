import { describe, expect, it } from 'vitest';
import type { FamilyGraph, GraphPerson } from '../graph.js';
import { sweepKindredCouples } from '../kindred.js';

function person(id: string, overrides: Partial<GraphPerson> = {}): GraphPerson {
  return {
    id,
    name: id,
    sex: 'U',
    birthYear: null,
    deathYear: null,
    living: false,
    father: null,
    mother: null,
    spouses: [],
    children: [],
    ...overrides,
  };
}

function graphOf(people: GraphPerson[]): FamilyGraph {
  return { people: new Map(people.map((p) => [p.id, p])) };
}

describe('sweepKindredCouples', () => {
  it('finds first cousins who married', () => {
    // grandpa → (a1, a2); a1 → c1, a2 → c2; c1 ⚭ c2
    const graph = graphOf([
      person('grandpa'),
      person('a1', { father: 'grandpa' }),
      person('a2', { father: 'grandpa' }),
      person('c1', { father: 'a1', spouses: ['c2'] }),
      person('c2', { father: 'a2', spouses: ['c1'] }),
    ]);
    const couples = sweepKindredCouples(graph);
    expect(couples).toHaveLength(1);
    expect(couples[0]).toMatchObject({
      label: 'first cousins',
      generationsA: 2,
      generationsB: 2,
    });
    expect(couples[0]!.commonAncestor.id).toBe('grandpa');
  });

  it('reports each couple once', () => {
    const graph = graphOf([
      person('g'),
      person('x', { father: 'g', spouses: ['y'] }),
      person('y', { mother: 'g', spouses: ['x'] }),
    ]);
    // Siblings who married — one couple, flagged.
    const couples = sweepKindredCouples(graph);
    expect(couples).toHaveLength(1);
    expect(couples[0]!.label).toContain('record error');
  });

  it('ignores couples whose shared ancestor is beyond the depth limit', () => {
    // Second cousins: shared great-grandparent (3 up each).
    const graph = graphOf([
      person('gg'),
      person('a', { father: 'gg' }),
      person('b', { father: 'gg' }),
      person('a2', { father: 'a' }),
      person('b2', { father: 'b' }),
      person('a3', { father: 'a2', spouses: ['b3'] }),
      person('b3', { father: 'b2', spouses: ['a3'] }),
    ]);
    expect(sweepKindredCouples(graph, 2)).toHaveLength(0);
    expect(sweepKindredCouples(graph, 3)).toHaveLength(1);
  });

  it('ignores unrelated couples', () => {
    const graph = graphOf([
      person('p1'),
      person('p2'),
      person('m', { father: 'p1', spouses: ['w'] }),
      person('w', { father: 'p2', spouses: ['m'] }),
    ]);
    expect(sweepKindredCouples(graph)).toHaveLength(0);
  });
});
