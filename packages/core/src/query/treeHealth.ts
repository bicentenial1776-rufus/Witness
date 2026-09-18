import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { Database } from '../supabase/database.types.js';
import { fetchAllPages, PAGE_SIZE, seekAfter } from '../supabase/paginate.js';

/**
 * Tree Health: the forensic audit. Every check here is a pure function
 * over one fetched bundle, so a tree is auditable from the database at
 * runtime or from hand-built fixtures in tests.
 *
 * The check catalog is adapted from FTAnalyzer's data-error catalog
 * (https://github.com/ShammyLevva/FTAnalyzer, © Alexander Bisset and
 * contributors, Apache License 2.0) — see NOTICE at the repo root.
 *
 * Comparison philosophy: GEDCOM dates are partial (year, maybe month,
 * maybe day). A check only fires when the violation holds under the
 * loosest reading of the recorded precision — a missing month is never
 * assumed. False accusations cost more trust than missed catches.
 */

export type HealthSeverity = 'fail' | 'caution';

export type HealthCheckId =
  | 'birth_after_death'
  | 'burial_before_death'
  | 'father_too_old'
  | 'mother_too_old'
  | 'father_too_young'
  | 'mother_too_young'
  | 'born_after_mothers_death'
  | 'born_long_after_fathers_death'
  | 'implausible_lifespan'
  | 'fact_before_birth'
  | 'fact_after_death'
  | 'marriage_after_death'
  | 'marriage_before_13'
  | 'living_but_has_death'
  | 'duplicate_fact'
  | 'conflicting_fact'
  | 'possible_duplicate_person'
  | 'husband_recorded_female'
  | 'wife_recorded_male'
  | 'spouse_is_self'
  | 'same_surname_couple'
  | 'sibling_born_too_soon'
  | 'sibling_born_impossibly_soon'
  | 'date_in_future';

export interface HealthFinding {
  check: HealthCheckId;
  severity: HealthSeverity;
  /** Everyone implicated — first id is the primary subject. */
  individualIds: string[];
  familyId?: string;
  /** One editorial sentence, names and years included, ready to print. */
  detail: string;
}

/**
 * Stable fingerprint for a finding within one tree: the check plus the
 * sorted ids it accuses. Survives re-runs on the same tree (the data is
 * static between imports), dies with the tree on re-upload — which is
 * exactly the lifetime a "fixed" mark should have.
 */
export function findingKey(finding: Pick<HealthFinding, 'check' | 'individualIds'>): string {
  return `${finding.check}:${[...finding.individualIds].sort().join(',')}`;
}

