import { MAX_DOCUMENTED_LIFESPAN_YEARS } from './aliveDuring.js';
import { parentsByChild, type TreeIndex, type TreeIndividual } from './treeIndex.js';

/**
 * Section II of the query library — Life Milestones and Patterns. Every
 * function is a pure aggregation over a TreeIndex; anything with an
 * implausible documented lifespan (usually two conflated same-name
 * ancestors) is excluded rather than crowned longest-lived.
 */

/** Documented lifespan in years, or null when unknowable or implausible. */
export function lifespanOf(person: TreeIndividual): number | null {
  if (person.birth_year === null || person.death_year === null) return null;
  const span = person.death_year - person.birth_year;
  if (span < 0 || span > MAX_DOCUMENTED_LIFESPAN_YEARS) return null;
  return span;
}

export interface LifespanEntry {
  individual: TreeIndividual;
  lifespan: number;
}

function lifespans(index: TreeIndex): LifespanEntry[] {
  const entries: LifespanEntry[] = [];
  for (const person of index.individuals.values()) {
    const lifespan = lifespanOf(person);
    if (lifespan !== null) entries.push({ individual: person, lifespan });
  }
  return entries;
}

/** Who lived the longest? */
export function longestLived(index: TreeIndex, limit = 10): LifespanEntry[] {
  return lifespans(index)
    .sort((a, b) => b.lifespan - a.lifespan || a.individual.full_name.localeCompare(b.individual.full_name))
    .slice(0, limit);
}

/** Who died the youngest, excluding infant mortality (age < minAge)? */
export function diedYoungest(index: TreeIndex, minAge = 5, limit = 10): LifespanEntry[] {
  return lifespans(index)
    .filter((entry) => entry.lifespan >= minAge)
    .sort((a, b) => a.lifespan - b.lifespan || a.individual.full_name.localeCompare(b.individual.full_name))
    .slice(0, limit);
}

/** Who died in infancy (before age 5)? */
export function diedInInfancy(index: TreeIndex, maxAge = 5): LifespanEntry[] {
  return lifespans(index)
    .filter((entry) => entry.lifespan < maxAge)
    .sort((a, b) => (a.individual.birth_year ?? 0) - (b.individual.birth_year ?? 0));
}

/** Who reached a given age (90, 100, …)? Oldest first. */
export function reachedAge(index: TreeIndex, minAge: number): LifespanEntry[] {
  return lifespans(index)
    .filter((entry) => entry.lifespan >= minAge)
    .sort((a, b) => b.lifespan - a.lifespan);
}

export interface CohortLifespan {
  /** Century of birth, e.g. 1600 for the 1600s. */
  century: number;
  count: number;
  averageLifespan: number;
}

/**
 * Average lifespan by birth century, ascending — the "has lifespan
 * increased over generations?" trend line in one shape.
 */
export function averageLifespanByCentury(index: TreeIndex): CohortLifespan[] {
  const byCentury = new Map<number, number[]>();
  for (const entry of lifespans(index)) {
    const century = Math.floor(entry.individual.birth_year! / 100) * 100;
    if (!byCentury.has(century)) byCentury.set(century, []);
    byCentury.get(century)!.push(entry.lifespan);
  }
  return [...byCentury.entries()]
    .map(([century, spans]) => ({
      century,
      count: spans.length,
      averageLifespan: spans.reduce((a, b) => a + b, 0) / spans.length,
    }))
    .sort((a, b) => a.century - b.century);
}

export interface SurnameLifespan {
  surname: string;
  count: number;
  averageLifespan: number;
}

/** Average lifespan by surname line, longest-lived lines first. */
export function averageLifespanBySurname(index: TreeIndex, minCount = 3): SurnameLifespan[] {
  const bySurname = new Map<string, number[]>();
  for (const entry of lifespans(index)) {
    const surname = entry.individual.surname;
    if (!surname) continue;
    if (!bySurname.has(surname)) bySurname.set(surname, []);
    bySurname.get(surname)!.push(entry.lifespan);
  }
  return [...bySurname.entries()]
    .filter(([, spans]) => spans.length >= minCount)
    .map(([surname, spans]) => ({
      surname,
      count: spans.length,
      averageLifespan: spans.reduce((a, b) => a + b, 0) / spans.length,
    }))
    .sort((a, b) => b.averageLifespan - a.averageLifespan);
}

export interface DecadeCount {
  decade: number;
  count: number;
}

