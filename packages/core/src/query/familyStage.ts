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

/**
 * One marriage as a switchable unit: the head is shared, each marriage
 * brings its own spouse, bond, children, and self-contained time span so
 * the phone can re-scale the axis when the reader switches sets.
 */
export interface StageMarriage {
  spouse: StagePerson | null;
  bond: StageBond;
  children: StagePerson[];
  marriageYear: number;
  spouseName: string;
  scrubEnd: number;
  domainStart: number;
  domainEnd: number;
}

export interface FamilyStage {
  key: string;
  label: string;
  title: string;
  phTitle: string;
  sub: string;
  marriage: number;
  rows: StageRow[];
  /** The shared head, and every marriage as a switchable set (phone). */
  head: StagePerson;
  marriages: StageMarriage[];
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
  // Duplicate family records masquerade as remarriages ("and John Nurse,
  // then John Nurse") — collapse same-spouse marriages, folding the
  // duplicate's children into the kept one. Then: two marriages sandwich
  // the head; more than two won't fit the layout — keep the earliest two.
  const spouseKey = (m: Unit['marriages'][number]) => m.spouse?.full_name ?? `family:${m.family.id}`;
  const keptBySpouse = new Map<string, Unit['marriages'][number]>();
  const extraChildren = new Map<string, string[]>();
  for (const m of [...unit.marriages].sort(
    (a, b) => (a.family.marriage_year ?? 0) - (b.family.marriage_year ?? 0),
  )) {
    const key = spouseKey(m);
    if (keptBySpouse.has(key)) {
      extraChildren.set(key, [...(extraChildren.get(key) ?? []), ...m.family.children]);
    } else {
      keptBySpouse.set(key, m);
    }
  }
  // ALL distinct marriages, earliest first — no cap. The web carrier
  // still sandwiches the first two into `rows`; the phone offers a
  // set-switcher across every marriage (Rufus, 2026-07-26).
  const allMarriages = [...keptBySpouse.values()].sort(
    (a, b) => (a.family.marriage_year ?? 0) - (b.family.marriage_year ?? 0),
  );
  const first = allMarriages[0]!;
  if (!first || first.family.marriage_year === null) return null;

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

  const headRow = person(head, 'head');
  if (!headRow) return null;

  // The children of one marriage: enriched with each child's own marriage
  // tick + the door into their stage; duplicates (same name+dates) drawn
  // once across the whole household.
  const seenChildren = new Set<string>();
  const childrenOf = (marriage: Unit['marriages'][number]): StagePerson[] => {
    const kids = [...marriage.family.children, ...(extraChildren.get(spouseKey(marriage)) ?? [])]
      .map((id) => people.get(id))
      .filter((child): child is TreeIndividual => Boolean(child && child.birth_year !== null))
      .filter((child) => {
        const identity = `${child.full_name}|${child.birth_year}|${child.death_year}`;
        if (seenChildren.has(identity)) return false;
        seenChildren.add(identity);
        return true;
      })
      .sort((a, b) => (a.birth_year ?? 0) - (b.birth_year ?? 0));
    const out: StagePerson[] = [];
    for (const child of kids) {
      const row = person(child, 'child');
      if (!row) continue;
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
      out.push(row);
    }
    return out;
  };

  // The per-marriage span the phone reads: head + this marriage's spouse
  // and children, self-contained so switching sets re-scales the axis.
  const marriageSpan = (spouse: StagePerson | null, kids: StagePerson[], marriageYear: number) => {
    const persons = [headRow, ...(spouse ? [spouse] : []), ...kids];
    const childEnds = kids
      .map((child) => (child.living ? currentYear : child.d))
      .filter((year): year is number => year !== null);
    const scrubEnd =
      childEnds.length > 0
        ? Math.max(...childEnds, marriageYear)
        : kids.length > 0
          ? Math.min(Math.max(...kids.map((c) => c.b)) + 80, currentYear)
          : marriageYear;
    const ends = persons
      .map((row) => (row.living ? currentYear : row.d))
      .filter((year): year is number => year !== null);
    const maxBirth = Math.max(...persons.map((row) => row.b));
    return {
      scrubEnd,
      domainStart: Math.min(...persons.map((row) => row.b)) - 3,
      domainEnd: Math.max(...ends, scrubEnd, maxBirth + 20) + 3,
    };
  };

  // Every marriage as a switchable unit (uncapped).
  const stageMarriages: StageMarriage[] = [];
  for (let i = 0; i < allMarriages.length; i++) {
    const m = allMarriages[i]!;
    if (m.family.marriage_year === null) continue;
    const spouse = m.spouse ? person(m.spouse, 'spouse') : null;
    const kids = childrenOf(m);
    if (kids.length === 0 && !spouse) continue;
    const span = marriageSpan(spouse, kids, m.family.marriage_year);
    stageMarriages.push({
      spouse,
      bond: bond(i + 1, m.family, m.spouse),
      children: kids,
      marriageYear: m.family.marriage_year,
      spouseName: m.spouse?.full_name ?? 'a spouse unrecorded',
      ...span,
    });
  }
  if (stageMarriages.length === 0) return null;

  // Web flat rows: sandwich the first two marriages with captions.
  const shown = stageMarriages.slice(0, 2);
  if (shown[0]!.spouse) rows.push(shown[0]!.spouse);
  rows.push(shown[0]!.bond);
  rows.push(headRow);
  if (shown[1]?.spouse) {
    rows.push(shown[1].bond);
    rows.push(shown[1].spouse);
  }
  for (let i = 0; i < shown.length; i++) {
    if (shown[i]!.children.length === 0) continue;
    if (shown.length > 1) {
      rows.push({ kind: 'caption', caption: `Children of the ${ordinal[i] ?? `${i + 1}th`} marriage` });
    }
    rows.push(...shown[i]!.children);
  }
  if (!rows.some((row) => row.kind === 'person' && row.role === 'child')) return null;

  const persons = rows.filter((row): row is StagePerson => row.kind === 'person');
  const children = persons.filter((row) => row.role === 'child');

  // Stage-level span (web): across the shown marriages.
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
  const wives = stageMarriages.map((m) => m.spouseName);
  const title =
    stageMarriages.length > 1
      ? `The house of ${headName} and ${wives[0]}, then ${wives[1]}`
      : `The house of ${headName} and ${wives[0]}`;
  const surname = (individual: TreeIndividual | null | undefined) =>
    individual?.surname ?? individual?.full_name.split(' ').pop() ?? '?';
  const label = `${surname(head)} · ${surname(first.spouse)}`;
  const phTitle = `${surname(head)} & ${surname(first.spouse)}`;
  // Counts across every marriage, not just the two the web sandwich draws.
  const allChildren = stageMarriages.flatMap((m) => m.children);
  const bornCount = allChildren.length;
  const lostYoung = allChildren.filter(
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
    head: headRow,
    marriages: stageMarriages,
    scrubStart: first.family.marriage_year,
    scrubEnd,
    domainStart,
    domainEnd,
    hasLiving: persons.some((row) => row.living),
  };
}
