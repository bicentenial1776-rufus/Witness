import type { TreeIndex, TreeIndividual } from './treeIndex.js';

/**
 * Section X of the query library — Family Structure and Relationships.
 * Pure aggregations over a TreeIndex. Two of the section's rows already
 * live elsewhere and are deliberately not duplicated here: cousin
 * marriages (family/kindred.ts) and the relationship path between two
 * individuals (family/relationship.ts).
 */

function childrenByParent(index: TreeIndex): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const family of index.families) {
    for (const parentId of [family.husband_id, family.wife_id]) {
      if (!parentId) continue;
      if (!children.has(parentId)) children.set(parentId, []);
      const list = children.get(parentId)!;
      for (const childId of family.children) if (!list.includes(childId)) list.push(childId);
    }
  }
  return children;
}

function parentsByChild(index: TreeIndex): Map<string, string[]> {
  const parents = new Map<string, string[]>();
  for (const family of index.families) {
    const parentIds = [family.husband_id, family.wife_id].filter((id): id is string => Boolean(id));
    if (!parentIds.length) continue;
    for (const childId of family.children) {
      if (!parents.has(childId)) parents.set(childId, []);
      const list = parents.get(childId)!;
      for (const parentId of parentIds) if (!list.includes(parentId)) list.push(parentId);
    }
  }
  return parents;
}

// Descendants ---------------------------------------------------------------

export interface DescendantCount {
  individual: TreeIndividual;
  descendants: number;
}

/** Distinct descendants of one person, cycle-safe. */
function countDescendants(childMap: Map<string, string[]>, rootId: string): number {
  const seen = new Set<string>();
  let frontier = childMap.get(rootId) ?? [];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(...(childMap.get(id) ?? []));
    }
    frontier = next;
  }
  return seen.size;
}

/** Who has the most documented descendants? */
export function mostDescendants(index: TreeIndex, limit = 10): DescendantCount[] {
  const childMap = childrenByParent(index);
  const result: DescendantCount[] = [];
  for (const id of childMap.keys()) {
    const individual = index.individuals.get(id);
    if (!individual) continue;
    result.push({ individual, descendants: countDescendants(childMap, id) });
  }
  return result
    .sort((a, b) => b.descendants - a.descendants || a.individual.full_name.localeCompare(b.individual.full_name))
    .slice(0, limit);
}

export interface GrandchildrenCount {
  individual: TreeIndividual;
  grandchildren: number;
}

/** Who has the most documented grandchildren? */
export function mostGrandchildren(index: TreeIndex, limit = 10): GrandchildrenCount[] {
  const childMap = childrenByParent(index);
  const result: GrandchildrenCount[] = [];
  for (const [id, children] of childMap) {
    const individual = index.individuals.get(id);
    if (!individual) continue;
    const grandchildren = new Set<string>();
    for (const childId of children) {
      for (const grandchildId of childMap.get(childId) ?? []) grandchildren.add(grandchildId);
    }
    if (grandchildren.size) result.push({ individual, grandchildren: grandchildren.size });
  }
  return result
    .sort((a, b) => b.grandchildren - a.grandchildren || a.individual.full_name.localeCompare(b.individual.full_name))
    .slice(0, limit);
}

// Pedigree collapse ---------------------------------------------------------

export interface AncestorPathCount {
  individual: TreeIndividual;
  /** Distinct parent-chains from the root person up to this ancestor. */
  paths: number;
}

/**
 * How many distinct lines of descent connect the root person to each
 * ancestor. Anyone with 2+ paths is a common ancestor of multiple lines
 * (pedigree collapse) — "which individuals are related by multiple
 * paths?" and "which are common ancestors of most lines?" in one shape.
 */
export function ancestorPathCounts(index: TreeIndex, rootId: string): AncestorPathCount[] {
  const parents = parentsByChild(index);
  const children = childrenByParent(index);

  const ancestors = new Set<string>();
  let frontier = [rootId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const parentId of parents.get(id) ?? []) {
        if (ancestors.has(parentId)) continue;
        ancestors.add(parentId);
        next.push(parentId);
      }
    }
    frontier = next;
  }

  // paths(A) = Σ paths(C) over A's children that sit on a root→A chain.
  const memo = new Map<string, number>([[rootId, 1]]);
  const visiting = new Set<string>();
  function paths(id: string): number {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // data-error cycle
    visiting.add(id);
    let total = 0;
    for (const childId of children.get(id) ?? []) {
      if (childId === rootId || ancestors.has(childId)) total += paths(childId);
    }
    visiting.delete(id);
    memo.set(id, total);
    return total;
  }

  const result: AncestorPathCount[] = [];
  for (const id of ancestors) {
    const individual = index.individuals.get(id);
    if (!individual) continue;
    result.push({ individual, paths: paths(id) });
  }
  return result.sort((a, b) => b.paths - a.paths || a.individual.full_name.localeCompare(b.individual.full_name));
}