/** Deaths per decade — which decade had the highest mortality? */
export function mortalityByDecade(index: TreeIndex): DecadeCount[] {
  const byDecade = new Map<number, number>();
  for (const person of index.individuals.values()) {
    if (person.death_year === null) continue;
    const decade = Math.floor(person.death_year / 10) * 10;
    byDecade.set(decade, (byDecade.get(decade) ?? 0) + 1);
  }
  return [...byDecade.entries()]
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => b.count - a.count || a.decade - b.decade);
}

// Marriage ------------------------------------------------------------------

export interface MarriageAge {
  individual: TreeIndividual;
  spouse: TreeIndividual | null;
  marriageYear: number;
  ageAtMarriage: number;
}

const MIN_MARRIAGE_AGE = 10;
const MAX_MARRIAGE_AGE = 90;

/**
 * Age at first marriage for everyone whose earliest dated marriage and
 * birth year are both known. Implausible ages are record anomalies and
 * are excluded.
 */
export function firstMarriageAges(index: TreeIndex): MarriageAge[] {
  const earliest = new Map<string, { year: number; spouseId: string | null }>();
  for (const family of index.families) {
    if (family.marriage_year === null) continue;
    for (const [selfId, spouseId] of [
      [family.husband_id, family.wife_id],
      [family.wife_id, family.husband_id],
    ] as const) {
      if (!selfId) continue;
      const known = earliest.get(selfId);
      if (!known || family.marriage_year < known.year) {
        earliest.set(selfId, { year: family.marriage_year, spouseId });
      }
    }
  }

  const ages: MarriageAge[] = [];
  for (const [selfId, { year, spouseId }] of earliest) {
    const individual = index.individuals.get(selfId);
    if (!individual || individual.birth_year === null) continue;
    const age = year - individual.birth_year;
    if (age < MIN_MARRIAGE_AGE || age > MAX_MARRIAGE_AGE) continue;
    ages.push({
      individual,
      spouse: spouseId ? (index.individuals.get(spouseId) ?? null) : null,
      marriageYear: year,
      ageAtMarriage: age,
    });
  }
  return ages;
}

export interface CohortMarriageAge {
  /** Century of the marriage, e.g. 1700 for the 1700s. */
  century: number;
  count: number;
  averageAge: number;
}

/** Average age at first marriage by era (century of the marriage). */
export function averageAgeAtFirstMarriageByCentury(index: TreeIndex): CohortMarriageAge[] {
  const byCentury = new Map<number, number[]>();
  for (const record of firstMarriageAges(index)) {
    const century = Math.floor(record.marriageYear / 100) * 100;
    if (!byCentury.has(century)) byCentury.set(century, []);
    byCentury.get(century)!.push(record.ageAtMarriage);
  }
  return [...byCentury.entries()]
    .map(([century, ages]) => ({
      century,
      count: ages.length,
      averageAge: ages.reduce((a, b) => a + b, 0) / ages.length,
    }))
    .sort((a, b) => a.century - b.century);
}

/** Average age at first marriage by sex ('M' | 'F'; unknowns excluded). */
export function averageAgeAtFirstMarriageBySex(index: TreeIndex): { sex: 'M' | 'F'; count: number; averageAge: number }[] {
  const bySex = new Map<'M' | 'F', number[]>();
  for (const record of firstMarriageAges(index)) {
    const sex = record.individual.sex;
    if (sex === 'U') continue;
    if (!bySex.has(sex)) bySex.set(sex, []);
    bySex.get(sex)!.push(record.ageAtMarriage);
  }
  return [...bySex.entries()].map(([sex, ages]) => ({
    sex,
    count: ages.length,
    averageAge: ages.reduce((a, b) => a + b, 0) / ages.length,
  }));
}

/** Who married the youngest and the oldest? */
export function marriageAgeExtremes(index: TreeIndex, limit = 5): { youngest: MarriageAge[]; oldest: MarriageAge[] } {
  const sorted = firstMarriageAges(index).sort((a, b) => a.ageAtMarriage - b.ageAtMarriage);
  return { youngest: sorted.slice(0, limit), oldest: sorted.slice(-limit).reverse() };
}

export interface MarriageCount {
  individual: TreeIndividual;
  marriages: number;
}

