import { describe, expect, it } from 'vitest';
import { filterAndSortPeople, nameSortKey, normalizeForSearch, type PeopleListPerson, type PeopleTier } from '../peopleList.js';

const people: PeopleListPerson[] = [
  { id: 'ezekiel', fullName: 'Ezekiel Howe', birthYear: 1720, deathYear: 1796 },
  { id: 'abigail', fullName: 'Abigail Howe', birthYear: 1750, deathYear: null },
  { id: 'lottie', fullName: 'Charlotte "Lottie" Anna Weld', birthYear: 1880, deathYear: 1969 },
  { id: 'rebecca', fullName: 'Rebecca Towne', birthYear: 1621, deathYear: 1692 },
  { id: 'unknown', fullName: 'Mary Field', birthYear: null, deathYear: 1700 },
];
const tiers: Record<string, PeopleTier> = { ezekiel: 'direct', abigail: 'blood', lottie: 'distant', rebecca: 'direct', unknown: 'none' };
const tierOf = (id: string) => tiers[id] ?? 'none';
const self = (p: PeopleListPerson) => p;
const ids = (rows: PeopleListPerson[]) => rows.map((r) => r.id);

describe('name folding', () => {
  it('sorts surname first, then given names, ignoring nicknames', () => {
    expect(nameSortKey({ fullName: 'Charlotte "Lottie" Anna Weld' })).toBe('weld|charlotte anna');
    expect(nameSortKey({ fullName: 'Ezekiel Howe' })).toBe('howe|ezekiel');
    expect(nameSortKey({ fullName: 'Ezekiel Howe', surname: 'Howe' })).toBe('howe|ezekiel');
  });
  it('search ignores case, quotes, and dots', () => {
    expect(normalizeForSearch('Charlotte "Lottie" A. Weld')).toBe('charlotte lottie a weld');
  });
});

describe('filterAndSortPeople', () => {
  it('keeps the list order when nothing is chosen', () => {
    expect(ids(filterAndSortPeople(people, self, tierOf, {}))).toEqual(ids(people));
  });

  it('searches every term against the folded name', () => {
    expect(ids(filterAndSortPeople(people, self, tierOf, { search: 'lottie' }))).toEqual(['lottie']);
    expect(ids(filterAndSortPeople(people, self, tierOf, { search: 'howe ab' }))).toEqual(['abigail']);
  });

  it('filters by relationship tier, any of the chosen', () => {
    expect(ids(filterAndSortPeople(people, self, tierOf, { tiers: ['direct'] }))).toEqual(['ezekiel', 'rebecca']);
    expect(ids(filterAndSortPeople(people, self, tierOf, { tiers: ['blood', 'none'] }))).toEqual(['abigail', 'unknown']);
    expect(ids(filterAndSortPeople(people, self, tierOf, { tiers: [] }))).toHaveLength(5);
  });

  it('sorts A–Z by surname then given name', () => {
    expect(ids(filterAndSortPeople(people, self, tierOf, { sort: ['name'] }))).toEqual([
      'unknown',
      'abigail',
      'ezekiel',
      'rebecca',
      'lottie',
    ]);
  });

  it('stacks sort keys in the order chosen', () => {
    // Relationship first (direct, blood, distant, none), then A–Z inside each tier.
    expect(ids(filterAndSortPeople(people, self, tierOf, { sort: ['relationship', 'name'] }))).toEqual([
      'ezekiel',
      'rebecca',
      'abigail',
      'lottie',
      'unknown',
    ]);
    // A–Z first: the two Howes stay together and relationship only breaks ties.
    expect(ids(filterAndSortPeople(people, self, tierOf, { sort: ['name', 'relationship'] }))).toEqual([
      'unknown',
      'abigail',
      'ezekiel',
      'rebecca',
      'lottie',
    ]);
  });

  it('sorts by birth and death year with unknowns last', () => {
    expect(ids(filterAndSortPeople(people, self, tierOf, { sort: ['birth'] }))).toEqual([
      'rebecca',
      'ezekiel',
      'abigail',
      'lottie',
      'unknown',
    ]);
    expect(ids(filterAndSortPeople(people, self, tierOf, { sort: ['death'] }))).toEqual([
      'rebecca',
      'unknown',
      'ezekiel',
      'lottie',
      'abigail',
    ]);
  });

  it('applies filter and search and sort together', () => {
    expect(
      ids(filterAndSortPeople(people, self, tierOf, { tiers: ['direct', 'blood'], search: 'howe', sort: ['birth'] })),
    ).toEqual(['ezekiel', 'abigail']);
  });
});
