/**
 * A HOUSEHOLD, AS THE ROOM NEEDS IT — the second half of the FSV bridge.
 *
 * `program.ts` turns the tree into the world's list of households: one
 * line each. A room needs more of one household: who was in it, and on
 * which days the record found them there. This produces that, from the
 * TreeIndex the app already holds on the device, and nothing else.
 *
 * It is the design repo's census read (experiments/census_day/build/
 * read_file.js) restated on Witness's own index, and it keeps that read's
 * rules:
 *
 *  1. THE LIVING LEAVE NO TRACE. A household with any living member comes
 *     back as `living: true` and nothing else — no names, no years, no
 *     place, no days. `individuals.living` is the only authority.
 *  2. A DAY IS A DAY THE RECORD FOUND THEM. A census day belongs to a
 *     household when its head or wife has a residence or census event that
 *     year, and the people on that day are the household's own members with
 *     an event that year in the same town. Relations come from the family
 *     record (head, wife, son, daughter), as they do for every United States
 *     census before 1880, which asked no relation.
 *  3. A HOUSEHOLD WITH NO SUCH DAY is set on the day the 13 September
 *     design gives it: inside its first twelve years, cut short at a death,
 *     the middle of the years with the most children at home; the head and
 *     the wife if alive, the children born by then and under fifteen. The
 *     day says it is thin.
 *  4. SAME FILE, SAME SEED. The household's seed is FNV-1a over its key.
 *
 * What the index does not carry, said plainly so nobody expects it: the
 * words on a census row (a relation to the head, an occupation) and the
 * row's source title. The parser keeps neither on an event, so which
 * census a row belongs to is inferred from the country and the year, and
 * no occupation is written. When the parser keeps them, this is where they
 * go.
 */

import type { TreeFamily, TreeIndex, TreeIndividual } from '../query/treeIndex.js';
import { fsvSeed } from './program.js';

export interface FsvPerson {
  given: string;
  surname: string;
  suffix?: string;
  sex: 'M' | 'F' | 'U';
  born: number | null;
  died: number | null;
}

export interface FsvDayPerson {
  pid: string;
  occupation?: string;
}

export interface FsvDay {
  year: number;
  /** The enumeration date the census used, where one is known, else null. */
  date: string | null;
  /** Which census, where the year and country say ("United States Federal", "England"), else "Census"; null for a thin day. */
  census: string | null;
  town: string | null;
  county: string | null;
  state: string | null;
  country: string | null;
  present: FsvDayPerson[];
  implied: { pid: string; why: string }[];
  /** A day the record did not hold: set by the rule, not found. */
  thin?: true;
}

export interface FsvHouseholdRecord {
  /** The family's id in this index. The app addresses the room by it. */
  fid: string;
  seed: number;
  living: boolean;
  /** Everything below is empty for a living household. */
  year: number | null;
  place: string | null;
  /** Country as Witness classified it. */
  rgn: string | null;
  cult: null;
  evidence: 'full' | 'lean';
  members: [string, string][];
  days: FsvDay[];
  persons: Record<string, FsvPerson>;
}

/** The days each census counted on, where the record's own year and country say which it was. */
const CENSUS_DAY: Record<string, string> = {
  'United States Federal|1790': '1790-08-02', 'United States Federal|1800': '1800-08-04',
  'United States Federal|1810': '1810-08-06', 'United States Federal|1820': '1820-08-07',
  'United States Federal|1830': '1830-06-01', 'United States Federal|1840': '1840-06-01',
  'United States Federal|1850': '1850-06-01', 'United States Federal|1860': '1860-06-01',
  'United States Federal|1870': '1870-06-01', 'United States Federal|1880': '1880-06-01',
  'United States Federal|1890': '1890-06-02', 'United States Federal|1900': '1900-06-01',
  'United States Federal|1910': '1910-04-15', 'United States Federal|1920': '1920-01-01',
  'United States Federal|1930': '1930-04-01', 'United States Federal|1940': '1940-04-01',
  'United States Federal|1950': '1950-04-01',
  'England|1841': '1841-06-06', 'England|1851': '1851-03-30', 'England|1861': '1861-04-07',
  'England|1871': '1871-04-02', 'England|1881': '1881-04-03', 'England|1891': '1891-04-05',
  'England|1901': '1901-03-31', 'England|1911': '1911-04-02'
};

/** Which census a residence row belongs to, from where and when — the source title is not in the index. */
function censusKind(country: string | null, year: number): string {
  const c = String(country || '').toLowerCase();
  if (/united states|usa/.test(c) && year >= 1790 && year % 10 === 0) return 'United States Federal';
  if (/england|united kingdom|wales/.test(c) && year >= 1841 && year % 10 === 1) return 'England';
  if (/scotland/.test(c) && year >= 1841 && year % 10 === 1) return 'Scotland';
  if (/canada/.test(c) && year >= 1871 && year % 10 === 1) return 'Canada';
  if (/ireland/.test(c) && year >= 1901 && year % 10 === 1) return 'Ireland';
  return 'Census';
}

function placeParts(index: TreeIndex, placeId: string | null | undefined) {
  const p = placeId ? index.places.get(placeId) : undefined;
  const parts = p ? (p.parts && p.parts.length ? p.parts : String(p.raw || '').split(',').map((x) => x.trim()).filter(Boolean)) : [];
  const out: { raw: string | null; town: string | null; county: string | null; state: string | null; country: string | null } = {
    raw: p ? p.raw : null,
    town: parts[0] ?? null,
    county: (parts.length >= 4 ? parts[parts.length - 3] : null) ?? null,
    state: (parts.length >= 3 ? parts[parts.length - 2] : null) ?? null,
    country: ((p && p.country) || (parts.length ? parts[parts.length - 1] : null)) ?? null
  };
  return out;
}

