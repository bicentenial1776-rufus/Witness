import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../gedcom/index.js';
import { buildTreeIndexFromParsed, type TreeIndex } from '../../query/treeIndex.js';
import { resolveFsvProgram, fsvSeed } from '../program.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, '..', '..', '..', 'fixtures', 'sample.ged');

function program(year = 2026) {
  const parsed = parseGedcom(readFileSync(fixture, 'utf8'), 'sample.ged');
  return resolveFsvProgram(buildTreeIndexFromParsed(parsed), year);
}

/** A tree with one closed household: married 1874 in Boston, all dead. */
function closedIndex(): TreeIndex {
  const person = (id: string, surname: string, b: number, d: number | null) => ({
    id, full_name: `${id} ${surname}`, given_name: id, surname,
    sex: 'M' as const, birth_year: b, death_year: d, living: false
  });
  return {
    individuals: new Map([
      ['h', person('h', 'Field', 1850, 1910)],
      ['w', person('w', 'Howe', 1852, 1915)],
      ['c', person('c', 'Field', 1876, 1940)]
    ]),
    families: [{
      id: 'f1', husband_id: 'h', wife_id: 'w',
      marriage_year: 1874, marriage_place_id: 'p1', children: ['c']
    }],
    events: [],
    places: new Map([['p1', {
      id: 'p1', raw: 'Boston, Suffolk, Massachusetts, USA',
      parts: ['Boston', 'Suffolk', 'Massachusetts', 'USA'],
      region: 'Massachusetts', country: 'United States'
    }]])
  };
}


/** index [0] under noUncheckedIndexedAccess, without sprinkling ! everywhere */
function first<T>(xs: T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error('expected at least one element');
  return x;
}

describe('resolveFsvProgram', () => {
  it('resolves the fixture to the one household the record holds', () => {
    const p = program();
    // sample.ged carries a single dated marriage: 20 Jun 1874
    expect(p.counts.households).toBe(1);
    expect(p.yearStart).toBe(1874);
    expect(p.yearEnd).toBe(1874);
    expect(first(p.households).year).toBe(1874);
  });

  it('WITHHOLDS the living household even though the file names its place', () => {
    // the fixture's marriage IS placed — Boston, Suffolk — and the index
    // carries the place row. The household still comes back placeless,
    // because a living member is present. This is the law, tested against a
    // real file rather than asserted in a comment.
    const p = program();
    const h = first(p.households);
    expect(h.hasLiving).toBe(true);
    expect(h.place).toBeNull();
    expect(h.country).toBeNull();
    expect(h.children).toBe(0);
    expect(h.surname).toBeTruthy();
    expect(h.year).toBe(1874);
    expect(p.counts.living).toBe(1);
    expect(p.counts.placed).toBe(0);
  });

  it('gives a closed household its place, its children and a documented band', () => {
    const p = resolveFsvProgram(closedIndex(), 2026);
    expect(p.counts.households).toBe(1);
    const h = first(p.households);
    expect(h.hasLiving).toBe(false);
    expect(h.place).toContain('Boston');
    expect(h.country).toBe('United States');
    expect(h.children).toBe(1);
    expect(h.confidence).toBe('documented');
    expect(p.counts.documented).toBe(1);
    expect(p.counts.placed).toBe(1);
  });

  it('is deterministic: the same file resolves to the same world', () => {
    expect(JSON.stringify(program())).toEqual(JSON.stringify(program()));
  });

  it('orders households by year and breaks ties by key', () => {
    const p = program();
    for (let i = 1; i < p.households.length; i++) {
      const prev = p.households[i - 1]!, cur = p.households[i]!;
      expect(prev.year).toBeLessThanOrEqual(cur.year);
      if (prev.year === cur.year) expect(prev.key <= cur.key).toBe(true);
    }
  });

  it('gives every household a confidence, and only documents what is placed', () => {
    const p = program();
    for (const h of p.households) {
      expect(['documented', 'period_typical', 'inferred']).toContain(h.confidence);
      if (h.confidence === 'documented') expect(h.place).not.toBeNull();
    }
    const { documented, periodTypical, inferred, households } = p.counts;
    expect(documented + periodTypical + inferred).toBe(households);
  });

  it('seeds follow the key, not the order', () => {
    const p = program();
    for (const h of p.households) {
      expect(h.seed).toBe(fsvSeed(h.key));
      expect(Number.isInteger(h.seed)).toBe(true);
      expect(h.seed).toBeGreaterThanOrEqual(0);
    }
    expect(fsvSeed('@I1@')).toBe(fsvSeed('@I1@'));
    expect(fsvSeed('@I1@')).not.toBe(fsvSeed('@I2@'));
  });

  it('does not move when the current year does', () => {
    const a = program(2026), b = program(2030);
    expect(a.households.map((h) => h.key)).toEqual(b.households.map((h) => h.key));
    expect(a.households.map((h) => h.year)).toEqual(b.households.map((h) => h.year));
  });
});
