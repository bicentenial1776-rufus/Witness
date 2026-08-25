import type { ParsedGedcom } from '../gedcom/index.js';

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
  const families: FamilyLink[] = [...parsed.families.values()].map((f) => {
    const relations = new Map(f.childRelationships.map((r) => [r.childId, r]));
    return {
      husbandId: f.husbandId ?? null,
      wifeId: f.wifeId ?? null,
      children: f.childIds.map((id) => ({
        id,
        fatherType: normalizeParentLinkType(relations.get(id)?.fatherRelation),
        motherType: normalizeParentLinkType(relations.get(id)?.motherRelation),
      })),
    };
  });
  return wire(people, families);
}