/** Who was married more than once? Most marriages first. */
export function marriedMoreThanOnce(index: TreeIndex): MarriageCount[] {
  const counts = new Map<string, number>();
  for (const family of index.families) {
    for (const spouseId of [family.husband_id, family.wife_id]) {
      if (spouseId) counts.set(spouseId, (counts.get(spouseId) ?? 0) + 1);
    }
  }
  const result: MarriageCount[] = [];
  for (const [id, marriages] of counts) {
    if (marriages < 2) continue;
    const individual = index.individuals.get(id);
    if (individual) result.push({ individual, marriages });
  }
  return result.sort((a, b) => b.marriages - a.marriages || a.individual.full_name.localeCompare(b.individual.full_name));
}

/**
 * Who never married, based on available records? Adults only — anyone
 * documented as dying before 16 never had the chance, and living people
 * may yet.
 */
export function neverMarried(index: TreeIndex): TreeIndividual[] {
  const married = new Set<string>();
  for (const family of index.families) {
    if (family.husband_id) married.add(family.husband_id);
    if (family.wife_id) married.add(family.wife_id);
  }
  const result: TreeIndividual[] = [];
  for (const person of index.individuals.values()) {
    if (married.has(person.id) || person.living) continue;
    const lifespan = lifespanOf(person);
    if (lifespan !== null && lifespan < 16) continue;
    result.push(person);
  }
  return result.sort((a, b) => (a.birth_year ?? 0) - (b.birth_year ?? 0));
}

export interface MarriageDuration {
  husband: TreeIndividual | null;
  wife: TreeIndividual | null;
  marriageYear: number;
  /** Approximated as marriage → the earlier spouse death. */
  years: number;
}

/** The longest marriages, approximated by the earlier of the death dates. */
export function longestMarriages(index: TreeIndex, limit = 10): MarriageDuration[] {
  const durations: MarriageDuration[] = [];
  for (const family of index.families) {
    if (family.marriage_year === null) continue;
    const husband = family.husband_id ? (index.individuals.get(family.husband_id) ?? null) : null;
    const wife = family.wife_id ? (index.individuals.get(family.wife_id) ?? null) : null;
    const deaths = [husband?.death_year, wife?.death_year].filter((y): y is number => y != null);
    if (deaths.length < 2) continue; // an open end would overstate the marriage
    const years = Math.min(...deaths) - family.marriage_year;
    if (years < 0 || years > MAX_DOCUMENTED_LIFESPAN_YEARS) continue;
    durations.push({ husband, wife, marriageYear: family.marriage_year, years });
  }
  return durations.sort((a, b) => b.years - a.years).slice(0, limit);
}

export interface Widowing {
  individual: TreeIndividual;
  /** Spouses who died within this person's documented lifetime. */
  spousesOutlived: number;
  remarried: boolean;
}

/**
 * Who was widowed and remarried — and who was widowed multiple times?
 * A spouse counts as outlived when their death falls before this
 * person's own (or this person has no recorded death).
 */
export function widowings(index: TreeIndex): Widowing[] {
  const spousesOf = new Map<string, string[]>();
  const marriageYearsOf = new Map<string, number[]>();
  for (const family of index.families) {
    for (const [selfId, spouseId] of [
      [family.husband_id, family.wife_id],
      [family.wife_id, family.husband_id],
    ] as const) {
      if (!selfId) continue;
      if (spouseId) {
        if (!spousesOf.has(selfId)) spousesOf.set(selfId, []);
        spousesOf.get(selfId)!.push(spouseId);
      }
      if (family.marriage_year !== null) {
        if (!marriageYearsOf.has(selfId)) marriageYearsOf.set(selfId, []);
        marriageYearsOf.get(selfId)!.push(family.marriage_year);
      }
    }
  }

  const result: Widowing[] = [];
  for (const [selfId, spouseIds] of spousesOf) {
    const individual = index.individuals.get(selfId);
    if (!individual) continue;
    const spouseDeaths: number[] = [];
    for (const spouseId of spouseIds) {
      const spouse = index.individuals.get(spouseId);
      if (!spouse || spouse.death_year === null) continue;
      if (individual.death_year === null || spouse.death_year < individual.death_year) {
        spouseDeaths.push(spouse.death_year);
      }
    }
    if (!spouseDeaths.length) continue;
    // Remarriage needs a second family record; where every marriage is
    // dated, at least one must postdate a spouse's death — otherwise the
    // record order is trusted (marriage years are often absent).
    const marriageYears = marriageYearsOf.get(selfId) ?? [];
    const remarried =
      spouseIds.length > 1 &&
      (marriageYears.length < spouseIds.length ||
        spouseDeaths.some((death) => marriageYears.some((year) => year > death)));
    result.push({ individual, spousesOutlived: spouseDeaths.length, remarried });
  }
  return result.sort((a, b) => b.spousesOutlived - a.spousesOutlived);
}

