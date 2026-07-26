import { classifyAliveDuring, type AliveMatch } from './aliveDuring.js';
import { lifespanOf, longestLived, marriedMoreThanOnce, mostChildren } from './milestones.js';
import type { TreeIndex, TreeIndividual } from './treeIndex.js';

/**
 * The Query Library: a server-side catalog of questions (query_catalog
 * table) evaluated client-side against the TreeIndex. The catalog grows
 * without app releases; every entry reduces to one of the `kind`s below.
 * Presentation rule: entries are always shown WITH their live result count
 * for the user's tree — a personalized answer list, never a generic menu.
 */

export interface LibraryCatalogEntry {
  id: string;
  category: string;
  title: string;
  detail: string | null;
  keywords: string[];
  kind: string;
  params: Record<string, unknown>;
  sort_order: number;
}

export interface LibraryCategory {
  id: string;
  title: string;
  blurb: string;
}

/** Display metadata for catalog categories, in shelf order. */
export const LIBRARY_CATEGORIES: LibraryCategory[] = [
  {
    id: 'wartime',
    title: 'Lives in wartime',
    blurb: 'Who was alive — and who was of fighting age — when the wars came.',
  },
  {
    id: 'great-events',
    title: "Their world's great events",
    blurb: 'The moments of history your family lived through.',
  },
  {
    id: 'long-lives',
    title: 'Long lives & short',
    blurb: 'The lifespans behind the dates — remarkable, and heartbreaking.',
  },
  {
    id: 'family-patterns',
    title: 'Family patterns',
    blurb: 'Households, marriages, and the shapes families took.',
  },
  {
    id: 'where-they-lived',
    title: 'Where they lived',
    blurb: 'The regions and countries your family called home.',
  },
];

export interface LibraryMatch {
  individual: TreeIndividual;
  /** One short annotation for the result row, e.g. "age 21 when it began". */
  note: string | null;
}

function aliveNote(match: AliveMatch): string {
  if (match.bornDuring) return `born during — ${match.individual.birth_year}`;
  if (match.ageAtStart !== null) {
    // A probable match must never wear documented-style wording — the
    // hedge travels with the age (2026-07-26 audit).
    return match.confidence === 'probable'
      ? `likely alive · age ${match.ageAtStart} when it began`
      : `age ${match.ageAtStart} when it began`;
  }
  return match.confidence === 'probable' ? 'likely alive — years partly missing' : '';
}

