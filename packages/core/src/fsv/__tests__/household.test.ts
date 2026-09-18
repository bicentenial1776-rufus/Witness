import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../gedcom/index.js';
import { buildTreeIndexFromParsed, type TreeIndex } from '../../query/treeIndex.js';
import { fsvHouseholdRecord } from '../household.js';
import { fsvCanEnter } from '../enterable.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, '..', '..', '..', 'fixtures', 'sample.ged');

/** One closed household, married 1874 in Boston, counted in 1880 and 1900, all dead. */
function closedIndex(): TreeIndex {
  const person = (id: string, given: string, surname: string, sex: 'M' | 'F', b: number, d: number | null) => ({
    id, full_name: `${given} ${surname}`, given_name: given, surname, sex, birth_year: b, death_year: d, living: false
  });
  const place = (id: string, raw: string, parts: string[], country: string) => [id, { id, raw, parts, region: parts[parts.length - 2] ?? null, country }] as const;
  return {
    individuals: new Map([
      ['h', person('h', 'John', 'Field', 'M', 1850, 1910)],
      ['w', person('w', 'Mary', 'Howe', 'F', 1852, 1915)],
      ['c', person('c', 'Ann', 'Field', 'F', 1876, 1940)],
      ['k', person('k', 'Tom', 'Field', 'M', 1878, 1879)]
    ]),
    families: [{ id: 'f1', husband_id: 'h', wife_id: 'w', marriage_year: 1874, marriage_place_id: 'p1', children: ['c', 'k'] }],
    events: [
      { individualId: 'h', eventType: 'residence', year: 1880, placeId: 'p2', dateConfidence: 'exact', detail: null },
      { individualId: 'w', eventType: 'residence', year: 1880, placeId: 'p2', dateConfidence: 'exact', detail: null },
      { individualId: 'c', eventType: 'residence', year: 1880, placeId: 'p2', dateConfidence: 'exact', detail: null },
      { individualId: 'h', eventType: 'census', year: 1900, placeId: 'p2', dateConfidence: 'exact', detail: null },
      { individualId: 'c', eventType: 'census', year: 1900, placeId: 'p3', dateConfidence: 'exact', detail: null },
      { individualId: 'h', eventType: 'residence', year: 1870, placeId: 'p2', dateConfidence: 'exact', detail: null }
    ],
    places: new Map([
      place('p1', 'Boston, Suffolk, Massachusetts, USA', ['Boston', 'Suffolk', 'Massachusetts', 'USA'], 'United States'),
      place('p2', 'Worcester, Worcester, Massachusetts, USA', ['Worcester', 'Worcester', 'Massachusetts', 'USA'], 'United States'),
      place('p3', 'Providence, Providence, Rhode Island, USA', ['Providence', 'Providence', 'Rhode Island', 'USA'], 'United States')
    ])
  } as unknown as TreeIndex;
}

describe('fsvHouseholdRecord', () => {
  it('reads the members by relation, and the days the record found them together', () => {
    const r = fsvHouseholdRecord(closedIndex(), 'f1')!;
    expect(r.living).toBe(false);
    expect(r.members).toEqual([['h', 'head'], ['w', 'wife'], ['c', 'daughter'], ['k', 'son']]);
    expect(r.year).toBe(1874);
    expect(r.rgn).toBe('United States');
    /* 1870 is before the marriage; 1900 has the head alone in Worcester
       (the daughter's row is in Providence): one day, 1880, three at home */
    expect(r.days.map((d) => d.year)).toEqual([1880]);
    expect(r.days[0]!.present.map((p) => p.pid)).toEqual(['h', 'w', 'c']);
    expect(r.days[0]!.census).toBe('United States Federal');
    expect(r.days[0]!.date).toBe('1880-06-01');
    expect(r.days[0]!.town).toBe('Worcester');
    expect(fsvCanEnter(r)).toEqual({ ok: true, why: 'ok' });
  });

  it('sets a household with no census day on its fullest year, and says the day is thin', () => {
    const ix = closedIndex();
    ix.events = [];
    const r = fsvHouseholdRecord(ix, 'f1')!;
    expect(r.days.length).toBe(1);
    expect(r.days[0]!.thin).toBe(true);
    /* the fullest years are 1878 (both children alive) — the one such year */
    expect(r.days[0]!.year).toBe(1878);
    expect(r.days[0]!.present.map((p) => p.pid).sort()).toEqual(['c', 'h', 'k', 'w']);
    expect(r.days[0]!.town).toBe('Boston');
  });

  it('withholds a living household whole', () => {
    const ix = closedIndex();
    ix.individuals.get('c')!.living = true;
    const r = fsvHouseholdRecord(ix, 'f1')!;
    expect(r.living).toBe(true);
    expect(r.members).toEqual([]);
    expect(r.days).toEqual([]);
    expect(r.persons).toEqual({});
    expect(r.place).toBeNull();
    expect(fsvCanEnter(r)).toEqual({ ok: false, why: 'living' });
  });

  it('reads the words on a census row: the relation, the occupation, which census; and leaves a servant out', () => {
    const ix = closedIndex();
    const src = 'Source: 1880 United States Federal Census';
    ix.events = [
      { individualId: 'h', eventType: 'residence', year: 1880, placeId: 'p2', dateConfidence: 'exact', detail: 'Occupation: Boot Bottomer; Relation to Head: Self\n' + src },
      { individualId: 'w', eventType: 'residence', year: 1880, placeId: 'p2', dateConfidence: 'exact', detail: 'Relation to Head: Wife\n' + src },
      { individualId: 'c', eventType: 'residence', year: 1880, placeId: 'p2', dateConfidence: 'exact', detail: 'Relation to Head: Servant\n' + src },
      /* a residence with no census behind it is a residence, not a day */
      { individualId: 'h', eventType: 'residence', year: 1885, placeId: 'p2', dateConfidence: 'exact', detail: null },
      { individualId: 'w', eventType: 'residence', year: 1885, placeId: 'p2', dateConfidence: 'exact', detail: null },
      /* and the 1940 census's "where in 1935" is a residence too */
      { individualId: 'h', eventType: 'residence', year: 1895, placeId: 'p2', dateConfidence: 'exact', detail: 'Source: 1900 United States Federal Census' },
      { individualId: 'w', eventType: 'residence', year: 1895, placeId: 'p2', dateConfidence: 'exact', detail: 'Source: 1900 United States Federal Census' }
    ];
    const r = fsvHouseholdRecord(ix, 'f1')!;
    expect(r.days.map((d) => d.year)).toEqual([1880]);
    const d = r.days[0]!;
    expect(d.census).toBe('United States Federal');
    expect(d.present.map((p) => p.pid)).toEqual(['h', 'w']);
    expect(d.present[0]!.occupation).toBe('Boot Bottomer');
    expect(d.present[0]!.relation).toBe('self');
    expect(d.present[1]!.relation).toBe('wife');
  });

  it('returns null for a family the index does not have', () => {
    expect(fsvHouseholdRecord(closedIndex(), 'nope')).toBeNull();
    expect(fsvCanEnter(null)).toEqual({ ok: false, why: 'no-record' });
  });

  it('runs on the sample file, and withholds its living household', () => {
    const parsed = parseGedcom(readFileSync(fixture, 'utf8'), 'sample.ged');
    const index = buildTreeIndexFromParsed(parsed);
    const f = index.families[0]!;
    const r = fsvHouseholdRecord(index, f.id)!;
    expect(r).not.toBeNull();
    /* the sample's one family has a living member: nothing of it is written */
    expect(r.living).toBe(true);
    expect(Object.keys(r.persons)).toEqual([]);
  });
});