/** Ancestors reached by more than one line of descent. */
export function relatedByMultiplePaths(index: TreeIndex, rootId: string): AncestorPathCount[] {
  return ancestorPathCounts(index, rootId).filter((entry) => entry.paths >= 2);
}

export interface AncestorInLaw {
  individual: TreeIndividual;
  /** Spouses who are themselves direct ancestors of the root. */
  ancestorSpouses: TreeIndividual[];
  /** Spouses outside the direct line — the in-law families. */
  otherSpouses: TreeIndividual[];
}

/**
 * Direct ancestors who also appear in family records outside the direct
 * line — an ancestor in the family that leads to the root, an in-law in
 * their other marriage.
 */
export function ancestorsAlsoInLaws(index: TreeIndex, rootId: string): AncestorInLaw[] {
  const ancestors = new Set(ancestorPathCounts(index, rootId).map((entry) => entry.individual.id));
  const spousesOf = new Map<string, Set<string>>();
  for (const family of index.families) {
    if (family.husband_id && family.wife_id) {
      if (!spousesOf.has(family.husband_id)) spousesOf.set(family.husband_id, new Set());
      if (!spousesOf.has(family.wife_id)) spousesOf.set(family.wife_id, new Set());
      spousesOf.get(family.husband_id)!.add(family.wife_id);
      spousesOf.get(family.wife_id)!.add(family.husband_id);
    }
  }

  const result: AncestorInLaw[] = [];
  for (const id of ancestors) {
    const individual = index.individuals.get(id);
    if (!individual) continue;
    const spouses = [...(spousesOf.get(id) ?? [])];
    const ancestorSpouses = spouses.filter((s) => ancestors.has(s));
    const otherSpouses = spouses.filter((s) => !ancestors.has(s));
    if (ancestorSpouses.length && otherSpouses.length) {
      result.push({
        individual,
        ancestorSpouses: ancestorSpouses.map((s) => index.individuals.get(s)!).filter(Boolean),
        otherSpouses: otherSpouses.map((s) => index.individuals.get(s)!).filter(Boolean),
      });
    }
  }
  return result.sort((a, b) => a.individual.full_name.localeCompare(b.individual.full_name));
}

// Names across the aisle ------------------------------------------------------

export interface SameSurnameMarriage {
  familyId: string;
  husband: TreeIndividual;
  wife: TreeIndividual;
  surname: string;
}

/** Marriages where the same surname appears on both sides. */
export function sameSurnameMarriages(index: TreeIndex): SameSurnameMarriage[] {
  const result: SameSurnameMarriage[] = [];
  for (const family of index.families) {
    if (!family.husband_id || !family.wife_id) continue;
    const husband = index.individuals.get(family.husband_id);
    const wife = index.individuals.get(family.wife_id);
    if (!husband?.surname || !wife?.surname) continue;
    if (husband.surname.toLowerCase() === wife.surname.toLowerCase()) {
      result.push({ familyId: family.id, husband, wife, surname: husband.surname });
    }
  }
  return result;
}

// Documentation density -------------------------------------------------------

export interface LineDocumentation {
  surname: string;
  individualCount: number;
  eventCount: number;
  eventsPerIndividual: number;
}

/**
 * How extensively each surname line is documented — best-covered lines
 * first; read from the tail for the thinnest.
 */
export function lineDocumentation(index: TreeIndex, minCount = 3): LineDocumentation[] {
  const eventsByIndividual = new Map<string, number>();
  for (const event of index.events) {
    eventsByIndividual.set(event.individualId, (eventsByIndividual.get(event.individualId) ?? 0) + 1);
  }
  const lines = new Map<string, { individuals: number; events: number }>();
  for (const person of index.individuals.values()) {
    if (!person.surname) continue;
    if (!lines.has(person.surname)) lines.set(person.surname, { individuals: 0, events: 0 });
    const line = lines.get(person.surname)!;
    line.individuals++;
    line.events += eventsByIndividual.get(person.id) ?? 0;
  }
  return [...lines.entries()]
    .filter(([, line]) => line.individuals >= minCount)
    .map(([surname, line]) => ({
      surname,
      individualCount: line.individuals,
      eventCount: line.events,
      eventsPerIndividual: line.events / line.individuals,
    }))
    .sort((a, b) => b.eventsPerIndividual - a.eventsPerIndividual);
}

