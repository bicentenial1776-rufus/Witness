import type { HealthFamily, HealthIndividual, TreeHealthData } from '../query/treeHealth.js';

/**
 * Tree Pulse — what a research session actually changed.
 *
 * Witness is read-only, so the loop it wants is: work a brick wall in
 * Ancestry, export a fresh GEDCOM, bring it back. The reward for doing that
 * has to be visible, or re-importing reads as a chore that costs you your
 * "fixed" marks. This turns the second upload into a report on the first.
 *
 * Identity is the GEDCOM xref, which is what tree_health_rulings already bets
 * on: the same file re-exported from the same software keeps its @I12@
 * pointers. Anyone without an xref simply cannot be tracked between files,
 * and is counted as untracked rather than guessed at — a bad guess here would
 * report a person as new when they merely lost their pointer.
 */

export interface PulsePerson {
  xref: string;
  name: string;
}

export interface FilledDates {
  person: PulsePerson;
  /** Which vitals went from unrecorded to recorded. */
  gained: ('birth' | 'death')[];
}

export interface TreePulse {
  peopleBefore: number;
  peopleAfter: number;
  added: PulsePerson[];
  removed: PulsePerson[];
  datesFilled: FilledDates[];
  /** Had no parent recorded before, has at least one now. */
  brickWallsBroken: PulsePerson[];
  /** Records that gained a name where there was none. */
  namesRecovered: PulsePerson[];
  marriagesBefore: number;
  marriagesAfter: number;
  /** People on either side with no xref, who cannot be followed between files. */
  untracked: { before: number; after: number };
  /** True when nothing this report can see has moved. */
  unchanged: boolean;
}

const UNNAMED = /^(unknown|unnamed|\?|n\.?n\.?)?$/i;

function hasName(person: HealthIndividual): boolean {
  return !UNNAMED.test(person.full_name.trim());
}

function byXref(individuals: HealthIndividual[]): Map<string, HealthIndividual> {
  const map = new Map<string, HealthIndividual>();
  for (const person of individuals) {
    // Normalise the pointer delimiters so a file re-exported with or without
    // them still matches itself.
    const xref = person.gedcom_xref?.replace(/^@+|@+$/g, '');
    if (xref) map.set(xref, person);
  }
  return map;
}

/** Every individual id that appears as a child of some family. */
function childIds(families: HealthFamily[]): Set<string> {
  const ids = new Set<string>();
  for (const family of families) {
    // A family with neither parent recorded is a sibling grouping, not
    // parentage — it breaks no brick wall.
    if (!family.husband_id && !family.wife_id) continue;
    for (const child of family.children) ids.add(child);
  }
  return ids;
}

function marriageCount(families: HealthFamily[]): number {
  return families.filter((f) => f.husband_id && f.wife_id).length;
}

function person(individual: HealthIndividual, xref: string): PulsePerson {
  return { xref, name: individual.full_name };
}

/**
 * Compare the tree as it was against the tree as it now is.
 *
 * Both sides are the same shape the health check already fetches, so a
 * refresh costs one extra read of the old tree rather than a bespoke query.
 */
export function diffTrees(before: TreeHealthData, after: TreeHealthData): TreePulse {
  const oldPeople = byXref(before.individuals);
  const newPeople = byXref(after.individuals);

  const oldChildren = childIds(before.families);
  const newChildren = childIds(after.families);
  // Parentage is recorded against database ids, which are reassigned on every
  // import — so the question "did this person gain a parent" has to be asked
  // in each tree's own id space, then compared by xref.
  const hadParents = (p: HealthIndividual) => oldChildren.has(p.id);
  const hasParents = (p: HealthIndividual) => newChildren.has(p.id);

  const added: PulsePerson[] = [];
  const removed: PulsePerson[] = [];
  const datesFilled: FilledDates[] = [];
  const brickWallsBroken: PulsePerson[] = [];
  const namesRecovered: PulsePerson[] = [];

  for (const [xref, now] of newPeople) {
    const was = oldPeople.get(xref);
    if (!was) {
      added.push(person(now, xref));
      continue;
    }
    const gained: ('birth' | 'death')[] = [];
    if (was.birth_year === null && now.birth_year !== null) gained.push('birth');
    if (was.death_year === null && now.death_year !== null) gained.push('death');
    if (gained.length > 0) datesFilled.push({ person: person(now, xref), gained });

    if (!hadParents(was) && hasParents(now)) brickWallsBroken.push(person(now, xref));
    if (!hasName(was) && hasName(now)) namesRecovered.push(person(now, xref));
  }

  for (const [xref, was] of oldPeople) {
    if (!newPeople.has(xref)) removed.push(person(was, xref));
  }

  const marriagesBefore = marriageCount(before.families);
  const marriagesAfter = marriageCount(after.families);

  const byName = (a: PulsePerson, b: PulsePerson) => a.name.localeCompare(b.name);
  added.sort(byName);
  removed.sort(byName);
  brickWallsBroken.sort(byName);
  namesRecovered.sort(byName);
  datesFilled.sort((a, b) => byName(a.person, b.person));

  return {
    peopleBefore: before.individuals.length,
    peopleAfter: after.individuals.length,
    added,
    removed,
    datesFilled,
    brickWallsBroken,
    namesRecovered,
    marriagesBefore,
    marriagesAfter,
    untracked: {
      before: before.individuals.length - oldPeople.size,
      after: after.individuals.length - newPeople.size,
    },
    unchanged:
      added.length === 0 &&
      removed.length === 0 &&
      datesFilled.length === 0 &&
      brickWallsBroken.length === 0 &&
      namesRecovered.length === 0 &&
      marriagesBefore === marriagesAfter,
  };
}

/**
 * The report in one sentence, for the card that lands on Research.
 *
 * Leads with what was gained, because that is what the session earned. Losses
 * are still named — a removed person is usually a merge, occasionally a
 * mistake, and either way the researcher should hear about it.
 */
export function pulseSummary(pulse: TreePulse): string {
  if (pulse.unchanged) return 'Nothing changed since your last upload.';
  const parts: string[] = [];
  if (pulse.added.length) {
    parts.push(`${pulse.added.length} ${pulse.added.length === 1 ? 'person' : 'people'} added`);
  }
  if (pulse.datesFilled.length) {
    parts.push(
      `${pulse.datesFilled.length} ${pulse.datesFilled.length === 1 ? 'date' : 'dates'} filled in`,
    );
  }
  if (pulse.brickWallsBroken.length) {
    parts.push(
      `${pulse.brickWallsBroken.length} brick ${pulse.brickWallsBroken.length === 1 ? 'wall' : 'walls'} broken`,
    );
  }
  if (pulse.namesRecovered.length) parts.push(`${pulse.namesRecovered.length} names recovered`);
  const gainedMarriages = pulse.marriagesAfter - pulse.marriagesBefore;
  if (gainedMarriages > 0) {
    parts.push(`${gainedMarriages} ${gainedMarriages === 1 ? 'marriage' : 'marriages'} recorded`);
  }
  if (pulse.removed.length) {
    parts.push(`${pulse.removed.length} no longer in the tree`);
  }
  if (parts.length === 0) return 'Your tree changed in ways this report cannot see.';
  if (parts.length === 1) return `${parts[0]}.`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
}
