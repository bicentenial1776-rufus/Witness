/**
 * Pre-filled searches of the big record sites. The post-1820 arrival
 * records (Castle Garden, Ellis Island) are public but live behind
 * search boxes nobody can bulk-hold — so where Witness cannot carry the
 * list, it opens the door already unlocked: a search URL filled in with
 * what the tree knows. Every result page is a question for the reader,
 * never a claim (the Find a Grave rule — see grave-link.ts, whose
 * deep-link-and-confirm pattern this follows).
 */

export interface SearchSubject {
  fullName: string;
  birthYear: number | null;
  deathYear?: number | null;
  birthPlace?: string | null;
}

/**
 * Given/surname split for search boxes. Generational suffixes aren't
 * surnames — "Ariel Cooke Sr" must search lastname=Cooke, not
 * lastname=Sr. Missing halves come back empty, never blocking.
 */
export function splitSearchName(fullName: string): { firstname: string; lastname: string } {
  const SUFFIX = /^(sr|jr|i{1,3}|iv|v|esq)\.?,?$/i;
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && SUFFIX.test(tokens[tokens.length - 1])) tokens.pop();
  const lastname = tokens.length ? tokens[tokens.length - 1] : '';
  const firstname = tokens.slice(0, -1).join(' ');
  return { firstname, lastname };
}

/** FamilySearch record search across all collections — free to search;
    an account only gates the record images. */
export function familySearchRecordsUrl(subject: SearchSubject): string {
  const { firstname, lastname } = splitSearchName(subject.fullName);
  const params = new URLSearchParams();
  if (firstname) params.set('q.givenName', firstname);
  if (lastname) params.set('q.surname', lastname);
  if (subject.birthYear) {
    params.set('q.birthLikeDate.from', String(subject.birthYear - 2));
    params.set('q.birthLikeDate.to', String(subject.birthYear + 2));
  }
  if (subject.deathYear) {
    params.set('q.deathLikeDate.from', String(subject.deathYear - 2));
    params.set('q.deathLikeDate.to', String(subject.deathYear + 2));
  }
  if (subject.birthPlace) params.set('q.birthLikePlace', subject.birthPlace);
  return `https://www.familysearch.org/search/record/results?${params.toString()}`;
}

/** The New York arrival-list collections on FamilySearch, by era. */
const ARRIVAL_COLLECTIONS = [
  // Ellis Island era — New York Passenger Arrival Lists, 1892–1924.
  { from: 1892, to: 1924, id: '1368704', label: 'the Ellis Island lists' },
  // Famine Irish index carved from the Castle Garden years.
  { from: 1846, to: 1851, id: '2110821', label: 'the Famine-era arrival index' },
  // Castle Garden era — New York Passenger Lists, 1820–1891 (NARA M237).
  { from: 1820, to: 1891, id: '1849782', label: 'the Castle Garden lists' },
] as const;

export interface ArrivalsSearch {
  url: string;
  /** Human name for the collection the link opens, for the door's copy. */
  collectionLabel: string;
}

/**
 * An era-aware search of the New York arrival lists, or null for
 * crossings before the federal lists begin (1820) — those eras are what
 * the Crossing Library itself holds.
 */
export function familySearchArrivalsUrl(
  subject: SearchSubject,
  arrivalYear: number,
): ArrivalsSearch | null {
  const collection = ARRIVAL_COLLECTIONS.find((c) => arrivalYear >= c.from && arrivalYear <= c.to);
  if (!collection) return null;
  const { firstname, lastname } = splitSearchName(subject.fullName);
  const params = new URLSearchParams();
  if (firstname) params.set('q.givenName', firstname);
  if (lastname) params.set('q.surname', lastname);
  if (subject.birthYear) {
    params.set('q.birthLikeDate.from', String(subject.birthYear - 2));
    params.set('q.birthLikeDate.to', String(subject.birthYear + 2));
  }
  params.set('f.collectionId', collection.id);
  return {
    url: `https://www.familysearch.org/search/record/results?${params.toString()}`,
    collectionLabel: collection.label,
  };
}

/** Ancestry's immigration & travel category search, for readers who hold
    an Ancestry subscription (category 40 = Immigration & Emigration). */
export function ancestryImmigrationSearchUrl(subject: SearchSubject): string {
  const { firstname, lastname } = splitSearchName(subject.fullName);
  const params = new URLSearchParams();
  const name = [firstname, lastname].filter(Boolean).join('_');
  if (name) params.set('name', name);
  if (subject.birthYear) params.set('birth', String(subject.birthYear));
  return `https://www.ancestry.com/search/categories/40/?${params.toString()}`;
}