function years(person: TreeIndividual): string {
  return `${person.birth_year ?? '?'}–${person.living ? '' : (person.death_year ?? '?')}`;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Living people count toward age thresholds by their age so far. */
function ageSoFar(person: TreeIndividual, currentYear: number): number | null {
  const span = lifespanOf(person);
  if (span !== null) return span;
  if (person.living && person.birth_year !== null) return currentYear - person.birth_year;
  return null;
}

export function evaluateLibraryQuery(
  index: TreeIndex,
  entry: LibraryCatalogEntry,
  currentYear = new Date().getFullYear(),
): LibraryMatch[] {
  const people = [...index.individuals.values()];
  const p = entry.params;

  switch (entry.kind) {
    case 'alive_during': {
      const range = { startYear: num(p.start_year, 0), endYear: num(p.end_year, 0) };
      const matches: LibraryMatch[] = [];
      for (const person of people) {
        const match = classifyAliveDuring(person, range);
        if (match) matches.push({ individual: person, note: aliveNote(match) || null });
      }
      return matches.sort(
        (a, b) => (a.individual.birth_year ?? 9999) - (b.individual.birth_year ?? 9999),
      );
    }

    case 'birth_window': {
      const from = num(p.birth_from, -Infinity);
      const to = num(p.birth_to, Infinity);
      const sex = typeof p.sex === 'string' ? p.sex : null;
      return people
        .filter(
          (person) =>
            person.birth_year !== null &&
            person.birth_year >= from &&
            person.birth_year <= to &&
            (!sex || person.sex === sex),
        )
        .sort((a, b) => a.birth_year! - b.birth_year!)
        .map((person) => ({ individual: person, note: `born ${person.birth_year}` }));
    }

    case 'survived': {
      const year = num(p.alive_year, 0);
      const past = num(p.survive_past, year);
      const matches: LibraryMatch[] = [];
      for (const person of people) {
        const alive = classifyAliveDuring(person, { startYear: year, endYear: year });
        if (!alive) continue;
        // Survival is a positive claim: it needs a recorded death past the
        // threshold or a living flag. A person with no death record may
        // have died in the very event — they are not a survivor
        // (2026-07-26 audit).
        const survived =
          person.living || (person.death_year !== null && person.death_year > past);
        if (!survived) continue;
        matches.push({
          individual: person,
          note:
            person.death_year !== null ? `lived on to ${person.death_year}` : 'still living',
        });
      }
      return matches.sort(
        (a, b) => (a.individual.birth_year ?? 9999) - (b.individual.birth_year ?? 9999),
      );
    }

    case 'reached_age': {
      const min = num(p.min, 90);
      return people
        .map((person) => ({ person, age: ageSoFar(person, currentYear) }))
        .filter((x): x is { person: TreeIndividual; age: number } => x.age !== null && x.age >= min)
        .sort((a, b) => b.age - a.age)
        .map(({ person, age }) => ({
          individual: person,
          note: person.living ? `${age} and counting` : `lived to ${age}`,
        }));
    }

    case 'age_at_death': {
      const from = num(p.from, 0);
      const to = num(p.to, Infinity);
      return people
        .map((person) => ({ person, span: lifespanOf(person) }))
        .filter(
          (x): x is { person: TreeIndividual; span: number } =>
            x.span !== null && !x.person.living && x.span >= from && x.span <= to,
        )
        .sort((a, b) => a.span - b.span || (a.person.birth_year ?? 0) - (b.person.birth_year ?? 0))
        .map(({ person, span }) => ({
          individual: person,
          note: span === 0 ? 'died in infancy' : `died at ${span}`,
        }));
    }

    case 'century_span': {
      const minCenturies = num(p.min_centuries, 3);
      return people
        .filter(
          (person) =>
            person.birth_year !== null &&
            person.death_year !== null &&
            Math.floor(person.death_year / 100) - Math.floor(person.birth_year / 100) >=
              minCenturies - 1,
        )
        .sort((a, b) => a.birth_year! - b.birth_year!)
        .map((person) => ({ individual: person, note: years(person) }));
    }

    case 'born_before': {
      const year = num(p.year, 1700);
      return people
        .filter((person) => person.birth_year !== null && person.birth_year <= year)
        .sort((a, b) => a.birth_year! - b.birth_year!)
        .map((person) => ({ individual: person, note: `born ${person.birth_year}` }));
    }

    case 'longest_lived': {
      return longestLived(index, num(p.limit, 25)).map((entry) => ({
        individual: entry.individual,
        note: `lived to ${entry.lifespan}`,
      }));
    }

    case 'most_children': {
      return mostChildren(index, num(p.limit, 25)).map((entry) => ({
        individual: entry.individual,
        note: `${entry.children} children`,
      }));
    }

    case 'married_more_than_once': {
      return marriedMoreThanOnce(index)
        .sort((a, b) => b.marriages - a.marriages)
        .map((entry) => ({
          individual: entry.individual,
          note: `${entry.marriages} marriages`,
        }));
    }

    case 'place_lived': {
      const needles = Array.isArray(p.needles)
        ? (p.needles as string[]).map((n) => n.toLowerCase())
        : [];
      if (needles.length === 0) return [];
      const matchingPlaces = new Map<string, string>();
      for (const place of index.places.values()) {
        const haystacks = [place.raw, ...place.parts, place.region ?? '', place.country ?? ''];
        if (haystacks.some((h) => needles.some((n) => h.toLowerCase().includes(n)))) {
          matchingPlaces.set(place.id, place.parts[0] ?? place.raw);
        }
      }
      const seen = new Map<string, string>();
      for (const event of index.events) {
        if (event.placeId && matchingPlaces.has(event.placeId) && !seen.has(event.individualId)) {
          seen.set(event.individualId, matchingPlaces.get(event.placeId)!);
        }
      }
      const matches: LibraryMatch[] = [];
      for (const [individualId, placeName] of seen) {
        const person = index.individuals.get(individualId);
        if (person) matches.push({ individual: person, note: placeName });
      }
      return matches.sort(
        (a, b) => (a.individual.birth_year ?? 9999) - (b.individual.birth_year ?? 9999),
      );
    }

    default:
      // Unknown kind: an older app meeting a newer catalog. Show nothing
      // rather than something wrong.
      return [];
  }
}
