// Mirrored from packages/core/src/family/graph.ts — keep in sync
// (portSync.test.ts enforces byte equality outside this header).

/**
 * The family graph is the substrate for relationship calculation: parent
 * links (father/mother per person), spouse links, and child links. It can
 * be built from a freshly parsed GEDCOM (see gedcomGraph.ts — kept out of
 * this file so it stays import-free and portable) or from the database
 * rows the app already has (runtime).
 */

export interface GraphPerson {
  id: string;
  name: string;
  sex: 'M' | 'F' | 'U';
  birthYear: number | null;
  deathYear: number | null;
  living: boolean;
  father: string | null;
  mother: string | null;
  spouses: string[];
  children: string[];
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
    spouses: [],
    children: [],
  };
}

export interface FamilyLink {
  husbandId: string | null;
  wifeId: string | null;
  childIds: string[];
}

export function wire(people: Map<string, GraphPerson>, families: FamilyLink[]): FamilyGraph {
  for (const family of families) {
    const husband = family.husbandId ? people.get(family.husbandId) : undefined;
    const wife = family.wifeId ? people.get(family.wifeId) : undefined;

    if (husband && wife) {
      if (!husband.spouses.includes(wife.id)) husband.spouses.push(wife.id);
      if (!wife.spouses.includes(husband.id)) wife.spouses.push(husband.id);
    }

    for (const childId of family.childIds) {
      const child = people.get(childId);
      if (!child) continue;
      // A person can appear as a child in multiple families (adoption,
      // conflicting sources). First family with a parent wins; later
      // families only fill still-empty slots.
      if (husband && !child.father) child.father = husband.id;
      if (wife && !child.mother) child.mother = wife.id;
      if (husband && !husband.children.includes(childId)) husband.children.push(childId);
      if (wife && !wife.children.includes(childId)) wife.children.push(childId);
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
  const childrenByFamily = new Map<string, string[]>();
  for (const link of familyChildren) {
    if (!childrenByFamily.has(link.family_id)) childrenByFamily.set(link.family_id, []);
    childrenByFamily.get(link.family_id)!.push(link.individual_id);
  }
  const links: FamilyLink[] = families.map((f) => ({
    husbandId: f.husband_id,
    wifeId: f.wife_id,
    childIds: childrenByFamily.get(f.id) ?? [],
  }));
  return wire(people, links);
}
