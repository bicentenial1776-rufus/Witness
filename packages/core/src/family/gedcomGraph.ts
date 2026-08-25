import type { ChildParentage, ParsedGedcom } from '../gedcom/index.js';

import {
  emptyPerson,
  normalizeParentLinkType,
  wire,
  type FamilyGraph,
  type FamilyLink,
  type GraphPerson,
} from './graph.js';

/**
 * GEDCOM-side graph construction, split out of graph.ts so that file stays
 * import-free and byte-portable to the Deno mirror (see the header there).
 */
export function buildGraphFromParsed(parsed: ParsedGedcom): FamilyGraph {
  const people = new Map<string, GraphPerson>();
  for (const individual of parsed.individuals.values()) {
    people.set(individual.id, {
      ...emptyPerson(individual.id),
      name: individual.name.full,
      sex: individual.sex,
      birthYear: individual.birth?.date?.year ?? null,
      deathYear: individual.death?.date?.year ?? null,
      living: individual.living,
    });
  }
  // Parentage is recorded from either side: Ancestry's _FREL/_MREL on the
  // family's CHIL pointer, or the child's own FAMC.PEDI / ADOP. The
  // family side wins, being per parent rather than per family.
  const parentageByLink = new Map<string, ChildParentage>();
  for (const individual of parsed.individuals.values()) {
    for (const entry of individual.parentage) {
      if (entry.pedigree) parentageByLink.set(`${individual.id}|${entry.familyId}`, entry);
    }
  }
  // An ADOP event can name one adopting parent; the other side keeps
  // whatever the record says it was.
  const pedigreeFor = (childId: string, familyId: string, side: 'father' | 'mother') => {
    const entry = parentageByLink.get(`${childId}|${familyId}`);
    if (!entry?.pedigree) return undefined;
    if (entry.adoptedBy && entry.adoptedBy !== 'both' && entry.adoptedBy !== side) return undefined;
    return entry.pedigree;
  };
  const families: FamilyLink[] = [...parsed.families.values()].map((f) => {
    const relations = new Map(f.childRelationships.map((r) => [r.childId, r]));
    return {
      husbandId: f.husbandId ?? null,
      wifeId: f.wifeId ?? null,
      children: f.childIds.map((id) => ({
        id,
        fatherType: normalizeParentLinkType(
          relations.get(id)?.fatherRelation ?? pedigreeFor(id, f.id, 'father'),
        ),
        motherType: normalizeParentLinkType(
          relations.get(id)?.motherRelation ?? pedigreeFor(id, f.id, 'mother'),
        ),
      })),
    };
  });
  return wire(people, families);
}