function personOf(p: TreeIndividual): FsvPerson {
  return {
    given: p.given_name ?? '',
    surname: p.surname ?? '',
    sex: p.sex === 'M' || p.sex === 'F' ? p.sex : 'U',
    born: p.birth_year,
    died: p.death_year
  };
}

/** The middle of the household's fullest years, inside its first twelve, cut short at a death. */
function fullestYear(hy: number, people: { rel: string; born: number | null; died: number | null }[]): number {
  const kids = people.filter((p) => p.rel === 'son' || p.rel === 'daughter');
  const adults = people.filter((p) => p.rel === 'head' || p.rel === 'wife');
  let end = hy + 12;
  adults.forEach((a) => { if (a.died !== null && a.died < end) end = a.died; });
  let best = 0;
  const years: number[] = [];
  for (let y = hy; y <= end; y++) {
    const n = kids.filter((c) => c.born !== null && c.born <= y && y - c.born < 15 && (c.died === null || c.died >= y)).length;
    if (n > best) { best = n; years.length = 0; }
    if (n === best) years.push(y);
  }
  return years.length ? (years[Math.floor((years.length - 1) / 2)] ?? hy) : hy;
}

/**
 * The household record for one family of the index, or null when the
 * index has no such family.
 */
export function fsvHouseholdRecord(index: TreeIndex, familyId: string): FsvHouseholdRecord | null {
  const f: TreeFamily | undefined = index.families.find((x) => x.id === familyId);
  if (!f) return null;
  const seed = fsvSeed(f.id);
  const ids = [f.husband_id, f.wife_id, ...(f.children ?? [])].filter((x): x is string => !!x);
  const people = ids.map((id) => index.individuals.get(id)).filter((p): p is TreeIndividual => !!p);
  const living = people.some((p) => p.living);
  const empty: FsvHouseholdRecord = { fid: f.id, seed, living, year: null, place: null, rgn: null, cult: null, evidence: 'lean', members: [], days: [], persons: {} };
  if (living) return empty;

  const persons: Record<string, FsvPerson> = {};
  const members: [string, string][] = [];
  const rel = new Map<string, string>();
  const join = (id: string | null | undefined, r: string) => {
    if (!id || rel.has(id)) return;
    const p = index.individuals.get(id); if (!p) return;
    rel.set(id, r); members.push([id, r]); persons[id] = personOf(p);
  };
  join(f.husband_id, 'head');
  join(f.wife_id, f.husband_id ? 'wife' : 'head');
  (f.children ?? []).forEach((c) => { const p = index.individuals.get(c); join(c, p && p.sex === 'F' ? 'daughter' : 'son'); });

  const married = placeParts(index, f.marriage_place_id);
  const year = f.marriage_year ?? null;

  /* the rows: every residence or census the record wrote on a member, by year */
  const byYear = new Map<number, { pid: string; year: number; town: string | null; county: string | null; state: string | null; country: string | null }[]>();
  index.events.forEach((e) => {
    if (e.eventType !== 'residence' && e.eventType !== 'census') return;
    if (!rel.has(e.individualId) || e.year === null || e.year === undefined) return;
    const pp = placeParts(index, e.placeId);
    if (!byYear.has(e.year)) byYear.set(e.year, []);
    byYear.get(e.year)!.push({ pid: e.individualId, year: e.year, town: pp.town, county: pp.county, state: pp.state, country: pp.country });
  });

  const days: FsvDay[] = [];
  [...byYear.keys()].sort((a, b) => a - b).forEach((y) => {
    if (year !== null && y < year) return;
    const rows = byYear.get(y)!;
    const anchor = rows.find((r) => r.pid === f.husband_id) || rows.find((r) => r.pid === f.wife_id);
    if (!anchor) return;
    const present: FsvDayPerson[] = [];
    rows.forEach((r) => {
      if (r.town !== anchor.town) return;
      if (present.some((q) => q.pid === r.pid)) return;
      const p = persons[r.pid];
      if (p && p.died !== null && p.died < y) return;
      present.push({ pid: r.pid });
    });
    if (present.length < 2) return;
    const kind = censusKind(anchor.country, y);
    days.push({ year: y, date: CENSUS_DAY[kind + '|' + y] ?? null, census: kind, town: anchor.town, county: anchor.county,
      state: anchor.state, country: anchor.country, present, implied: [] });
  });

  if (!days.length && year !== null) {
    const now = members.map(([pid, r]) => { const q = persons[pid]; return { pid, rel: r, born: q ? q.born : null, died: q ? q.died : null }; });
    const y = fullestYear(year, now);
    const present = now.filter((p) => {
      const alive = p.died === null || p.died >= y;
      if (p.rel === 'head' || p.rel === 'wife') return alive && (p.born === null || p.born <= y);
      return (p.rel === 'son' || p.rel === 'daughter') && p.born !== null && p.born <= y && y - p.born < 15 && alive;
    }).map((p) => ({ pid: p.pid }));
    if (present.length) {
      days.push({ year: y, date: null, census: null, town: married.town, county: null, state: married.state, country: married.country, present, implied: [], thin: true });
    }
  }

  return {
    fid: f.id, seed, living: false,
    year, place: married.raw, rgn: married.country, cult: null,
    evidence: year !== null && married.raw ? 'full' : 'lean',
    members, days, persons
  };
}
