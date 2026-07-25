import type { TreeFamily, TreeIndex, TreeIndividual } from './treeIndex.js';

/**
 * The Family Stage: one household — a marriage and its children — shaped
 * as lifelines against a shared time axis (design panel 4g). This module
 * builds the data only; everything comes from the tree index, no new
 * queries.
 *
 * Row order encodes the layout: [spouse1, bond1, head, bond2, spouse2,
 * caption, children…]. The head sits between spouses so each bond lands
 * adjacent to both parties; bond k spans the person rows on either side
 * of it and is derived from position, never hardcoded.
 */

export interface StagePerson {
  kind: 'person';
  id: string;
  n: string;
  b: number;
  d: number | null;
  /** Recorded as living — an open ribbon that must never be sealed.
      An unrecorded death also renders open but is NOT living. */
  living: boolean;
  role: 'head' | 'spouse' | 'child';
  s: 'M' | 'F' | null;
  /** This child's OWN marriage. */
  m?: { y: number; spouse: string; n: number };
  /** Stage key for that marriage — follow the child onward. */
  mfam?: string;
}

export interface StageBond {
  kind: 'bond';
  bond: number;
  from: number;
  /** Marriage's end — the earlier spouse death; null while both ribbons run open. */
  to: number | null;
  note: string;
}

export interface StageCaption {
  kind: 'caption';
  caption: string;
}

export type StageRow = StagePerson | StageBond | StageCaption;

export interface FamilyStage {
  key: string;
  label: string;
  title: string;
  phTitle: string;
  sub: string;
  marriage: number;
  rows: StageRow[];
  /** Scrub: marriage year → death of the last SURVIVING child (never the
      last-born — that bug shipped once), or the current year while any
      child's ribbon still runs. */
  scrubStart: number;
  scrubEnd: number;
  /** Chart domain is wider: earliest birth − 3 to latest end + 3, so the
      parents' pre-marital lives show. */
  domainStart: number;
  domainEnd: number;
  hasLiving: boolean;
}

export interface FamilyStageIndex {
  /** The household picker — top-level families only (~8). */
  topLevel: FamilyStage[];
  /** Every stage-able unit, for following children onward. */
  byKey: Map<string, FamilyStage>;
}

const ordinal = ['first', 'second', 'third', 'fourth'];

function sexOf(person: TreeIndividual): 'M' | 'F' | null {
  return person.sex === 'U' ? null : person.sex;
}

function endYear(person: TreeIndividual | undefined, currentYear: number): number | null {
  if (!person) return null;
  if (person.death_year !== null) return person.death_year;
  if (person.living) return currentYear;
  return null;
}

interface Unit {
  head: TreeIndividual;
  marriages: { family: TreeFamily; spouse: TreeIndividual | null }[];
}

export function buildFamilyStages(
  index: TreeIndex,
  options: { currentYear: number },
): FamilyStageIndex {
  const { currentYear } = options;
  const people = index.individuals;

  const dated = index.families.filter((family) => family.marriage_year !== null);

  // Count dated marriages per person; a remarried person heads their unit.
  const marriageCount = new Map<string, number>();
  for (const family of dated) {
    for (const id of [family.husband_id, family.wife_id]) {
      if (id) marriageCount.set(id, (marriageCount.get(id) ?? 0) + 1);
    }
  }

  // Group families into units by head.
  const unitByHead = new Map<string, Unit>();
  const unitKeyByFamily = new Map<string, string>();
  for (const family of dated) {
    const husband = family.husband_id ? people.get(family.husband_id) : undefined;
    const wife = family.wife_id ? people.get(family.wife_id) : undefined;
    if (!husband && !wife) continue;
    const headId =
      (marriageCount.get(family.husband_id ?? '') ?? 0) >= (marriageCount.get(family.wife_id ?? '') ?? 0)
        ? (family.husband_id ?? family.wife_id!)
        : family.wife_id!;
    const head = people.get(headId);
    if (!head) continue;
    if (!unitByHead.has(headId)) unitByHead.set(headId, { head, marriages: [] });
    const spouseId = headId === family.husband_id ? family.wife_id : family.husband_id;
    unitByHead.get(headId)!.marriages.push({
      family,
      spouse: spouseId ? (people.get(spouseId) ?? null) : null,
    });
    unitKeyByFamily.set(family.id, headId);
  }

  const byKey = new Map<string, FamilyStage>();
  for (const unit of unitByHead.values()) {
    const stage = buildStage(unit, people, index.families, unitKeyByFamily, currentYear);
    if (stage) byKey.set(stage.key, stage);
  }

  // The picker holds only the best-documented top-level households.
  const scored = [...byKey.values()]
    .map((stage) => {
      const persons = stage.rows.filter((row): row is StagePerson => row.kind === 'person');
      const children = persons.filter((row) => row.role === 'child');
      const parentsDated = persons.filter((row) => row.role !== 'child').length;
      const span = stage.scrubEnd - stage.scrubStart;
      return { stage, score: children.length * 2 + parentsDated * 3 + Math.min(span, 80) / 10 };
    })
    .filter(({ stage }) => stage.rows.some((row) => row.kind === 'person' && row.role === 'child'))
    .sort((a, b) => b.score - a.score);

  return { topLevel: scored.slice(0, 8).map(({ stage }) => stage), byKey };
}

