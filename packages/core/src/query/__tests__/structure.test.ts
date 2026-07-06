import { describe, expect, it } from 'vitest';
import {
  ancestorPathCounts,
  ancestorsAlsoInLaws,
  duplicateCandidates,
  familiesSpanningCountries,
  familyRegionClusters,
  lineDocumentation,
  mostDescendants,
  mostDistantPair,
  mostGrandchildren,
  mostSiblings,
  placesAcrossGenerations,
  relatedByMultiplePaths,
  sameSurnameMarriages,
} from '../structure.js';
import { buildIndex } from './buildIndex.js';

describe('descendant counts', () => {
  // matriarch → two children → three grandchildren.
  const index = buildIndex(
    [
      { id: 'matriarch' },
      { id: 'son' },
      { id: 'daughter' },
      { id: 'g1' },
      { id: 'g2' },
      { id: 'g3' },
      { id: 'son-wife' },
      { id: 'daughter-husband' },
    ],
    [
      { wife: 'matriarch', children: ['son', 'daughter'] },
      { husband: 'son', wife: 'son-wife', children: ['g1', 'g2'] },
      { husband: 'daughter-husband', wife: 'daughter', children: ['g3'] },
    ],
  );

  it('counts distinct descendants recursively', () => {
    const top = mostDescendants(index);
    expect(top[0]!.individual.id).toBe('matriarch');
    expect(top[0]!.descendants).toBe(5);
  });

  it('counts grandchildren two levels down', () => {
    const top = mostGrandchildren(index);
    expect(top[0]!.individual.id).toBe('matriarch');
    expect(top[0]!.grandchildren).toBe(3);
  });
});

describe('pedigree collapse', () => {
  // Shared great-grandparent: patriarch's two children each head a line
  // that converges in root's parents (a cousin marriage upstream).
  const index = buildIndex(
    [
      { id: 'root' },
      { id: 'father' },
      { id: 'mother' },
      { id: 'uncle-line' },
      { id: 'aunt-line' },
      { id: 'patriarch' },
      { id: 'outsider', sex: 'F' },
    ],
    [
      { husband: 'father', wife: 'mother', children: ['root'] },
      { husband: 'uncle-line', children: ['father'] },
      { wife: 'aunt-line', children: ['mother'] },
      { husband: 'patriarch', children: ['uncle-line', 'aunt-line'] },
      // patriarch's second family — he is an in-law to the outsider line.
      { husband: 'patriarch', wife: 'outsider', children: [] },
    ],
  );

  it('counts distinct descent paths per ancestor', () => {
    const counts = new Map(ancestorPathCounts(index, 'root').map((e) => [e.individual.id, e.paths]));
    expect(counts.get('father')).toBe(1);
    expect(counts.get('patriarch')).toBe(2); // via both parents
  });

  it('lists ancestors related by multiple paths', () => {
    expect(relatedByMultiplePaths(index, 'root').map((e) => e.individual.id)).toEqual(['patriarch']);
  });

  it('finds ancestors who are also in-laws through another family', () => {
    // patriarch is a direct ancestor, but his marriage to `outsider`
    // (not an ancestor) also makes him an in-law of that line — except
    // his ancestor-line family here has no co-spouse, so the ancestor-
    // spouse requirement filters him out. Give mother's line the case:
    const collapsed = buildIndex(
      [
        { id: 'root' },
        { id: 'father' },
        { id: 'mother' },
        { id: 'second-wife' },
      ],
      [
        { husband: 'father', wife: 'mother', children: ['root'] },
        { husband: 'father', wife: 'second-wife', children: [] },
      ],
    );
    const result = ancestorsAlsoInLaws(collapsed, 'root');
    expect(result).toHaveLength(1);
    expect(result[0]!.individual.id).toBe('father');
    expect(result[0]!.ancestorSpouses.map((s) => s.id)).toEqual(['mother']);
    expect(result[0]!.otherSpouses.map((s) => s.id)).toEqual(['second-wife']);
  });
});

