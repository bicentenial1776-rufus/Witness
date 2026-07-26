import { describe, expect, it } from 'vitest';
import { buildFamilyStages } from '../familyStage.js';
import { buildRegister } from '../register.js';
import type { TreeIndex, TreeIndividual } from '../treeIndex.js';

function person(overrides: Partial<TreeIndividual> & { id: string }): TreeIndividual {
  return {
    full_name: overrides.id,
    given_name: null,
    surname: null,
    sex: 'U',
    birth_year: null,
    death_year: null,
    living: false,
    ...overrides,
  };
}

/** Four generations of Howes, plus one unrelated household with a place. */
function makeIndex(): TreeIndex {
  const individuals: TreeIndividual[] = [];
  const families = [];
  // gen(i): head hi (b 1700+i*30), wife wi, child = next head
  for (let i = 0; i < 4; i++) {
    individuals.push(
      person({ id: `h${i}`, full_name: `Howe ${i}`, surname: 'Howe', sex: 'M', birth_year: 1700 + i * 30, death_year: 1770 + i * 30 }),
      person({ id: `w${i}`, full_name: `Wife ${i}`, surname: 'Marsh', sex: 'F', birth_year: 1702 + i * 30, death_year: 1772 + i * 30 }),
    );
    families.push({
      id: `f${i}`,
      husband_id: `h${i}`,
      wife_id: `w${i}`,
      marriage_year: 1725 + i * 30,
      marriage_place_id: null as string | null,
      children: i < 3 ? [`h${i + 1}`, `d${i}`] : [`tail${i}`],
    });
    individuals.push(person({ id: `d${i}`, surname: 'Howe', sex: 'F', birth_year: 1727 + i * 30, death_year: 1800 + i * 30 }));
  }
  individuals.push(person({ id: 'tail3', surname: 'Howe', birth_year: 1817, death_year: 1880 }));
  // Unrelated household with a marriage place
  individuals.push(
    person({ id: 'b-h', full_name: 'Silas Banks', surname: 'Banks', sex: 'M', birth_year: 1800, death_year: 1860 }),
    person({ id: 'b-w', full_name: 'Jane Field', surname: 'Field', sex: 'F', birth_year: 1805, death_year: 1870 }),
    person({ id: 'b-c', surname: 'Banks', birth_year: 1830, death_year: 1900 }),
  );
  families.push({
    id: 'fb',
    husband_id: 'b-h',
    wife_id: 'b-w',
    marriage_year: 1828,
    marriage_place_id: 'p1',
    children: ['b-c'],
  });
  return {
    individuals: new Map(individuals.map((i) => [i.id, i])),
    families,
    events: [],
    places: new Map([
      ['p1', { id: 'p1', raw: 'Sudbury, Middlesex, Massachusetts', parts: ['Sudbury', 'Middlesex', 'Massachusetts'], region: 'Massachusetts', country: 'United States' }],
    ]),
  };
}

describe('buildRegister', () => {
  const index = makeIndex();
  const stages = buildFamilyStages(index, { currentYear: 2026 });
  const register = buildRegister(index, stages);

  it('lists every stage-able household in time order', () => {
    expect(register.entries).toHaveLength(5);
    expect(register.entries.map((e) => e.year)).toEqual([1725, 1755, 1785, 1815, 1828]);
    expect(register.startYear).toBe(1725);
    expect(register.endYear).toBe(1828);
  });

  it('carries the marriage place, shortened to its most local part', () => {
    const banks = register.entries.find((e) => e.key === 'b-h')!;
    expect(banks.place).toBe('Sudbury');
    expect(banks.placeFull).toBe('Sudbury, Middlesex, Massachusetts');
    expect(register.entries.find((e) => e.key === 'h0')!.place).toBeNull();
  });

  it('threads the follow-child doors into one Howe line, eldest first', () => {
    expect(register.threads).toHaveLength(1);
    const thread = register.threads[0]!;
    expect(thread.surname).toBe('Howe');
    expect(thread.keys).toEqual(['h0', 'h1', 'h2', 'h3']);
    expect(thread.startYear).toBe(1725);
  });

  it('names the head and spouse in the entry line', () => {
    const first = register.entries[0]!;
    expect(first.headName).toBe('Howe 0');
    expect(first.spouseLine).toBe('Wife 0');
    expect(first.remarriage).toBe(false);
  });
});
