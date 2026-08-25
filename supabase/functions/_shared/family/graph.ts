// Mirrored from packages/core/src/family/graph.ts — keep in sync
// (portSync.test.ts enforces byte equality outside this header).

/**
 * The family graph is the substrate for relationship calculation: parent
 * links (father/mother per person), spouse links, and child links. It can
 * be built from a freshly parsed GEDCOM (see gedcomGraph.ts — kept out of
 * this file so it stays import-free and portable) or from the database
 * rows the app already has (runtime).
 *
 * Parent links are typed (witness-relationship-taxonomy-spec.md §6): a
 * record can say a child was adopted, fostered, or is a step-child, and
 * that changes both which link wins the parent slot and how the label
 * reads. Untyped links — the overwhelming majority — are 'birth'.
 */

export type ParentLinkType = 'birth' | 'adopted' | 'foster' | 'step' | 'unknown';

/**
 * One recorded parent link. A person can carry several per side: a birth
 * mother and an adoptive mother both belong in the record, so the slot
 * holds the ranked winner and this list holds everything.
 */
export interface ParentLink {
  id: string;
  side: 'father' | 'mother';
  type: ParentLinkType;
}

export interface GraphPerson {
  id: string;
  name: string;
  sex: 'M' | 'F' | 'U';
  birthYear: number | null;
  deathYear: number | null;
  living: boolean;
  father: string | null;
  mother: string | null;
  /** The type of the link that won each slot; 'birth' when the slot is empty. */
  fatherType: ParentLinkType;
  motherType: ParentLinkType;
  /** Every recorded parent link, step and displaced ones included. */
  parentLinks: ParentLink[];
  spouses: string[];
  /** Children by a slot-claiming link — the ones the blood climb descends. */
  children: string[];
  /** Children by an explicit step link. Never blood. */
  stepChildren: string[];
}

export interface FamilyGraph {
  people: Map<string, GraphPerson>;
}

export function getPerson(graph: FamilyGraph, id: string): GraphPerson | undefined {
  return graph.people.get(id);
}

export function emptyPerson(id: string): GraphPerson {
  return {
    id,
    name: 'Unknown',
    sex: 'U',
    birthYear: null,
    deathYear: null,
    living: false,
    father: null,
    mother: null,
    fatherType: 'birth',
    motherType: 'birth',
    parentLinks: [],
    spouses: [],
    children: [],
    stepChildren: [],
  };
}

/**
 * Source vocabularies collapse to five values. GEDCOM 5.5.1/7 PEDI gives
 * birth/adopted/foster/sealing; Ancestry's _FREL/_MREL adds natural, step,
 * guardian, private; GEDCOM X names several more. Anything unrecognized
 * becomes 'unknown', which ranks and reads exactly like birth — an
 * unfamiliar value must never quietly demote a relationship.
 */
export function normalizeParentLinkType(raw: string | null | undefined): ParentLinkType {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return 'birth';
  if (value === 'natural' || value === 'birth' || value === 'biological') return 'birth';
  if (value === 'adopted' || value === 'adoptive' || value === 'adoption') return 'adopted';
  if (value === 'foster') return 'foster';
  if (value === 'step' || value === 'stepchild') return 'step';
  return 'unknown';
}

/**
 * Which link may hold a parent slot, best first. A step link never claims
 * one — before typing, whichever family happened to be read first could
 * install a step-parent as a blood ancestor for good.
 */
const SLOT_RANK: Record<ParentLinkType, number> = {
  birth: 0,
  unknown: 0,
  adopted: 1,
  foster: 2,
  step: Infinity,
};

/** True when the link is blood-bearing: it may be climbed and descended. */
export function isSlotLink(type: ParentLinkType): boolean {
  return SLOT_RANK[type] !== Infinity;
}

export interface FamilyChildLink {
  id: string;
  fatherType: ParentLinkType;
  motherType: ParentLinkType;
}

export interface FamilyLink {
  husbandId: string | null;
  wifeId: string | null;
  children: FamilyChildLink[];
}

function claimSlot(
  child: GraphPerson,
  parent: GraphPerson,
  side: 'father' | 'mother',
  type: ParentLinkType,
): void {
  if (!child.parentLinks.some((link) => link.id === parent.id && link.side === side)) {
    child.parentLinks.push({ id: parent.id, side, type });
  }
  if (!isSlotLink(type)) return;
  const held = side === 'father' ? child.father : child.mother;
  const heldType = side === 'father' ? child.fatherType : child.motherType;
  // A better-ranked link takes the slot; ties keep the first one seen, so
  // reading order still decides between two birth families.
  if (held !== null && SLOT_RANK[heldType] <= SLOT_RANK[type]) return;
  if (side === 'father') {
    child.father = parent.id;
    child.fatherType = type;
  } else {
    child.mother = parent.id;
    child.motherType = type;
  }
}

export function wire(people: Map<string, GraphPerson>, families: FamilyLink[]): FamilyGraph {
  for (const family of families) {
    const husband = family.husbandId ? people.get(family.husbandId) : undefined;
    const wife = family.wifeId ? people.get(family.wifeId) : undefined;

    if (husband && wife) {
      if (!husband.spouses.includes(wife.id)) husband.spouses.push(wife.id);
      if (!wife.spouses.includes(husband.id)) wife.spouses.push(husband.id);
    }

    for (const link of family.children) {
      const child = people.get(link.id);
      if (!child) continue;
      // A person can appear as a child in multiple families (adoption,
      // conflicting sources). The best-ranked link wins each parent slot;
      // every link is kept, so an adoptive father displaced by a birth
      // father is still recorded and still labelled.
      if (husband) {
        claimSlot(child, husband, 'father', link.fatherType);
        const list = isSlotLink(link.fatherType) ? husband.children : husband.stepChildren;
        if (!list.includes(link.id)) list.push(link.id);
      }
      if (wife) {
        claimSlot(child, wife, 'mother', link.motherType);
        const list = isSlotLink(link.motherType) ? wife.children : wife.stepChildren;
        if (!list.includes(link.id)) list.push(link.id);
      }
    }
  }
  return { people };
}

export interface GraphIndividualRow {
  id: string;
  full_name: string;
  sex: 'M' | 'F' | 'U';
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

export interface GraphFamilyRow {
  id: string;
  husband_id: string | null;
  wife_id: string | null;
}

export interface GraphFamilyChildRow {
  family_id: string;
  individual_id: string;
  father_relation?: string | null;
  mother_relation?: string | null;
}

export function buildGraphFromRows(
  individuals: GraphIndividualRow[],
  families: GraphFamilyRow[],
  familyChildren: GraphFamilyChildRow[],
): FamilyGraph {
  const people = new Map<string, GraphPerson>();
  for (const row of individuals) {
    people.set(row.id, {
      ...emptyPerson(row.id),
      name: row.full_name,
      sex: row.sex,
      birthYear: row.birth_year,
      deathYear: row.death_year,
      living: row.living,
    });
  }
  const childrenByFamily = new Map<string, FamilyChildLink[]>();
  for (const link of familyChildren) {
    if (!childrenByFamily.has(link.family_id)) childrenByFamily.set(link.family_id, []);
    childrenByFamily.get(link.family_id)!.push({
      id: link.individual_id,
      fatherType: normalizeParentLinkType(link.father_relation),
      motherType: normalizeParentLinkType(link.mother_relation),
    });
  }
  const links: FamilyLink[] = families.map((f) => ({
    husbandId: f.husband_id,
    wifeId: f.wife_id,
    children: childrenByFamily.get(f.id) ?? [],
  }));
  return wire(people, links);
}
