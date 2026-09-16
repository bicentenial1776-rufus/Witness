import type { WitnessSupabaseClient } from '../supabase/client.js';
import { fetchAllPages, PAGE_SIZE } from '../supabase/paginate.js';

/**
 * Temporal query: who in a tree was alive during a year range?
 *
 * Works entirely off the denormalized birth_year/death_year columns on
 * `individuals` (indexed for exactly this), then classifies matches
 * client-side so the confidence rules live in one testable place.
 */

/**
 * Assumed maximum lifespan when one endpoint of a life is undocumented.
 * Deliberately tighter than the longest documented lifespans: a birth-only
 * person who'd be 95 during an event was overwhelmingly likely dead, and
 * showing them as a probable witness reads as a data error.
 */
export const MAX_LIFESPAN_YEARS = 90;

/**
 * Documented lifespans above this are treated as record anomalies (usually
 * two conflated same-name ancestors) and excluded rather than shown as,
 * say, a 123-year-old witness. Anomalies are research leads, not matches.
 */
export const MAX_DOCUMENTED_LIFESPAN_YEARS = 100;

export interface YearRange {
  startYear: number;
  endYear: number;
}

/**
 * documented — both endpoints of the overlap are supported by recorded years
 * probable — the overlap relies on an assumed lifespan for a missing year
 */
export type AliveConfidence = 'documented' | 'probable';

export interface AliveCandidate {
  id: string;
  full_name: string;
  sex: 'M' | 'F' | 'U';
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

export interface AliveMatch {
  individual: AliveCandidate;
  confidence: AliveConfidence;
  /** Age when the range began; null when unknown or born mid-range. */
  ageAtStart: number | null;
  bornDuring: boolean;
  diedDuring: boolean;
}

export interface AliveDuringResult {
  matches: AliveMatch[];
  documentedCount: number;
  probableCount: number;
}

/**
 * Pure classification rule. Returns null when the person cannot be placed
 * in the range. Living persons with no death year are treated as alive
 * from birth onward.
 */
export function classifyAliveDuring(person: AliveCandidate, range: YearRange): AliveMatch | null {
  const { startYear, endYear } = range;
  const birth = person.birth_year;
  const death = person.death_year;

  let confidence: AliveConfidence;
  if (birth !== null && birth > endYear) return null;

  if (birth !== null && death !== null) {
    // Impossible lifespans are record anomalies, not witnesses.
    if (death - birth < 0 || death - birth > MAX_DOCUMENTED_LIFESPAN_YEARS) return null;
    if (death < startYear) return null;
    confidence = 'documented';
  } else if (birth !== null && death === null) {
    if (person.living) {
      confidence = 'documented';
    } else {
      if (birth + MAX_LIFESPAN_YEARS < startYear) return null;
      confidence = 'probable';
    }
  } else if (birth === null && death !== null) {
    if (death < startYear || death - MAX_LIFESPAN_YEARS > endYear) return null;
    confidence = 'probable';
  } else {
    return null;
  }

  const bornDuring = birth !== null && birth >= startYear && birth <= endYear;
  const diedDuring = death !== null && death >= startYear && death <= endYear;
  const ageAtStart = birth !== null && !bornDuring ? startYear - birth : null;

  return { individual: person, confidence, ageAtStart, bornDuring, diedDuring };
}

const CANDIDATE_COLUMNS = 'id, full_name, sex, birth_year, death_year, living';

/**
 * Fetches candidates with the range pushed down to Postgres, then applies
 * classifyAliveDuring. Matches come back oldest-first, documented before
 * probable at the same birth year.
 */
export async function aliveDuring(
  client: WitnessSupabaseClient,
  treeId: string,
  range: YearRange,
): Promise<AliveDuringResult> {
  const { startYear, endYear } = range;

  // Known birth year: born by the end of the range, not known to have died
  // before it began. (A null birth_year never satisfies lte, so these are
  // exactly the birth-documented candidates.)
  const withBirth = await fetchAllPages<AliveCandidate>((after) => {
    let q = client
      .from('individuals')
      .select(CANDIDATE_COLUMNS)
      .eq('tree_id', treeId)
      .lte('birth_year', endYear)
      .or(`death_year.gte.${startYear},death_year.is.null`)
      .order('id')
      .limit(PAGE_SIZE);
    if (after) q = q.gt('id', after.id);
    return q;
  }, 'Temporal query failed');

  // Unknown birth year: place them by death year within an assumed lifespan.
  const birthUnknown = await fetchAllPages<AliveCandidate>((after) => {
    let q = client
      .from('individuals')
      .select(CANDIDATE_COLUMNS)
      .eq('tree_id', treeId)
      .is('birth_year', null)
      .gte('death_year', startYear)
      .lte('death_year', endYear + MAX_LIFESPAN_YEARS)
      .order('id')
      .limit(PAGE_SIZE);
    if (after) q = q.gt('id', after.id);
    return q;
  }, 'Temporal query failed');

  const matches: AliveMatch[] = [];
  for (const person of [...withBirth, ...birthUnknown]) {
    const match = classifyAliveDuring(person, range);
    if (match) matches.push(match);
  }

  matches.sort((a, b) => {
    const aBirth = a.individual.birth_year ?? Number.MAX_SAFE_INTEGER;
    const bBirth = b.individual.birth_year ?? Number.MAX_SAFE_INTEGER;
    if (aBirth !== bBirth) return aBirth - bBirth;
    if (a.confidence !== b.confidence) return a.confidence === 'documented' ? -1 : 1;
    return a.individual.full_name.localeCompare(b.individual.full_name);
  });

  return {
    matches,
    documentedCount: matches.filter((m) => m.confidence === 'documented').length,
    probableCount: matches.filter((m) => m.confidence === 'probable').length,
  };
}