/** A person's name reduced to a stable slug for key material. */
export function nameSlug(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

/**
 * Fingerprint that survives re-imports: the check plus the sorted GEDCOM
 * INDI xrefs it accuses, each fused with the person's name slug. Xrefs
 * are file-LOCAL (@I12@ exists in nearly every export), so the name is
 * what keeps a ruling from one file from silencing a different person's
 * finding in another (2026-07-26 audit). A fresh upload of the same file
 * re-derives the same key. Falls back to database ids for any person
 * without an xref (ruling then lives only as long as that tree, which is
 * the best available).
 */
export function findingXrefKey(
  finding: Pick<HealthFinding, 'check' | 'individualIds'>,
  people: Map<string, Pick<HealthIndividual, 'gedcom_xref'> & { full_name?: string | null }>,
): string {
  const refs = finding.individualIds.map((id) => {
    const person = people.get(id);
    const ref = person?.gedcom_xref ?? id;
    const slug = nameSlug(person?.full_name);
    return slug ? `${ref}~${slug}` : ref;
  });
  return `${finding.check}:${refs.sort().join(',')}`;
}

/**
 * The pre-2026-07-26 key format (xrefs only). Matching still honors it so
 * rulings stored before the name-fused format keep working; new rulings
 * are written with `findingXrefKey`.
 */
export function legacyFindingXrefKey(
  finding: Pick<HealthFinding, 'check' | 'individualIds'>,
  people: Map<string, Pick<HealthIndividual, 'gedcom_xref'> & { full_name?: string | null }>,
): string {
  const refs = finding.individualIds.map((id) => people.get(id)?.gedcom_xref ?? id);
  return `${finding.check}:${refs.sort().join(',')}`;
}

export interface TreeHealthReport {
  findings: HealthFinding[];
  /** Individuals examined — the denominator for any score. */
  individualsChecked: number;
  familiesChecked: number;
}

// ── Input bundle ─────────────────────────────────────────────────────

export interface HealthIndividual {
  id: string;
  /** GEDCOM INDI xref — stable across re-imports of the same file. */
  gedcom_xref: string | null;
  /**
   * Vendor person id (_UID / UID) — stable across exports even when the
   * file is renumbered, which xrefs are not. First key of the refresh
   * identity match (Katie review: stored + indexed, read by nothing).
   */
  ancestry_uid: string | null;
  full_name: string;
  surname: string | null;
  sex: 'M' | 'F' | 'U';
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

export interface HealthEvent {
  /** Present when fetched from the database (the pagination cursor). */
  id?: string;
  individual_id: string;
  event_type: Database['public']['Enums']['individual_event_type'];
  date_year: number | null;
  date_month: number | null;
  date_day: number | null;
  date_qualifier: Database['public']['Enums']['date_qualifier'] | null;
  place_id: string | null;
}

export interface HealthFamily {
  id: string;
  husband_id: string | null;
  wife_id: string | null;
  marriage_date_year: number | null;
  marriage_date_month: number | null;
  marriage_date_day: number | null;
  marriage_date_qualifier: Database['public']['Enums']['date_qualifier'] | null;
  children: string[];
}

export interface TreeHealthData {
  individuals: HealthIndividual[];
  events: HealthEvent[];
  families: HealthFamily[];
}

// ── Qualified-date arithmetic ────────────────────────────────────────
//
// The conviction philosophy, made mechanical: every date is an interval.
// An exact date is a point; BEF/AFT are one-sided bounds that can still
// PROVE a violation in one direction; ABT/EST/CAL claim no precision at
// all, and BET's stored year is a fabricated midpoint — none of those
// four may ever convict. Month/day only refine comparisons when both
// dates are exact.

type Qualifier = HealthEvent['date_qualifier'];

interface QualifiedDate {
  year: number;
  month: number | null;
  day: number | null;
  q: Qualifier;
}

function partial(
  year: number | null,
  month?: number | null,
  day?: number | null,
  q: Qualifier = null,
): QualifiedDate | null {
  if (year === null || year === undefined) return null;
  return { year, month: month ?? null, day: day ?? null, q };
}

/** Dates whose recorded precision can never prove anything. */
const unusable = (d: QualifiedDate | null): boolean =>
  d !== null &&
  (d.q === 'about' || d.q === 'estimated' || d.q === 'calculated' || d.q === 'between' || d.q === 'unknown');

const isExact = (q: Qualifier): boolean => q === null || q === 'exact';

/** Earliest year the record allows. */
const loYear = (d: QualifiedDate): number => (d.q === 'before' ? -Infinity : d.year);
/** Latest year the record allows. */
const hiYear = (d: QualifiedDate): number => (d.q === 'after' ? Infinity : d.year);

/**
 * True only when `a` is PROVABLY after `b` under the recorded precision
 * and qualifiers: a's earliest possible year beats b's latest, or the
 * years agree exactly (both unqualified) and month/day prove it.
 */
function definitelyAfter(a: QualifiedDate, b: QualifiedDate): boolean {
  if (unusable(a) || unusable(b)) return false;
  if (loYear(a) > hiYear(b)) return true;
  if (!isExact(a.q) || !isExact(b.q)) return false; // a bound can't prove within-year order
  if (a.year !== b.year) return false;
  if (a.month === null || b.month === null) return false;
  if (a.month !== b.month) return a.month > b.month;
  if (a.day === null || b.day === null) return false;
  return a.day > b.day;
}

/** Days between two fully-specified dates (b - a). */
function daysBetween(a: QualifiedDate, b: QualifiedDate): number | null {
  if (a.month === null || a.day === null || b.month === null || b.day === null) return null;
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

const isEstimate = (q: Qualifier) => !isExact(q);

/**
 * Pre-1752 English/colonial records dual-date January–March (the old year
 * ran to 24 March), so day arithmetic between such dates is off by a year
 * as often as not — no sibling conviction may rest on one.
 */
const dualDatingRisk = (d: QualifiedDate): boolean =>
  d.year <= 1752 && d.month !== null && d.month <= 3;

// ── The audit ────────────────────────────────────────────────────────

/** Thresholds follow FTAnalyzer's catalog; the ±1 slack absorbs year-only precision. */
const MAX_LIFESPAN = 110;
const MOTHER_MAX_AGE = 61;
const FATHER_MAX_AGE = 91;
const PARENT_MIN_AGE = 12; // flag at ≤12: a 13-year-old parent with year-only dates could be 12 or 14
const MARRIAGE_MIN_AGE = 12;
const TWIN_WINDOW_DAYS = 2;
const IMPOSSIBLE_SIBLING_GAP_DAYS = 210; // < 7 months
const SUSPECT_SIBLING_GAP_DAYS = 266; // < 38 weeks
// Matches query/structure.ts's duplicateCandidates default — same name, birth
// years this close, and it's worth a human look rather than treating it as fact.
const DUPLICATE_NAME_BIRTH_YEAR_TOLERANCE = 2;

export function runTreeHealth(data: TreeHealthData, options: { currentYear: number }): TreeHealthReport {
  const { currentYear } = options;
  const findings: HealthFinding[] = [];
  const people = new Map(data.individuals.map((i) => [i.id, i]));
  const name = (id: string | null | undefined) => (id && people.get(id)?.full_name) || 'Unknown';

  const eventsByPerson = new Map<string, HealthEvent[]>();
  for (const event of data.events) {
    if (!eventsByPerson.has(event.individual_id)) eventsByPerson.set(event.individual_id, []);
    eventsByPerson.get(event.individual_id)!.push(event);
  }
  const eventDate = (personId: string, type: HealthEvent['event_type']): QualifiedDate | null => {
    for (const e of eventsByPerson.get(personId) ?? []) {
      if (e.event_type === type && e.date_year !== null)
        return partial(e.date_year, e.date_month, e.date_day, e.date_qualifier);
    }
    return null;
  };
  // Denormalized years lose their qualifiers at import, but they are
  // DERIVED from the events — so recover the qualifier from the event
  // whenever one exists, and treat a bare fallback year as exact.
  const vital = (person: HealthIndividual, type: 'birth' | 'death'): QualifiedDate | null =>
    eventDate(person.id, type) ??
    partial(type === 'birth' ? person.birth_year : person.death_year);

  // Individual-level checks
  for (const person of data.individuals) {
    const birth = vital(person, 'birth');
    const death = vital(person, 'death');
    const burial = eventDate(person.id, 'burial');

    if (birth && death && definitelyAfter(birth, death)) {
      findings.push({
        check: 'birth_after_death',
        severity: 'fail',
        individualIds: [person.id],
        detail: `${person.full_name} is recorded as born in ${birth.year}, after dying in ${death.year}.`,
      });
    }

    if (death && burial && definitelyAfter(death, burial)) {
      findings.push({
        check: 'burial_before_death',
        severity: 'fail',
        individualIds: [person.id],
        detail: `${person.full_name} is recorded as buried in ${burial.year}, before dying in ${death.year}.`,
      });
    }

    // The lifespan that must hold even under the bounds: latest possible
    // birth to earliest possible death. ABT/EST/CAL/BET endpoints claim no
    // precision and never convict.
    if (birth && death && !unusable(birth) && !unusable(death)) {
      const minLifespan = loYear(death) - hiYear(birth);
      if (Number.isFinite(minLifespan) && minLifespan > MAX_LIFESPAN) {
        findings.push({
          check: 'implausible_lifespan',
          severity: 'fail',
          individualIds: [person.id],
          detail: `${person.full_name} would have died aged ${minLifespan} (${birth.year}–${death.year}).`,
        });
      }
    }

    if (person.living && (person.death_year !== null || death || burial)) {
      findings.push({
        check: 'living_but_has_death',
        severity: 'fail',
        individualIds: [person.id],
        detail: `${person.full_name} is flagged as living but has a death or burial recorded.`,
      });
    }

    // Facts outside the lifespan: residence is the only stored event type
    // that must fall within it (burial rightly follows death).
    for (const event of eventsByPerson.get(person.id) ?? []) {
      if (event.event_type !== 'residence' || event.date_year === null) continue;
      const when = partial(event.date_year, event.date_month, event.date_day, event.date_qualifier)!;
      if (birth && definitelyAfter(birth, when)) {
        findings.push({
          check: 'fact_before_birth',
          severity: 'fail',
          individualIds: [person.id],
          detail: `${person.full_name} has a residence recorded in ${when.year}, before their ${birth.year} birth.`,
        });
      } else if (death && definitelyAfter(when, death)) {
        findings.push({
          check: 'fact_after_death',
          severity: 'fail',
          individualIds: [person.id],
          detail: `${person.full_name} has a residence recorded in ${when.year}, after their ${death.year} death.`,
        });
      }
    }

    // Duplicate and conflicting facts: birth and death should be singular.
    // Two records conflict only when they disagree at their SHARED
    // precision — "1850" and "15 JUN 1850" are the same fact twice, not
    // two different dates.
    for (const type of ['birth', 'death'] as const) {
      const dated = (eventsByPerson.get(person.id) ?? []).filter(
        (e) => e.event_type === type && e.date_year !== null,
      );
      if (dated.length < 2) continue;
      const disagree = (a: HealthEvent, b: HealthEvent): boolean => {
        if (a.date_year !== b.date_year) return true;
        if (a.date_month === null || b.date_month === null) return false;
        if (a.date_month !== b.date_month) return true;
        if (a.date_day === null || b.date_day === null) return false;
        return a.date_day !== b.date_day;
      };
      const conflicting = dated.some((a, i) => dated.slice(i + 1).some((b) => disagree(a, b)));
      if (conflicting) {
        const years = [...new Set(dated.map((e) => e.date_year!))].sort((a, b) => a - b).join(', ');
        findings.push({
          check: 'conflicting_fact',
          severity: 'caution',
          individualIds: [person.id],
          detail: `${person.full_name} has ${dated.length} different ${type} dates recorded (${years}).`,
        });
      } else {
        findings.push({
          check: 'duplicate_fact',
          severity: 'caution',
          individualIds: [person.id],
          detail: `${person.full_name} has the same ${type} recorded ${dated.length} times.`,
        });
      }
    }

    // Future dates. A "BEF 2030" allows a past date, so only a date whose
    // EARLIEST reading is still in the future convicts.
    for (const date of [birth, death]) {
      if (date && loYear(date) > currentYear) {
        findings.push({
          check: 'date_in_future',
          severity: 'fail',
          individualIds: [person.id],
          detail: `${person.full_name} has a date recorded in the future (${date.year}).`,
        });
        break;
      }
    }
  }

  // Family-level checks
  for (const family of data.families) {
    const husband = family.husband_id ? people.get(family.husband_id) : undefined;
    const wife = family.wife_id ? people.get(family.wife_id) : undefined;
    const marriage = partial(
      family.marriage_date_year,
      family.marriage_date_month,
      family.marriage_date_day,
      family.marriage_date_qualifier,
    );

    // Sex-and-role checks. Rich Douglass's file (2026-09-18) showed why the
    // sentence must name BOTH spouses with their recorded sexes: "Gertrude
    // is recorded as female but appears as a husband" blamed Gertrude when
    // the error was her wife Leland recorded as female; and a family whose
    // husband and wife are the same record (a marriage to oneself — a
    // mis-linked spouse in the source) is its own kind of finding, not a
    // sex error.
    const sexWord = (p: HealthIndividual) => (p.sex === 'M' ? 'male' : p.sex === 'F' ? 'female' : 'of unrecorded sex');
    const childCount = family.children.length;
    if (husband && wife && husband.id === wife.id) {
      findings.push({
        check: 'spouse_is_self',
        severity: 'fail',
        individualIds: [husband.id],
        familyId: family.id,
        detail: `${husband.full_name} is recorded as both husband and wife of the same family${childCount > 0 ? ` (with ${childCount} ${childCount === 1 ? 'child' : 'children'})` : ''} — a marriage to themselves. The spouse in that family is probably mis-linked at your source.`,
      });
    } else {
      if (husband && husband.sex === 'F') {
        findings.push({
          check: 'husband_recorded_female',
          severity: 'caution',
          individualIds: wife ? [husband.id, wife.id] : [husband.id],
          familyId: family.id,
          detail: wife
            ? `${husband.full_name} (recorded female) is the husband in a marriage to ${wife.full_name} (recorded ${sexWord(wife)}) — one of the two records is likely wrong.`
            : `${husband.full_name} is recorded as female but stands as the husband of a family with no wife recorded.`,
        });
      }
      if (wife && wife.sex === 'M') {
        findings.push({
          check: 'wife_recorded_male',
          severity: 'caution',
          individualIds: husband ? [wife.id, husband.id] : [wife.id],
          familyId: family.id,
          detail: husband
            ? `${wife.full_name} (recorded male) is the wife in a marriage to ${husband.full_name} (recorded ${sexWord(husband)}) — one of the two records is likely wrong.`
            : `${wife.full_name} is recorded as male but stands as the wife of a family with no husband recorded.`,
        });
      }
    }

    if (husband?.surname && wife?.surname && husband.surname === wife.surname) {
      findings.push({
        check: 'same_surname_couple',
        severity: 'caution',
        individualIds: [husband.id, wife.id],
        familyId: family.id,
        detail: `${husband.full_name} and ${wife.full_name} share the surname ${husband.surname} — maiden name recorded as married name, or kin marriage worth confirming.`,
      });
    }

    if (marriage && !unusable(marriage)) {
      if (loYear(marriage) > currentYear) {
        findings.push({
          check: 'date_in_future',
          severity: 'fail',
          individualIds: [family.husband_id, family.wife_id].filter((id): id is string => Boolean(id)),
          familyId: family.id,
          detail: `The marriage of ${name(family.husband_id)} and ${name(family.wife_id)} is dated in the future (${marriage.year}).`,
        });
      }
      for (const spouse of [husband, wife]) {
        if (!spouse) continue;
        const spouseDeath = vital(spouse, 'death');
        const spouseBirth = vital(spouse, 'birth');
        if (spouseDeath && !unusable(spouseDeath) && loYear(marriage) > hiYear(spouseDeath)) {
          findings.push({
            check: 'marriage_after_death',
            severity: 'fail',
            individualIds: [spouse.id],
            familyId: family.id,
            detail: `${spouse.full_name} is recorded as marrying in ${marriage.year}, after dying in ${spouseDeath.year}.`,
          });
        }
        if (spouseBirth && !unusable(spouseBirth)) {
          // The age that must hold even at the extremes of the bounds.
          const maxAge = hiYear(marriage) - loYear(spouseBirth);
          if (Number.isFinite(maxAge) && maxAge <= MARRIAGE_MIN_AGE && maxAge >= 0) {
            findings.push({
              check: 'marriage_before_13',
              severity: 'fail',
              individualIds: [spouse.id],
              familyId: family.id,
              detail: `${spouse.full_name} would have married aged ${maxAge} in ${marriage.year}.`,
            });
          }
        }
      }
    }

    // Parent-age and posthumous-birth checks — every claim must survive
    // the recorded bounds: the age that MUST hold is child's earliest
    // birth minus parent's latest, and so on. Unusable qualifiers on
    // either side stand the check down.
    for (const childId of family.children) {
      const child = people.get(childId);
      if (!child) continue;
      const childBirth = vital(child, 'birth');
      if (!childBirth || unusable(childBirth)) continue;

      const parentAges = (parent: HealthIndividual, tooOld: HealthCheckId, tooYoung: HealthCheckId, maxAgeLimit: number) => {
        const parentBirth = vital(parent, 'birth');
        if (!parentBirth || unusable(parentBirth)) return;
        const minAge = loYear(childBirth) - hiYear(parentBirth);
        const maxAge = hiYear(childBirth) - loYear(parentBirth);
        if (Number.isFinite(minAge) && minAge >= maxAgeLimit) {
          findings.push({
            check: tooOld,
            severity: 'fail',
            individualIds: [childId, parent.id],
            familyId: family.id,
            detail: `${parent.full_name} would have been ${minAge} at the birth of ${child.full_name} (${childBirth.year}).`,
          });
        } else if (Number.isFinite(maxAge) && maxAge <= PARENT_MIN_AGE && maxAge >= 0) {
          findings.push({
            check: tooYoung,
            severity: 'fail',
            individualIds: [childId, parent.id],
            familyId: family.id,
            detail: `${parent.full_name} would have been ${maxAge} at the birth of ${child.full_name} (${childBirth.year}).`,
          });
        }
      };
      if (wife) parentAges(wife, 'mother_too_old', 'mother_too_young', MOTHER_MAX_AGE);
      if (husband) parentAges(husband, 'father_too_old', 'father_too_young', FATHER_MAX_AGE);

      const motherDeath = wife ? vital(wife, 'death') : null;
      if (wife && motherDeath && !unusable(motherDeath) && loYear(childBirth) > hiYear(motherDeath)) {
        findings.push({
          check: 'born_after_mothers_death',
          severity: 'fail',
          individualIds: [childId, wife.id],
          familyId: family.id,
          detail: `${child.full_name} is recorded as born in ${childBirth.year}, after the ${motherDeath.year} death of mother ${wife.full_name}.`,
        });
      }
      // A child conceived before the father's death can arrive up to ~10
      // months after it; with year-only dates, two clear years is proof.
      const fatherDeath = husband ? vital(husband, 'death') : null;
      if (husband && fatherDeath && !unusable(fatherDeath) && loYear(childBirth) >= hiYear(fatherDeath) + 2) {
        findings.push({
          check: 'born_long_after_fathers_death',
          severity: 'fail',
          individualIds: [childId, husband.id],
          familyId: family.id,
          detail: `${child.full_name} is recorded as born in ${childBirth.year}, ${childBirth.year - fatherDeath.year} years after the death of father ${husband.full_name}.`,
        });
      }

      // Facts before birth catches events, but a child born before either
      // parent is the merged-generations classic:
      for (const parent of [husband, wife]) {
        if (!parent) continue;
        const parentBirth = vital(parent, 'birth');
        if (parentBirth && !unusable(parentBirth) && hiYear(childBirth) < loYear(parentBirth)) {
          findings.push({
            check: 'fact_before_birth',
            severity: 'fail',
            individualIds: [childId, parent.id],
            familyId: family.id,
            detail: `${child.full_name} (b. ${childBirth.year}) is recorded as a child of ${parent.full_name}, born ${parentBirth.year}.`,
          });
        }
      }
    }

    // Sibling spacing — only with full dates on both sides, and never
    // for estimated dates: precision the GEDCOM never claimed can't convict.
    const datedChildren = family.children
      .map((id) => {
        const event = (eventsByPerson.get(id) ?? []).find(
          (e) => e.event_type === 'birth' && e.date_year !== null && e.date_month !== null && e.date_day !== null,
        );
        return event && !isEstimate(event.date_qualifier)
          ? { id, date: partial(event.date_year, event.date_month, event.date_day)! }
          : null;
      })
      .filter((c): c is { id: string; date: QualifiedDate } => c !== null)
      .sort(
        (a, b) =>
          Date.UTC(a.date.year, a.date.month! - 1, a.date.day!) -
          Date.UTC(b.date.year, b.date.month! - 1, b.date.day!),
      );

    for (let i = 1; i < datedChildren.length; i++) {
      const earlier = datedChildren[i - 1]!;
      const later = datedChildren[i]!;
      // Old-style dual dating: a pre-1752 Jan–Mar date may carry the
      // prior year's label, so the computed gap is a year off exactly
      // where colonial trees live — no conviction may rest on one.
      if (dualDatingRisk(earlier.date) || dualDatingRisk(later.date)) continue;
      const gap = daysBetween(earlier.date, later.date);
      if (gap === null || gap <= TWIN_WINDOW_DAYS) continue; // twins
      const pair = [earlier.id, later.id];
      if (gap < IMPOSSIBLE_SIBLING_GAP_DAYS) {
        findings.push({
          check: 'sibling_born_impossibly_soon',
          severity: 'fail',
          individualIds: pair,
          familyId: family.id,
          detail: `${name(pair[1])} was born only ${gap} days after sibling ${name(pair[0])}.`,
        });
      } else if (gap < SUSPECT_SIBLING_GAP_DAYS) {
        findings.push({
          check: 'sibling_born_too_soon',
          severity: 'caution',
          individualIds: pair,
          familyId: family.id,
          detail: `${name(pair[1])} was born ${gap} days after sibling ${name(pair[0])} — possible but worth confirming.`,
        });
      }
    }
  }

  // Cross-individual check: same normalized name, birth years close enough
  // to suspect one person entered twice — a caution for the user to rule
  // on, never a fail (a shared name and close birth year is suspicion,
  // not proof; the classic cause is a GEDCOM compiled from overlapping
  // source trees that each contributed their own copy of the same person).
  const byNameSlug = new Map<string, HealthIndividual[]>();
  for (const person of data.individuals) {
    if (person.birth_year === null) continue;
    const slug = nameSlug(person.full_name);
    if (!slug) continue;
    if (!byNameSlug.has(slug)) byNameSlug.set(slug, []);
    byNameSlug.get(slug)!.push(person);
  }
  for (const group of byNameSlug.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.birth_year! - b.birth_year!);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const gap = group[j]!.birth_year! - group[i]!.birth_year!;
        if (gap > DUPLICATE_NAME_BIRTH_YEAR_TOLERANCE) break;
        const a = group[i]!;
        const b = group[j]!;
        findings.push({
          check: 'possible_duplicate_person',
          severity: 'caution',
          individualIds: [a.id, b.id],
          detail:
            gap === 0
              ? `${a.full_name} and ${b.full_name} share a name and are both recorded born in ${a.birth_year} — worth checking whether this is the same person entered twice.`
              : `${a.full_name} and ${b.full_name} share a name and were born ${gap} year(s) apart (${a.birth_year} and ${b.birth_year}) — worth checking whether this is the same person entered twice.`,
        });
      }
    }
  }

  return {
    findings,
    individualsChecked: data.individuals.length,
    familiesChecked: data.families.length,
  };
}