/** Widowed and remarried (Section II's dedicated row). */
export function widowedAndRemarried(index: TreeIndex): Widowing[] {
  return widowings(index).filter((w) => w.remarried);
}

/** Widowed multiple times. */
export function widowedMultipleTimes(index: TreeIndex): Widowing[] {
  return widowings(index).filter((w) => w.spousesOutlived >= 2);
}

// Children ------------------------------------------------------------------

export interface ChildrenCount {
  individual: TreeIndividual;
  children: number;
}

/** Who had the most children (documented)? */
export function mostChildren(index: TreeIndex, limit = 10): ChildrenCount[] {
  const counts = new Map<string, Set<string>>();
  for (const family of index.families) {
    for (const parentId of [family.husband_id, family.wife_id]) {
      if (!parentId) continue;
      if (!counts.has(parentId)) counts.set(parentId, new Set());
      for (const child of family.children) counts.get(parentId)!.add(child);
    }
  }
  const result: ChildrenCount[] = [];
  for (const [id, children] of counts) {
    const individual = index.individuals.get(id);
    if (individual && children.size > 0) result.push({ individual, children: children.size });
  }
  return result
    .sort((a, b) => b.children - a.children || a.individual.full_name.localeCompare(b.individual.full_name))
    .slice(0, limit);
}

export interface CohortFamilySize {
  century: number;
  familyCount: number;
  averageChildren: number;
}

/** Average children per family by century of the marriage. */
export function averageChildrenPerFamilyByCentury(index: TreeIndex): CohortFamilySize[] {
  const byCentury = new Map<number, number[]>();
  for (const family of index.families) {
    if (family.marriage_year === null) continue;
    const century = Math.floor(family.marriage_year / 100) * 100;
    if (!byCentury.has(century)) byCentury.set(century, []);
    byCentury.get(century)!.push(family.children.length);
  }
  return [...byCentury.entries()]
    .map(([century, sizes]) => ({
      century,
      familyCount: sizes.length,
      averageChildren: sizes.reduce((a, b) => a + b, 0) / sizes.length,
    }))
    .sort((a, b) => a.century - b.century);
}

export interface FamilySurvival {
  familyId: string;
  husband: TreeIndividual | null;
  wife: TreeIndividual | null;
  children: number;
  /** Children who reached 18, or have no recorded death. */
  survivedToAdulthood: number;
}

/** Which families had the most children who survived to adulthood? */
export function familiesBySurvivingChildren(index: TreeIndex, limit = 10): FamilySurvival[] {
  const result: FamilySurvival[] = [];
  for (const family of index.families) {
    if (!family.children.length) continue;
    let survived = 0;
    for (const childId of family.children) {
      const child = index.individuals.get(childId);
      if (!child) continue;
      const lifespan = lifespanOf(child);
      if (lifespan === null ? child.death_year === null : lifespan >= 18) survived++;
    }
    result.push({
      familyId: family.id,
      husband: family.husband_id ? (index.individuals.get(family.husband_id) ?? null) : null,
      wife: family.wife_id ? (index.individuals.get(family.wife_id) ?? null) : null,
      children: family.children.length,
      survivedToAdulthood: survived,
    });
  }
  return result.sort((a, b) => b.survivedToAdulthood - a.survivedToAdulthood).slice(0, limit);
}

export interface LateParenthood {
  parent: TreeIndividual;
  child: TreeIndividual;
  parentAge: number;
}

/** Who had children late in life (after `minAge`)? Oldest first. */
export function lateParenthood(index: TreeIndex, minAge = 45): LateParenthood[] {
  const result: LateParenthood[] = [];
  for (const family of index.families) {
    for (const parentId of [family.husband_id, family.wife_id]) {
      if (!parentId) continue;
      const parent = index.individuals.get(parentId);
      if (!parent || parent.birth_year === null) continue;
      for (const childId of family.children) {
        const child = index.individuals.get(childId);
        if (!child || child.birth_year === null) continue;
        const parentAge = child.birth_year - parent.birth_year;
        if (parentAge >= minAge && parentAge <= MAX_DOCUMENTED_LIFESPAN_YEARS) {
          result.push({ parent, child, parentAge });
        }
      }
    }
  }
  return result.sort((a, b) => b.parentAge - a.parentAge);
}

// Generations ---------------------------------------------------------------

