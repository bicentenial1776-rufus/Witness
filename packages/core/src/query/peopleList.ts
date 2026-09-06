import { splitName } from '../history/passengers.js';

/**
 * One filter-and-order for every list of people in the app (Rufus,
 * 2026-09-06): a name search, a relationship filter, and sort keys that
 * STACK — choosing Relationship then A–Z then Birth orders by all three
 * in that priority. Pure; the screens hand in their rows and a way to
 * read the person out of each, and get the rows back in order.
 */

export type PeopleTier = 'direct' | 'blood' | 'distant' | 'none';
export type PeopleSortKey = 'name' | 'relationship' | 'birth' | 'death';

export interface PeopleListPerson {
  id: string;
  fullName: string;
  /** When the row carries a surname column, prefer it over splitting the name. */
  surname?: string | null;
  birthYear: number | null;
  deathYear: number | null;
}

export interface PeopleListQuery {
  /** Case-blind; every whitespace-separated term must appear in the name. */
  search?: string;
  /** Empty or absent = everyone. */
  tiers?: PeopleTier[];
  /** Priority order. Empty = the list's own order. */
  sort?: PeopleSortKey[];
}

const TIER_RANK: Record<PeopleTier, number> = { direct: 0, blood: 1, distant: 2, none: 3 };

/** Quotes, nicknames' marks, and dots folded away so "Lottie" finds Charlotte "Lottie". */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/["“”'‘’.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The genealogist's order: surname first, then the given names. */
export function nameSortKey(person: Pick<PeopleListPerson, 'fullName' | 'surname'>): string {
  const cleaned = person.fullName.replace(/["“”][^"“”]*["“”]/g, ' ').replace(/\*+/g, ' ');
  const split = splitName(cleaned);
  const surname = (person.surname ?? split.surname).trim().toLowerCase();
  const given = (person.surname ? cleaned.replace(person.surname, '') : split.givenNames)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${surname}|${given}`;
}

function matchesSearch(name: string, search: string): boolean {
  const terms = normalizeForSearch(search).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeForSearch(name);
  return terms.every((term) => haystack.includes(term));
}

/** Unknown years sort last whichever direction the known ones run. */
function compareYears(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

export function filterAndSortPeople<T>(
  rows: T[],
  person: (row: T) => PeopleListPerson,
  tierOf: (id: string) => PeopleTier,
  query: PeopleListQuery,
): T[] {
  const tiers = query.tiers && query.tiers.length > 0 ? new Set(query.tiers) : null;
  const search = query.search?.trim() ?? '';
  const sort = query.sort ?? [];

  const kept = rows.filter((row) => {
    const p = person(row);
    if (tiers && !tiers.has(tierOf(p.id))) return false;
    if (search && !matchesSearch(p.fullName, search)) return false;
    return true;
  });
  if (sort.length === 0) return kept;

  // Decorate once: the sort keys are cheap but the name split is not free
  // across a few thousand rows and several stacked comparisons.
  const decorated = kept.map((row, index) => {
    const p = person(row);
    return { row, index, name: nameSortKey(p), tier: TIER_RANK[tierOf(p.id)], birth: p.birthYear, death: p.deathYear };
  });
  decorated.sort((a, b) => {
    for (const key of sort) {
      const c =
        key === 'name'
          ? a.name.localeCompare(b.name)
          : key === 'relationship'
            ? a.tier - b.tier
            : key === 'birth'
              ? compareYears(a.birth, b.birth)
              : compareYears(a.death, b.death);
      if (c !== 0) return c;
    }
    return a.index - b.index;
  });
  return decorated.map((d) => d.row);
}
