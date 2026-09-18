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
 * The words on a census row — "Occupation: Boot Bottomer; Relation to
 * Head: Wife" — and the row's source title ride on the event's `detail`
 * (parseEvent, for RESI and CENS). So a day is a day a CENSUS counted:
 * a residence whose source names no census is a residence, not a day; a
 * relation the row states is kept and a row that puts a person in
 * somebody else's house (a servant, a boarder) is left out; an occupation
 * is written on the person for that day. A file whose export wrote none of
 * that falls back to the family record's relations and no occupations.
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
  /** As the census row says it, where it says it. */
  relation?: string;
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

/** The row's own words, from the event's detail: "Occupation: X; Relation to Head: Y", and its source titles. */
function rowWords(detail: string | null | undefined): { fields: Record<string, string>; sources: string[] } {
  const fields: Record<string, string> = {};
  const sources: string[] = [];
  String(detail || '').split(/[;\n]/).forEach((part) => {
    const src = part.match(/^\s*Source:\s*(.+)$/);
    if (src) { sources.push(src[1]!.trim()); return; }
    const m = part.match(/^\s*([A-Za-z][A-Za-z \-/']{1,40}?)\s*:\s*(.*)$/);
    if (m) fields[m[1]!.trim().toLowerCase()] = m[2]!.trim();
  });
  return { fields, sources };
}
/** Which census a source title names, and its year: "1880 United States Federal Census", "1871 Census of Canada". */
function censusFromTitles(titles: string[]): { kind: string; year: number } | null {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  for (const t of titles) {
    const m = t.match(/(\d{4}) (United States Federal|England|Scotland|Wales|Canada|Ireland)\b[^,;]*Census/i);
    const of = t.match(/(\d{4}) Census of (Canada|Ireland)/i) || t.match(/Census of (Canada|Ireland),? (\d{4})/i);
    const st = t.match(/(State|Provincial) Census/i);
    if (m) return { kind: m[2]!, year: +m[1]! };
    if (of) return /^\d/.test(of[1]!) ? { kind: cap(of[2]!), year: +of[1]! } : { kind: cap(of[1]!), year: +of[2]! };
    if (st) return { kind: 'State', year: 0 };
  }
  return null;
}
/* a relation that puts a person in somebody else's house */
const ELSEWHERE = /^(servant|boarder|lodger|roomer|hired|employee|inmate|patient|prisoner|visitor)/i;

/** Which census a residence row belongs to, from where and when — for a file whose export names no source. */
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

  /* the household's place: the marriage's where the record gives one, else
     the head's earliest placed event, else the wife's — program.ts's own
     rule (placeOf). Without it a household with no marriage place had no
     country, so no door: 900 of Greg's 1,431 (19 September 2026). */
  const earliestPlaced = (id: string | null | undefined) => {
    if (!id) return null;
    const ev = index.events.filter((e) => e.individualId === id && e.placeId).sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))[0];
    return ev ? ev.placeId : null;
  };
  const placeId = f.marriage_place_id || earliestPlaced(f.husband_id) || earliestPlaced(f.wife_id) || null;
  const married = placeParts(index, placeId);
  /* the household's year: the marriage where the record gives one, else the
     head's birth and twenty-five (the wife's, failing that) — program.ts's
     own rule, flagged lean. Without it a household with no marriage date
     had no year, so no thin day, so no door: 900 of Greg's 1,431. */
  const headP = index.individuals.get(f.husband_id ?? '') ?? index.individuals.get(f.wife_id ?? '');
  const wifeP = index.individuals.get(f.wife_id ?? '');
  const guessed = f.marriage_year === null || f.marriage_year === undefined;
  const year: number | null = !guessed ? f.marriage_year! : (headP && headP.birth_year !== null ? headP.birth_year + 25 : (wifeP && wifeP.birth_year !== null ? wifeP.birth_year + 25 : null));

  /* the rows: every census the record wrote on a member, by year. A
     residence is a row only when its source names a census, or when the
     export named no sources at all (then every residence is taken, as the
     first version of this read took them). */
  type Row = { pid: string; year: number; town: string | null; county: string | null; state: string | null; country: string | null; said: string; occupation: string | null; kind: string | null };
  const byYear = new Map<number, Row[]>();
  const anySources = index.events.some((e) => (e.eventType === 'residence' || e.eventType === 'census') && /(^|\n)Source:/.test(String(e.detail || '')));
  index.events.forEach((e) => {
    if (e.eventType !== 'residence' && e.eventType !== 'census') return;
    if (!rel.has(e.individualId) || e.year === null || e.year === undefined) return;
    const w = rowWords(e.detail);
    const census = censusFromTitles(w.sources);
    if (anySources && !census && e.eventType !== 'census') return;
    /* a census that asked where everyone lived five years before gives a residence, not a day */
    if (census && census.year && census.year !== e.year) return;
    const pp = placeParts(index, e.placeId);
    if (!byYear.has(e.year)) byYear.set(e.year, []);
    byYear.get(e.year)!.push({ pid: e.individualId, year: e.year, town: pp.town, county: pp.county, state: pp.state, country: pp.country,
      said: (w.fields['relation to head'] || w.fields['relation to head of house'] || '').toLowerCase(),
      occupation: w.fields['occupation'] || null, kind: census ? census.kind : null });
  });

  const days: FsvDay[] = [];
  [...byYear.keys()].sort((a, b) => a - b).forEach((y) => {
    if (year !== null && y < year) return;
    const rows = byYear.get(y)!;
    /* whose house: the head or the wife on a row that is not somebody
       else's house. "head" or "self" makes them the head; "wife" makes the
       head her husband; a row that says nothing is the husband's house. */
    const couple = rows.filter((r) => (r.pid === f.husband_id || r.pid === f.wife_id) && /^(|head|self|wife|husband)$/.test(r.said));
    if (!couple.length) return;
    const anchor = couple.find((r) => /^(head|self)$/.test(r.said)) || couple.find((r) => r.pid === f.husband_id) || couple[0]!;
    const present: FsvDayPerson[] = [];
    rows.forEach((r) => {
      if (r.town !== anchor.town || ELSEWHERE.test(r.said)) return;
      if (present.some((q) => q.pid === r.pid)) return;
      const p = persons[r.pid];
      if (p && p.died !== null && p.died < y) return;
      const q: FsvDayPerson = { pid: r.pid };
      if (r.said) q.relation = r.said;
      if (r.occupation) q.occupation = r.occupation;
      present.push(q);
    });
    if (present.length < 2) return;
    const kind = anchor.kind || censusKind(anchor.country, y);
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
    evidence: !guessed && !!f.marriage_place_id ? 'full' : 'lean',
    members, days, persons
  };
}