// Siblings --------------------------------------------------------------------

export interface SiblingCount {
  individual: TreeIndividual;
  siblings: number;
}

/** Who has the most documented siblings (co-children of any shared family)? */
export function mostSiblings(index: TreeIndex, limit = 10): SiblingCount[] {
  const siblingsOf = new Map<string, Set<string>>();
  for (const family of index.families) {
    for (const childId of family.children) {
      if (!siblingsOf.has(childId)) siblingsOf.set(childId, new Set());
      for (const other of family.children) {
        if (other !== childId) siblingsOf.get(childId)!.add(other);
      }
    }
  }
  const result: SiblingCount[] = [];
  for (const [id, siblings] of siblingsOf) {
    const individual = index.individuals.get(id);
    if (individual && siblings.size) result.push({ individual, siblings: siblings.size });
  }
  return result
    .sort((a, b) => b.siblings - a.siblings || a.individual.full_name.localeCompare(b.individual.full_name))
    .slice(0, limit);
}

// Duplicates ------------------------------------------------------------------

export interface DuplicateCandidate {
  a: TreeIndividual;
  b: TreeIndividual;
  birthYearGap: number;
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Possible duplicate records: the same normalized name with birth years
 * within `tolerance` of each other.
 */
export function duplicateCandidates(index: TreeIndex, tolerance = 2): DuplicateCandidate[] {
  const byName = new Map<string, TreeIndividual[]>();
  for (const person of index.individuals.values()) {
    if (person.birth_year === null) continue;
    const key = nameKey(person.full_name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(person);
  }
  const result: DuplicateCandidate[] = [];
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.birth_year! - b.birth_year!);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const gap = group[j]!.birth_year! - group[i]!.birth_year!;
        if (gap > tolerance) break;
        result.push({ a: group[i]!, b: group[j]!, birthYearGap: gap });
      }
    }
  }
  return result.sort((a, b) => a.birthYearGap - b.birthYearGap);
}

// Geography of families ---------------------------------------------------------

export interface FamilyRegionCluster {
  familyId: string;
  husband: TreeIndividual | null;
  wife: TreeIndividual | null;
  region: string;
  decade: number;
  /** Family members with a dated event in this region this decade. */
  memberCount: number;
}

/**
 * Extended families that show up in the same region in the same decade —
 * the "did they migrate together?" signal. Clusters of one are omitted.
 */
export function familyRegionClusters(index: TreeIndex, minMembers = 2): FamilyRegionCluster[] {
  const eventsByIndividual = new Map<string, { region: string; decade: number }[]>();
  for (const event of index.events) {
    if (!event.placeId || event.year === null) continue;
    const region = index.places.get(event.placeId)?.region;
    if (!region) continue;
    if (!eventsByIndividual.has(event.individualId)) eventsByIndividual.set(event.individualId, []);
    eventsByIndividual.get(event.individualId)!.push({ region, decade: Math.floor(event.year / 10) * 10 });
  }

  const result: FamilyRegionCluster[] = [];
  for (const family of index.families) {
    const memberIds = [family.husband_id, family.wife_id, ...family.children].filter(
      (id): id is string => Boolean(id),
    );
    if (memberIds.length < minMembers) continue;
    const membersAt = new Map<string, Set<string>>();
    for (const memberId of memberIds) {
      for (const { region, decade } of eventsByIndividual.get(memberId) ?? []) {
        const key = `${region}|${decade}`;
        if (!membersAt.has(key)) membersAt.set(key, new Set());
        membersAt.get(key)!.add(memberId);
      }
    }
    for (const [key, members] of membersAt) {
      if (members.size < minMembers) continue;
      const [region, decade] = key.split('|');
      result.push({
        familyId: family.id,
        husband: family.husband_id ? (index.individuals.get(family.husband_id) ?? null) : null,
        wife: family.wife_id ? (index.individuals.get(family.wife_id) ?? null) : null,
        region: region!,
        decade: Number(decade),
        memberCount: members.size,
      });
    }
  }
  return result.sort((a, b) => b.memberCount - a.memberCount || a.decade - b.decade);
}

export interface PlaceGenerationSpan {
  placeRaw: string;
  /** Distinct birth centuries with an event at this place. */
  centuries: number[];
}

/**
 * Places that recur across generations — approximated by distinct
 * centuries of dated events at the same place. Widest span first.
 */