function buildStage(
  unit: Unit,
  people: Map<string, TreeIndividual>,
  allFamilies: TreeFamily[],
  unitKeyByFamily: Map<string, string>,
  currentYear: number,
): FamilyStage | null {
  const { head } = unit;
  if (head.birth_year === null) return null;
  // Two marriages sandwich the head; more than two won't fit the layout —
  // keep the earliest two, which carry the household story.
  const marriages = [...unit.marriages]
    .sort((a, b) => (a.family.marriage_year ?? 0) - (b.family.marriage_year ?? 0))
    .slice(0, 2);
  const first = marriages[0]!;
  if (first.family.marriage_year === null) return null;

  const rows: StageRow[] = [];
  const person = (individual: TreeIndividual, role: StagePerson['role']): StagePerson | null => {
    if (individual.birth_year === null) return null;
    return {
      kind: 'person',
      id: individual.id,
      n: individual.full_name,
      b: individual.birth_year,
      d: individual.living ? null : individual.death_year,
      living: individual.living,
      role,
      s: sexOf(individual),
    };
  };

  const bond = (
    order: number,
    family: TreeFamily,
    spouse: TreeIndividual | null,
  ): StageBond => {
    const from = family.marriage_year!;
    const ends = [endYear(head, currentYear), endYear(spouse ?? undefined, currentYear)]
      .filter((year): year is number => year !== null);
    const bothKnown =
      (head.living || head.death_year !== null) &&
      (spouse ? spouse.living || spouse.death_year !== null : false);
    const to = bothKnown && ends.length === 2 ? Math.min(...ends) : null;
    const closedByDeath =
      to !== null && !(head.living && spouse?.living);
    return {
      kind: 'bond',
      bond: order,
      from,
      to: closedByDeath ? to : null,
      note:
        closedByDeath && to !== null
          ? `married ${from} · ${to - from} years`
          : `married ${from}`,
    };
  };

  // [spouse1, bond1, head, bond2, spouse2]
  const spouse1Row = first.spouse ? person(first.spouse, 'spouse') : null;
  if (spouse1Row) rows.push(spouse1Row);
  rows.push(bond(1, first.family, first.spouse));
  const headRow = person(head, 'head');
  if (!headRow) return null;
  rows.push(headRow);
  const second = marriages[1];
  if (second?.spouse) {
    rows.push(bond(2, second.family, second.spouse));
    const spouse2Row = person(second.spouse, 'spouse');
    if (spouse2Row) rows.push(spouse2Row);
  }

  // Children, grouped per marriage with captions when there are two.
  const childRows: StageRow[] = [];
  const seenChildren = new Set<string>();
  for (let i = 0; i < marriages.length; i++) {
    const marriage = marriages[i]!;
    const children = marriage.family.children
      .map((id) => people.get(id))
      .filter((child): child is TreeIndividual => Boolean(child && child.birth_year !== null))
      // GEDCOMs carry duplicate people (the Tree Check flags them); the
      // stage collapses identical name+dates into one ribbon rather than
      // drawing the same child four times.
      .filter((child) => {
        const identity = `${child.full_name}|${child.birth_year}|${child.death_year}`;
        if (seenChildren.has(identity)) return false;
        seenChildren.add(identity);
        return true;
      })
      .sort((a, b) => (a.birth_year ?? 0) - (b.birth_year ?? 0));
    if (children.length === 0) continue;
    if (marriages.length > 1) {
      childRows.push({ kind: 'caption', caption: `Children of the ${ordinal[i] ?? `${i + 1}th`} marriage` });
    }
    for (const child of children) {
      const row = person(child, 'child');
      if (!row) continue;
      // The child's own marriage: a tick on their ribbon, and the door
      // into their stage — the next generation is stepped into, never
      // drawn inline.
      const ownFamily = allFamilies
        .filter(
          (family) =>
            family.marriage_year !== null &&
            (family.husband_id === child.id || family.wife_id === child.id),
        )
        .sort((a, b) => (a.marriage_year ?? 0) - (b.marriage_year ?? 0))[0];
      if (ownFamily) {
        const spouseId = ownFamily.husband_id === child.id ? ownFamily.wife_id : ownFamily.husband_id;
        const spouse = spouseId ? people.get(spouseId) : undefined;
        row.m = {
          y: ownFamily.marriage_year!,
          spouse: spouse?.full_name ?? 'name not recorded',
          n: ownFamily.children.length,
        };
        const stageKey = unitKeyByFamily.get(ownFamily.id);
        if (stageKey) row.mfam = stageKey;
      }
      childRows.push(row);
    }
  }
  if (!childRows.some((row) => row.kind === 'person')) return null;
  rows.push(...childRows);

  const persons = rows.filter((row): row is StagePerson => row.kind === 'person');
  const children = persons.filter((row) => row.role === 'child');

  // Scrub end: the last surviving child's death; today only while a child
  // is RECORDED living. An unrecorded death is not "still alive" — a
  // 1650s family must not appear to last until the present.
  const knownChildEnds = children
    .map((child) => (child.living ? currentYear : child.d))
    .filter((year): year is number => year !== null);
  const scrubEnd =
    knownChildEnds.length > 0
      ? Math.max(...knownChildEnds, first.family.marriage_year)
      : Math.min(Math.max(...children.map((child) => child.b)) + 80, currentYear);

  const knownEnds = persons
    .map((row) => (row.living ? currentYear : row.d))
    .filter((year): year is number => year !== null);
  const domainStart = Math.min(...persons.map((row) => row.b)) - 3;
  const domainEnd =
    Math.max(...knownEnds, scrubEnd, Math.max(...persons.map((row) => row.b)) + 20) + 3;

  const headName = head.full_name;
  const wives = marriages.map((marriage) => marriage.spouse?.full_name ?? 'a spouse unrecorded');
  const title =
    marriages.length > 1
      ? `The house of ${headName} and ${wives[0]}, then ${wives[1]}`
      : `The house of ${headName} and ${wives[0]}`;
  const surname = (individual: TreeIndividual | null | undefined) =>
    individual?.surname ?? individual?.full_name.split(' ').pop() ?? '?';
  const label = `${surname(head)} · ${surname(first.spouse)}`;
  const phTitle = `${surname(head)} & ${surname(first.spouse)}`;
  const bornCount = children.length;
  const lostYoung = children.filter(
    (child) => child.d !== null && child.d - child.b < 18,
  ).length;
  const sub = `Married ${first.family.marriage_year} · ${bornCount} ${bornCount === 1 ? 'child' : 'children'}${
    lostYoung > 0 ? ` · ${lostYoung} lost young` : ''
  }`;

  return {
    key: head.id,
    label,
    title,
    phTitle,
    sub,
    marriage: first.family.marriage_year,
    rows,
    scrubStart: first.family.marriage_year,
    scrubEnd,
    domainStart,
    domainEnd,
    hasLiving: persons.some((row) => row.living),
  };
}