describe('names and documentation', () => {
  it('finds marriages with the same surname on both sides', () => {
    const index = buildIndex(
      [
        { id: 'h1', name: 'John Howe', sex: 'M' },
        { id: 'w1', name: 'Mary Howe', sex: 'F' },
        { id: 'h2', name: 'Amos Field', sex: 'M' },
        { id: 'w2', name: 'Ruth Dane', sex: 'F' },
      ],
      [
        { husband: 'h1', wife: 'w1' },
        { husband: 'h2', wife: 'w2' },
      ],
    );
    const matches = sameSurnameMarriages(index);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.surname).toBe('Howe');
  });

  it('ranks surname lines by documentation density', () => {
    const index = buildIndex(
      [
        { id: 'r1', name: 'Ann Rich' },
        { id: 'r2', name: 'Ben Rich' },
        { id: 'r3', name: 'Cy Rich' },
        { id: 'p1', name: 'Dan Poor' },
        { id: 'p2', name: 'Eve Poor' },
        { id: 'p3', name: 'Fay Poor' },
      ],
      [],
      [
        { person: 'r1', year: 1700 },
        { person: 'r1', type: 'death', year: 1760 },
        { person: 'r2', year: 1705 },
        { person: 'r2', type: 'death', year: 1770 },
        { person: 'r3', year: 1710 },
        { person: 'r3', type: 'death', year: 1780 },
        { person: 'p1', year: 1700 },
      ],
    );
    const lines = lineDocumentation(index, 3);
    expect(lines[0]!.surname).toBe('Rich');
    expect(lines[0]!.eventsPerIndividual).toBe(2);
    expect(lines[lines.length - 1]!.surname).toBe('Poor');
  });

  it('flags likely duplicate records by name and near-identical birth year', () => {
    const index = buildIndex([
      { id: 'a', name: 'John Howe', birth: 1700 },
      { id: 'b', name: 'John  Howe', birth: 1701 },
      { id: 'c', name: 'John Howe', birth: 1750 },
      { id: 'd', name: 'Mary Field', birth: 1700 },
    ]);
    const pairs = duplicateCandidates(index);
    expect(pairs).toHaveLength(1);
    expect([pairs[0]!.a.id, pairs[0]!.b.id].sort()).toEqual(['a', 'b']);
    expect(pairs[0]!.birthYearGap).toBe(1);
  });
});

describe('siblings', () => {
  it('counts siblings across shared families', () => {
    const index = buildIndex(
      [{ id: 'p' }, { id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }],
      [
        { husband: 'p', children: ['s1', 's2', 's3'] },
        // s3 also appears as a child of a second family with s4 (half-sibling).
        { wife: 'p', children: ['s3', 's4'] },
      ],
    );
    const top = mostSiblings(index);
    expect(top[0]!.individual.id).toBe('s3');
    expect(top[0]!.siblings).toBe(3);
  });
});

describe('family geography', () => {
  const QUEBEC = ['Trois-Rivières', 'Quebec', 'Canada'];
  const LOWELL = ['Lowell', 'Massachusetts', 'USA'];

  const index = buildIndex(
    [{ id: 'pa', sex: 'M' }, { id: 'ma', sex: 'F' }, { id: 'kid1' }, { id: 'kid2' }],
    [{ id: 'fam', husband: 'pa', wife: 'ma', children: ['kid1', 'kid2'] }],
    [
      { person: 'pa', type: 'residence', year: 1881, placeParts: LOWELL },
      { person: 'ma', type: 'residence', year: 1885, placeParts: LOWELL },
      { person: 'kid1', type: 'birth', year: 1884, placeParts: LOWELL },
      { person: 'kid2', type: 'birth', year: 1885, placeParts: QUEBEC },
      { person: 'pa', type: 'birth', year: 1850, placeParts: QUEBEC },
      { person: 'ma', type: 'birth', year: 1855, placeParts: QUEBEC },
    ],
  );

  it('clusters family members in the same region and decade', () => {
    const clusters = familyRegionClusters(index);
    const lowell1880s = clusters.find((c) => c.region === 'Massachusetts' && c.decade === 1880);
    expect(lowell1880s?.memberCount).toBe(3); // pa 1881, kid1 1884, ma 1885
    const quebec1850s = clusters.find((c) => c.region === 'Quebec' && c.decade === 1850);
    expect(quebec1850s?.memberCount).toBe(2);
  });

  it('finds places recurring across generations (distinct centuries)', () => {
    const spread = buildIndex(
      [{ id: 'old' }, { id: 'new' }],
      [],
      [
        { person: 'old', year: 1690, placeParts: LOWELL },
        { person: 'new', year: 1885, placeParts: LOWELL },
      ],
    );
    const places = placesAcrossGenerations(spread);
    expect(places).toHaveLength(1);
    expect(places[0]!.centuries).toEqual([1600, 1800]);
  });

  it('finds families straddling countries in the same year', () => {
    const spans = familiesSpanningCountries(index);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.year).toBe(1885);
    expect(spans[0]!.countries).toEqual(['Canada', 'United States']);
  });
});

describe('most distant pair', () => {
  it('walks the longest chain through parent and spouse links', () => {
    // a+b → c; c+d → e; e+f → g: the far corners sit 3 steps apart
    // (a → c → e → g, or b → c → e → f).
    const index = buildIndex(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }, { id: 'g' }],
      [
        { husband: 'a', wife: 'b', children: ['c'] },
        { husband: 'c', wife: 'd', children: ['e'] },
        { husband: 'e', wife: 'f', children: ['g'] },
      ],
    );
    const pair = mostDistantPair(index);
    expect(pair?.steps).toBe(3);
  });

  it('returns null for a tree with no family links', () => {
    expect(mostDistantPair(buildIndex([{ id: 'only' }]))).toBeNull();
  });
});