export function placesAcrossGenerations(index: TreeIndex, minCenturies = 2): PlaceGenerationSpan[] {
  const centuriesByPlace = new Map<string, Set<number>>();
  for (const event of index.events) {
    if (!event.placeId || event.year === null) continue;
    if (!centuriesByPlace.has(event.placeId)) centuriesByPlace.set(event.placeId, new Set());
    centuriesByPlace.get(event.placeId)!.add(Math.floor(event.year / 100) * 100);
  }
  const result: PlaceGenerationSpan[] = [];
  for (const [placeId, centuries] of centuriesByPlace) {
    if (centuries.size < minCenturies) continue;
    const place = index.places.get(placeId);
    if (!place) continue;
    result.push({ placeRaw: place.raw, centuries: [...centuries].sort((a, b) => a - b) });
  }
  return result.sort((a, b) => b.centuries.length - a.centuries.length);
}

export interface FamilyCountrySpan {
  familyId: string;
  husband: TreeIndividual | null;
  wife: TreeIndividual | null;
  year: number;
  countries: string[];
}

/**
 * Families whose members have dated events in different countries in the
 * same year — the household straddling an ocean.
 */
export function familiesSpanningCountries(index: TreeIndex): FamilyCountrySpan[] {
  const eventsByIndividual = new Map<string, { country: string; year: number }[]>();
  for (const event of index.events) {
    if (!event.placeId || event.year === null) continue;
    const country = index.places.get(event.placeId)?.country;
    if (!country) continue;
    if (!eventsByIndividual.has(event.individualId)) eventsByIndividual.set(event.individualId, []);
    eventsByIndividual.get(event.individualId)!.push({ country, year: event.year });
  }

  const result: FamilyCountrySpan[] = [];
  for (const family of index.families) {
    const memberIds = [family.husband_id, family.wife_id, ...family.children].filter(
      (id): id is string => Boolean(id),
    );
    const countriesByYear = new Map<number, Set<string>>();
    for (const memberId of memberIds) {
      for (const { country, year } of eventsByIndividual.get(memberId) ?? []) {
        if (!countriesByYear.has(year)) countriesByYear.set(year, new Set());
        countriesByYear.get(year)!.add(country);
      }
    }
    for (const [year, countries] of countriesByYear) {
      if (countries.size < 2) continue;
      result.push({
        familyId: family.id,
        husband: family.husband_id ? (index.individuals.get(family.husband_id) ?? null) : null,
        wife: family.wife_id ? (index.individuals.get(family.wife_id) ?? null) : null,
        year,
        countries: [...countries].sort(),
      });
    }
  }
  return result.sort((a, b) => a.year - b.year);
}

// Most distant pair ------------------------------------------------------------

export interface DistantPair {
  a: TreeIndividual;
  b: TreeIndividual;
  /** Steps through parent/child and spouse links. */
  steps: number;
}

function bfsFarthest(
  adjacency: Map<string, string[]>,
  start: string,
): { id: string; distance: number; visited: Set<string> } {
  const distance = new Map<string, number>([[start, 0]]);
  let frontier = [start];
  let farthest = { id: start, distance: 0 };
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      const d = distance.get(id)!;
      for (const neighbor of adjacency.get(id) ?? []) {
        if (distance.has(neighbor)) continue;
        distance.set(neighbor, d + 1);
        if (d + 1 > farthest.distance) farthest = { id: neighbor, distance: d + 1 };
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return { ...farthest, visited: new Set(distance.keys()) };
}

/**
 * The two most distantly connected individuals, by double-BFS over
 * parent/child and spouse links per connected component. Double-BFS is
 * exact on trees and a strong approximation on graphs with pedigree
 * collapse — good enough for a superlative.
 */
export function mostDistantPair(index: TreeIndex): DistantPair | null {
  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.get(a)!.includes(b)) adjacency.get(a)!.push(b);
  };
  for (const family of index.families) {
    const parents = [family.husband_id, family.wife_id].filter((id): id is string => Boolean(id));
    if (parents.length === 2) {
      link(parents[0]!, parents[1]!);
      link(parents[1]!, parents[0]!);
    }
    for (const childId of family.children) {
      for (const parentId of parents) {
        link(parentId, childId);
        link(childId, parentId);
      }
    }
  }

  const unvisited = new Set(adjacency.keys());
  let best: { a: string; b: string; steps: number } | null = null;
  while (unvisited.size) {
    const start = unvisited.values().next().value as string;
    const out = bfsFarthest(adjacency, start);
    const back = bfsFarthest(adjacency, out.id);
    for (const id of out.visited) unvisited.delete(id);
    if (!best || back.distance > best.steps) best = { a: out.id, b: back.id, steps: back.distance };
  }
  if (!best) return null;
  const a = index.individuals.get(best.a);
  const b = index.individuals.get(best.b);
  return a && b ? { a, b, steps: best.steps } : null;
}
