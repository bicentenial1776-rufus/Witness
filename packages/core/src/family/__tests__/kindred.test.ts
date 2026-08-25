import { describe, expect, it } from 'vitest';
import { emptyPerson, type FamilyGraph, type GraphPerson } from '../graph.js';
import { sweepKindredCouples } from '../kindred.js';

function person(id: string, overrides: Partial<GraphPerson> = {}): GraphPerson {
  return { ...emptyPerson(id), name: id, ...overrides };
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

  it('finds distant kinship by default and labels the ancestor per spouse', () => {
    // Second cousins: shared great-grandfather (3 up each).
    const graph = graphOf([
      person('gg', { sex: 'M' }),
      person('a', { father: 'gg' }),
      person('b', { father: 'gg' }),
      person('a2', { father: 'a' }),
      person('b2', { father: 'b' }),
      person('a3', { father: 'a2', spouses: ['b3'] }),
      person('b3', { father: 'b2', spouses: ['a3'] }),
    ]);
    expect(sweepKindredCouples(graph, 2)).toHaveLength(0);
    const found = sweepKindredCouples(graph); // unlimited by default
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      label: 'second cousins',
      ancestorLabelA: 'great-grandfather',
      ancestorLabelB: 'great-grandfather',
    });
  });

  it('labels unequal depths in the Ruth-and-Rufus form', () => {
    // Shared ancestor 3 up on one side, 4 up on the other.
    const graph = graphOf([
      person('anc', { sex: 'M' }),
      person('p', { father: 'anc' }),
      person('q', { father: 'anc' }),
      person('p2', { father: 'p' }),
      person('q2', { father: 'q' }),
      person('q3', { father: 'q2' }),
      person('wifeSide', { father: 'p2', spouses: ['husbandSide'] }),
      person('husbandSide', { father: 'q3', spouses: ['wifeSide'] }),
    ]);
    const found = sweepKindredCouples(graph);
    expect(found).toHaveLength(1);
    const labels = [found[0]!.ancestorLabelA, found[0]!.ancestorLabelB].sort();
    expect(labels).toEqual(['2nd great-grandfather', 'great-grandfather']);
    expect(found[0]!.label).toBe('second cousins, 1× removed');
  });

  it('replays each descent line, common ancestor first, spouse last', () => {
    const graph = graphOf([
      person('gg', { sex: 'M' }),
      person('a', { father: 'gg' }),
      person('b', { father: 'gg' }),
      person('a2', { father: 'a' }),
      person('husband', { father: 'a2', spouses: ['wife'] }),
      person('wife', { father: 'b', spouses: ['husband'] }),
    ]);
    const [couple] = sweepKindredCouples(graph);
    const pathOf = (spouseId: string) =>
      (couple!.spouseA.id === spouseId ? couple!.pathA : couple!.pathB).map((p) => p.id);
    expect(pathOf('husband')).toEqual(['gg', 'a', 'a2', 'husband']);
    expect(pathOf('wife')).toEqual(['gg', 'b', 'wife']);
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
