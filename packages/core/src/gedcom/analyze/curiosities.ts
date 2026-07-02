import type { Curiosity, Family, Individual } from '../types/witness.js';

const MAX_PLAUSIBLE_LIFESPAN_YEARS = 110;
const MIN_PARENT_AGE_AT_CHILD_BIRTH = 12;
const MAX_MOTHER_AGE_AT_CHILD_BIRTH = 60;
const MAX_FATHER_AGE_AT_CHILD_BIRTH = 80;
const MAX_SIBLING_BIRTH_GAP_YEARS = 15;

function birthYear(individual: Individual | undefined): number | null {
  return individual?.birth?.date?.year ?? null;
}

function deathYear(individual: Individual | undefined): number | null {
  return individual?.death?.date?.year ?? null;
}

function detectIndividualCuriosities(individual: Individual): Curiosity[] {
  const curiosities: Curiosity[] = [];
  const birth = birthYear(individual);
  const death = deathYear(individual);

  if (birth != null && death != null) {
    if (death < birth) {
      curiosities.push({
        type: 'death_before_birth',
        message: `${individual.name.full} has a death year (${death}) before their birth year (${birth}).`,
        individualIds: [individual.id],
      });
    } else if (death - birth > MAX_PLAUSIBLE_LIFESPAN_YEARS) {
      curiosities.push({
        type: 'implausible_lifespan',
        message: `${individual.name.full} would have lived ${death - birth} years (${birth}–${death}), which is unusually long.`,
        individualIds: [individual.id],
      });
    }
  }

  return curiosities;
}

function detectParentChildCuriosities(
  parent: Individual | undefined,
  child: Individual,
  maxAge: number,
): Curiosity[] {
  if (!parent) return [];
  const parentBirth = birthYear(parent);
  const childBirth = birthYear(child);
  if (parentBirth == null || childBirth == null) return [];

  const ageAtBirth = childBirth - parentBirth;
  const curiosities: Curiosity[] = [];

  if (ageAtBirth <= 0) {
    curiosities.push({
      type: 'child_born_before_parent',
      message: `${child.name.full} (b. ${childBirth}) appears to be born before or the same year as ${parent.name.full} (b. ${parentBirth}).`,
      individualIds: [child.id, parent.id],
    });
  } else if (ageAtBirth < MIN_PARENT_AGE_AT_CHILD_BIRTH) {
    curiosities.push({
      type: 'parent_too_young',
      message: `${parent.name.full} would have been ${ageAtBirth} when ${child.name.full} was born.`,
      individualIds: [child.id, parent.id],
    });
  } else if (ageAtBirth > maxAge) {
    curiosities.push({
      type: 'parent_too_old',
      message: `${parent.name.full} would have been ${ageAtBirth} when ${child.name.full} was born.`,
      individualIds: [child.id, parent.id],
    });
  }

  return curiosities;
}

function detectFamilyCuriosities(
  family: Family,
  individuals: Map<string, Individual>,
): Curiosity[] {
  const curiosities: Curiosity[] = [];
  const husband = family.husbandId ? individuals.get(family.husbandId) : undefined;
  const wife = family.wifeId ? individuals.get(family.wifeId) : undefined;

  const marriageYear = family.marriage?.date?.year ?? null;
  if (marriageYear != null) {
    for (const spouse of [husband, wife]) {
      const spouseBirth = birthYear(spouse);
      if (spouse && spouseBirth != null && marriageYear < spouseBirth) {
        curiosities.push({
          type: 'marriage_before_birth',
          message: `Marriage in family ${family.id} is dated ${marriageYear}, before ${spouse.name.full}'s birth year (${spouseBirth}).`,
          individualIds: [spouse.id],
          familyId: family.id,
        });
      }
    }
  }

  const children = family.childIds
    .map((id) => individuals.get(id))
    .filter((c): c is Individual => Boolean(c));

  for (const c of children) {
    curiosities.push(...detectParentChildCuriosities(husband, c, MAX_FATHER_AGE_AT_CHILD_BIRTH));
    curiosities.push(...detectParentChildCuriosities(wife, c, MAX_MOTHER_AGE_AT_CHILD_BIRTH));
  }

  const birthYears = children
    .map((c) => birthYear(c))
    .filter((y): y is number => y != null)
    .sort((a, b) => a - b);

  for (let i = 1; i < birthYears.length; i++) {
    const gap = birthYears[i]! - birthYears[i - 1]!;
    if (gap > MAX_SIBLING_BIRTH_GAP_YEARS) {
      curiosities.push({
        type: 'large_sibling_date_gap',
        message: `Family ${family.id} has a ${gap}-year gap between children born in ${birthYears[i - 1]} and ${birthYears[i]}.`,
        individualIds: [],
        familyId: family.id,
      });
    }
  }

  return curiosities;
}

/**
 * Flags data anomalies as curiosities (not errors) — GEDCOM exports routinely
 * contain implausible dates from source transcription mistakes, and the goal
 * here is to surface them for review, not to reject the record.
 */
export function detectCuriosities(
  individuals: Map<string, Individual>,
  families: Map<string, Family>,
): Curiosity[] {
  const curiosities: Curiosity[] = [];

  for (const individual of individuals.values()) {
    curiosities.push(...detectIndividualCuriosities(individual));
  }

  for (const family of families.values()) {
    curiosities.push(...detectFamilyCuriosities(family, individuals));
  }

  return curiosities;
}
