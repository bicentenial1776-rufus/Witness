import type { GedcomEvent } from '../types/witness.js';

/** Birth years after this are considered within a plausible living range. */
export const LIVING_BIRTH_YEAR_THRESHOLD = 1920;

/**
 * A person is flagged as likely living when there's no death record at all
 * and their birth year falls after the plausible-living threshold. A DEAT
 * tag with an unparseable date (e.g. "DECEASED") still counts as a death
 * record — presence of the tag matters more than whether we could parse it.
 */
export function flagLiving(birth: GedcomEvent | undefined, hasDeathRecord: boolean): boolean {
  if (hasDeathRecord) return false;
  const birthYear = birth?.date?.year;
  return birthYear != null && birthYear > LIVING_BIRTH_YEAR_THRESHOLD;
}