// ── Fetch ────────────────────────────────────────────────────────────

interface FamilyRow {
  id: string;
  husband_id: string | null;
  wife_id: string | null;
  marriage_date_year: number | null;
  marriage_date_month: number | null;
  marriage_date_day: number | null;
  marriage_date_qualifier: Database['public']['Enums']['date_qualifier'] | null;
}

interface FamilyChildRow {
  family_id: string;
  individual_id: string;
}

export async function fetchTreeHealthData(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<TreeHealthData> {
  const [individuals, events, familyRows, childRows] = await Promise.all([
    fetchAllPages<HealthIndividual>(
      (after) => {
        let q = client
          .from('individuals')
          .select('id, gedcom_xref, ancestry_uid, full_name, surname, sex, birth_year, death_year, living')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching individuals failed',
    ),
    fetchAllPages<HealthEvent>(
      (after) => {
        let q = client
          .from('individual_events')
          .select('id, individual_id, event_type, date_year, date_month, date_day, date_qualifier, place_id')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching events failed',
    ),
    fetchAllPages<FamilyRow>(
      (after) => {
        let q = client
          .from('families')
          .select('id, husband_id, wife_id, marriage_date_year, marriage_date_month, marriage_date_day, marriage_date_qualifier')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching families failed',
    ),
    fetchAllPages<FamilyChildRow>(
      (after) => {
        let q = client
          .from('family_children')
          .select('family_id, individual_id')
          .eq('tree_id', treeId)
          .order('family_id')
          .order('individual_id')
          .limit(PAGE_SIZE);
        if (after) q = seekAfter(q, ['family_id', 'individual_id'], [after.family_id, after.individual_id]);
        return q;
      },
      'Fetching family children failed',
    ),
  ]);

  const childrenByFamily = new Map<string, string[]>();
  for (const row of childRows) {
    if (!childrenByFamily.has(row.family_id)) childrenByFamily.set(row.family_id, []);
    childrenByFamily.get(row.family_id)!.push(row.individual_id);
  }

  return {
    individuals,
    events,
    families: familyRows.map((f) => ({ ...f, children: childrenByFamily.get(f.id) ?? [] })),
  };
}
