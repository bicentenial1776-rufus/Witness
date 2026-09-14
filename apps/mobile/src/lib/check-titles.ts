import type { HealthCheckId } from '@witness/core/query';

/**
 * The human wording for each Tree Check category — shared by the workbench
 * and the punch list so a row reads identically wherever the reader meets
 * it (and in the worksheets both export).
 */
export const CHECK_TITLES: Record<HealthCheckId, string> = {
  birth_after_death: 'Born after dying',
  burial_before_death: 'Buried before dying',
  father_too_old: 'Father implausibly old',
  mother_too_old: 'Mother implausibly old',
  father_too_young: 'Father implausibly young',
  mother_too_young: 'Mother implausibly young',
  born_after_mothers_death: 'Born after the mother’s death',
  born_long_after_fathers_death: 'Born years after the father’s death',
  implausible_lifespan: 'Lifespans past 110',
  fact_before_birth: 'Facts dated before birth',
  fact_after_death: 'Facts dated after death',
  marriage_after_death: 'Married after dying',
  marriage_before_13: 'Married before age 13',
  living_but_has_death: 'Living, but with a death recorded',
  duplicate_fact: 'The same fact recorded twice',
  conflicting_fact: 'Conflicting dates for one fact',
  possible_duplicate_person: 'Possibly the same person, entered twice',
  husband_recorded_female: 'Husband recorded as female',
  wife_recorded_male: 'Wife recorded as male',
  same_surname_couple: 'Couples sharing a surname',
  sibling_born_too_soon: 'Siblings born close together',
  sibling_born_impossibly_soon: 'Siblings born impossibly close',
  date_in_future: 'Dates in the future',
};