/**
 * Longest documented ancestor chain anywhere in the tree, in generations
 * (a person with no documented parents spans 1). Cycle-safe: a data-error
 * loop contributes no further depth.
 */
export function treeGenerationSpan(index: TreeIndex): number {
  const parents = parentsByChild(index);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  function depth(id: string): number {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let best = 0;
    for (const parentId of parents.get(id) ?? []) best = Math.max(best, depth(parentId));
    visiting.delete(id);
    memo.set(id, best + 1);
    return best + 1;
  }

  let span = 0;
  for (const id of index.individuals.keys()) span = Math.max(span, depth(id));
  return span;
}

export interface GenerationLifespan {
  /** Generations up from the root person: 0 = the root, 1 = parents, … */
  generation: number;
  count: number;
  averageLifespan: number | null;
}

/**
 * Direct ancestors of a root person grouped by generation distance, with
 * each generation's average documented lifespan — "which generation had
 * the shortest average lifespan?" and "how many generations separate me
 * from my oldest ancestor?" in one shape.
 */
export function ancestorGenerations(index: TreeIndex, rootId: string): GenerationLifespan[] {
  const parents = parentsByChild(index);
  const generationOf = new Map<string, number>([[rootId, 0]]);
  let frontier = [rootId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const parentId of parents.get(id) ?? []) {
        if (generationOf.has(parentId)) continue;
        generationOf.set(parentId, generationOf.get(id)! + 1);
        next.push(parentId);
      }
    }
    frontier = next;
  }

  const byGeneration = new Map<number, number[]>();
  const counts = new Map<number, number>();
  for (const [id, generation] of generationOf) {
    counts.set(generation, (counts.get(generation) ?? 0) + 1);
    const person = index.individuals.get(id);
    const lifespan = person ? lifespanOf(person) : null;
    if (lifespan !== null) {
      if (!byGeneration.has(generation)) byGeneration.set(generation, []);
      byGeneration.get(generation)!.push(lifespan);
    }
  }

  return [...counts.entries()]
    .map(([generation, count]) => {
      const spans = byGeneration.get(generation) ?? [];
      return {
        generation,
        count,
        averageLifespan: spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : null,
      };
    })
    .sort((a, b) => a.generation - b.generation);
}

export interface SurnameLineDepth {
  surname: string;
  count: number;
  /** MIN birth_year in the line — which line goes back the furthest. */
  earliestBirthYear: number | null;
  /**
   * Latest birth year among the line's terminal ancestors (people with no
   * documented parents) — which lines go cold soonest.
   */
  lineColdAt: number | null;
}

/** Per-surname depth: furthest back, and where the paper trail goes cold. */
export function surnameLineDepths(index: TreeIndex, minCount = 3): SurnameLineDepth[] {
  const parents = parentsByChild(index);
  const lines = new Map<string, { count: number; earliest: number | null; coldAt: number | null }>();
  for (const person of index.individuals.values()) {
    if (!person.surname) continue;
    if (!lines.has(person.surname)) lines.set(person.surname, { count: 0, earliest: null, coldAt: null });
    const line = lines.get(person.surname)!;
    line.count++;
    if (person.birth_year !== null) {
      line.earliest = line.earliest === null ? person.birth_year : Math.min(line.earliest, person.birth_year);
      if (!(parents.get(person.id) ?? []).length) {
        line.coldAt = line.coldAt === null ? person.birth_year : Math.max(line.coldAt, person.birth_year);
      }
    }
  }
  return [...lines.entries()]
    .filter(([, line]) => line.count >= minCount)
    .map(([surname, line]) => ({
      surname,
      count: line.count,
      earliestBirthYear: line.earliest,
      lineColdAt: line.coldAt,
    }))
    .sort((a, b) => (a.earliestBirthYear ?? Infinity) - (b.earliestBirthYear ?? Infinity));
}

/**
 * The oldest ancestor whose birth year the record states exactly —
 * "verified" in the audit's sense (date_confidence = 'exact').
 */
export function oldestVerifiedAncestor(index: TreeIndex): TreeIndividual | null {
  const exactBirths = new Set<string>();
  for (const event of index.events) {
    if (event.eventType === 'birth' && event.dateConfidence === 'exact' && event.year !== null) {
      exactBirths.add(event.individualId);
    }
  }
  let oldest: TreeIndividual | null = null;
  for (const id of exactBirths) {
    const person = index.individuals.get(id);
    if (!person || person.birth_year === null) continue;
    if (!oldest || person.birth_year < oldest.birth_year!) oldest = person;
  }
  return oldest;
}
