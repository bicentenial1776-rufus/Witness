import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { Database } from '../supabase/database.types.js';
import { fetchAllPages } from '../supabase/paginate.js';

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
  | 'husband_recorded_female'
  | 'wife_recorded_male'
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

export interface TreeHealthReport {
  findings: HealthFinding[];
  /** Individuals examined — the denominator for any score. */
  individualsChecked: number;
  familiesChecked: number;
}

// ── Input bundle ─────────────────────────────────────────────────────

export interface HealthIndividual {
  id: string;
  full_name: string;
  surname: string | null;
  sex: 'M' | 'F' | 'U';
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

export interface HealthEvent {
  individual_id: string;
  event_type: Database['public']['Enums']['individual_event_type'];
  date_year: number | null;
  date_month: number | null;
  date_day: number | null;
  date_qualifier: Database['public']['Enums']['date_qualifier'] | null;
}

export interface HealthFamily {
  id: string;
  husband_id: string | null;
  wife_id: string | null;
  marriage_date_year: number | null;
  marriage_date_month: number | null;
  marriage_date_day: number | null;
  children: string[];
}

export interface TreeHealthData {
  individuals: HealthIndividual[];
  events: HealthEvent[];
  families: HealthFamily[];
}

// ── Partial-date arithmetic ──────────────────────────────────────────

interface PartialDate {
  year: number;
  month: number | null;
  day: number | null;
}

function partial(year: number | null, month?: number | null, day?: number | null): PartialDate | null {
  if (year === null || year === undefined) return null;
  return { year, month: month ?? null, day: day ?? null };
}

/**
 * True only when `a` is after `b` under the loosest reading of what was
 * recorded: later year, or same year with both months known and later,
 * or same month with both days known and later.
 */
function definitelyAfter(a: PartialDate, b: PartialDate): boolean {
  if (a.year !== b.year) return a.year > b.year;
  if (a.month === null || b.month === null) return false;
  if (a.month !== b.month) return a.month > b.month;
  if (a.day === null || b.day === null) return false;
  return a.day > b.day;
}

/** Days between two fully-specified dates (b - a). */
function daysBetween(a: PartialDate, b: PartialDate): number | null {
  if (a.month === null || a.day === null || b.month === null || b.day === null) return null;
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

const isEstimate = (q: HealthEvent['date_qualifier']) =>
  q === 'estimated' || q === 'calculated' || q === 'about' || q === 'before' || q === 'after' || q === 'between';

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
  const eventDate = (personId: string, type: HealthEvent['event_type']): PartialDate | null => {
    for (const e of eventsByPerson.get(personId) ?? []) {
      if (e.event_type === type && e.date_year !== null) return partial(e.date_year, e.date_month, e.date_day);
    }
    return null;
  };

  // Individual-level checks
  for (const person of data.individuals) {
    const birth = eventDate(person.id, 'birth') ?? partial(person.birth_year);
    const death = eventDate(person.id, 'death') ?? partial(person.death_year);
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

    if (person.birth_year !== null && person.death_year !== null) {
      const lifespan = person.death_year - person.birth_year;
      if (lifespan > MAX_LIFESPAN) {
        findings.push({
          check: 'implausible_lifespan',
          severity: 'fail',
          individualIds: [person.id],
          detail: `${person.full_name} would have died aged ${lifespan} (${person.birth_year}–${person.death_year}).`,
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
      const when = partial(event.date_year, event.date_month, event.date_day)!;
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
    for (const type of ['birth', 'death'] as const) {
      const dated = (eventsByPerson.get(person.id) ?? []).filter(
        (e) => e.event_type === type && e.date_year !== null,
      );
      if (dated.length < 2) continue;
      const keys = new Set(dated.map((e) => `${e.date_year}-${e.date_month}-${e.date_day}`));
      if (keys.size === 1) {
        findings.push({
          check: 'duplicate_fact',
          severity: 'caution',
          individualIds: [person.id],
          detail: `${person.full_name} has the same ${type} recorded ${dated.length} times.`,
        });
      } else {
        const years = [...new Set(dated.map((e) => e.date_year))].sort().join(', ');
        findings.push({
          check: 'conflicting_fact',
          severity: 'caution',
          individualIds: [person.id],
          detail: `${person.full_name} has ${dated.length} different ${type} dates recorded (${years}).`,
        });
      }
    }

    // Future dates
    for (const year of [person.birth_year, person.death_year]) {
      if (year !== null && year > currentYear) {
        findings.push({
          check: 'date_in_future',
          severity: 'fail',
          individualIds: [person.id],
          detail: `${person.full_name} has a date recorded in the future (${year}).`,
        });
        break;
      }
    }
  }

  // Family-level checks
  for (const family of data.families) {
    const husband = family.husband_id ? people.get(family.husband_id) : undefined;
    const wife = family.wife_id ? people.get(family.wife_id) : undefined;
    const marriage = partial(family.marriage_date_year, family.marriage_date_month, family.marriage_date_day);

    if (husband && husband.sex === 'F') {
      findings.push({
        check: 'husband_recorded_female',
        severity: 'caution',
        individualIds: [husband.id],
        familyId: family.id,
        detail: `${husband.full_name} is recorded as female but appears as a husband.`,
      });
    }
    if (wife && wife.sex === 'M') {
      findings.push({
        check: 'wife_recorded_male',
        severity: 'caution',
        individualIds: [wife.id],
        familyId: family.id,
        detail: `${wife.full_name} is recorded as male but appears as a wife.`,
      });
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

    if (marriage) {
      if (marriage.year > currentYear) {
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
        if (spouse.death_year !== null && marriage.year > spouse.death_year) {
          findings.push({
            check: 'marriage_after_death',
            severity: 'fail',
            individualIds: [spouse.id],
            familyId: family.id,
            detail: `${spouse.full_name} is recorded as marrying in ${marriage.year}, after dying in ${spouse.death_year}.`,
          });
        }
        if (spouse.birth_year !== null && marriage.year - spouse.birth_year <= MARRIAGE_MIN_AGE && marriage.year >= spouse.birth_year) {
          findings.push({
            check: 'marriage_before_13',
            severity: 'fail',
            individualIds: [spouse.id],
            familyId: family.id,
            detail: `${spouse.full_name} would have married aged ${marriage.year - spouse.birth_year} in ${marriage.year}.`,
          });
        }
      }
    }

    // Parent-age and posthumous-birth checks
    for (const childId of family.children) {
      const child = people.get(childId);
      if (!child || child.birth_year === null) continue;

      if (wife?.birth_year != null) {
        const motherAge = child.birth_year - wife.birth_year;
        if (motherAge >= MOTHER_MAX_AGE) {
          findings.push({
            check: 'mother_too_old',
            severity: 'fail',
            individualIds: [childId, wife.id],
            familyId: family.id,
            detail: `${wife.full_name} would have been ${motherAge} at the birth of ${child.full_name} (${child.birth_year}).`,
          });
        } else if (motherAge <= PARENT_MIN_AGE && motherAge >= 0) {
          findings.push({
            check: 'mother_too_young',
            severity: 'fail',
            individualIds: [childId, wife.id],
            familyId: family.id,
            detail: `${wife.full_name} would have been ${motherAge} at the birth of ${child.full_name} (${child.birth_year}).`,
          });
        }
      }
      if (husband?.birth_year != null) {
        const fatherAge = child.birth_year - husband.birth_year;
        if (fatherAge >= FATHER_MAX_AGE) {
          findings.push({
            check: 'father_too_old',
            severity: 'fail',
            individualIds: [childId, husband.id],
            familyId: family.id,
            detail: `${husband.full_name} would have been ${fatherAge} at the birth of ${child.full_name} (${child.birth_year}).`,
          });
        } else if (fatherAge <= PARENT_MIN_AGE && fatherAge >= 0) {
          findings.push({
            check: 'father_too_young',
            severity: 'fail',
            individualIds: [childId, husband.id],
            familyId: family.id,
            detail: `${husband.full_name} would have been ${fatherAge} at the birth of ${child.full_name} (${child.birth_year}).`,
          });
        }
      }

      if (wife?.death_year != null && child.birth_year > wife.death_year) {
        findings.push({
          check: 'born_after_mothers_death',
          severity: 'fail',
          individualIds: [childId, wife.id],
          familyId: family.id,
          detail: `${child.full_name} is recorded as born in ${child.birth_year}, after the ${wife.death_year} death of mother ${wife.full_name}.`,
        });
      }
      // A child conceived before the father's death can arrive up to ~10
      // months after it; with year-only dates, two clear years is proof.
      if (husband?.death_year != null && child.birth_year >= husband.death_year + 2) {
        findings.push({
          check: 'born_long_after_fathers_death',
          severity: 'fail',
          individualIds: [childId, husband.id],
          familyId: family.id,
          detail: `${child.full_name} is recorded as born in ${child.birth_year}, ${child.birth_year - husband.death_year} years after the death of father ${husband.full_name}.`,
        });
      }

      // Facts before birth catches events, but a child born before either
      // parent is the merged-generations classic:
      for (const parent of [husband, wife]) {
        if (parent?.birth_year != null && child.birth_year < parent.birth_year) {
          findings.push({
            check: 'fact_before_birth',
            severity: 'fail',
            individualIds: [childId, parent.id],
            familyId: family.id,
            detail: `${child.full_name} (b. ${child.birth_year}) is recorded as a child of ${parent.full_name}, born ${parent.birth_year}.`,
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
      .filter((c): c is { id: string; date: PartialDate } => c !== null)
      .sort(
        (a, b) =>
          Date.UTC(a.date.year, a.date.month! - 1, a.date.day!) -
          Date.UTC(b.date.year, b.date.month! - 1, b.date.day!),
      );

    for (let i = 1; i < datedChildren.length; i++) {
      const earlier = datedChildren[i - 1]!;
      const later = datedChildren[i]!;
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
      (from, to) =>
        client
          .from('individuals')
          .select('id, full_name, surname, sex, birth_year, death_year, living')
          .eq('tree_id', treeId)
          .order('id')
          .range(from, to),
      'Fetching individuals failed',
    ),
    fetchAllPages<HealthEvent>(
      (from, to) =>
        client
          .from('individual_events')
          .select('individual_id, event_type, date_year, date_month, date_day, date_qualifier')
          .eq('tree_id', treeId)
          .order('id')
          .range(from, to),
      'Fetching events failed',
    ),
    fetchAllPages<FamilyRow>(
      (from, to) =>
        client
          .from('families')
          .select('id, husband_id, wife_id, marriage_date_year, marriage_date_month, marriage_date_day')
          .eq('tree_id', treeId)
          .order('id')
          .range(from, to),
      'Fetching families failed',
    ),
    fetchAllPages<FamilyChildRow>(
      (from, to) =>
        client
          .from('family_children')
          .select('family_id, individual_id, families!inner(tree_id)')
          .eq('families.tree_id', treeId)
          .order('family_id')
          .order('individual_id')
          .range(from, to),
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
