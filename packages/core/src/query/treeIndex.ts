import type { ParsedGedcom } from '../gedcom/index.js';
import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { Database } from '../supabase/database.types.js';
import { fetchAllPages, PAGE_SIZE, seekAfter } from '../supabase/paginate.js';
import { buildImportPayload } from '../supabase/transform.js';
import { classifyPlace, regionOf } from './regions.js';

/**
 * The tree index is the substrate for the milestone (Section II) and
 * family-structure (Section X) queries: every individual, family, child
 * link, event, and place loaded once, then answered by pure functions.
 * It can be fetched from the database (runtime) or built from a freshly
 * parsed GEDCOM (tests, scripts) — the same import transform shapes both,
 * so fixtures and live trees answer identically.
 */

export interface TreeIndividual {
  id: string;
  full_name: string;
  given_name: string | null;
  surname: string | null;
  sex: 'M' | 'F' | 'U';
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

export interface TreeFamily {
  id: string;
  husband_id: string | null;
  wife_id: string | null;
  marriage_year: number | null;
  marriage_place_id: string | null;
  /** Child individual ids, in birth order where the GEDCOM recorded one. */
  children: string[];
}

export interface TreeEvent {
  individualId: string;
  eventType: Database['public']['Enums']['individual_event_type'];
  year: number | null;
  placeId: string | null;
  dateConfidence: Database['public']['Enums']['date_confidence'] | null;
}

export interface TreePlace {
  id: string;
  raw: string;
  parts: string[];
  region: string | null;
  country: string | null;
}

export interface TreeIndex {
  individuals: Map<string, TreeIndividual>;
  families: TreeFamily[];
  events: TreeEvent[];
  places: Map<string, TreePlace>;
}

interface FamilyRow {
  id: string;
  husband_id: string | null;
  wife_id: string | null;
  marriage_date_year: number | null;
  marriage_place_id: string | null;
}

interface FamilyChildRow {
  family_id: string;
  individual_id: string;
  birth_order: number | null;
}

interface EventRow {
  /** Present when fetched from the database (the pagination cursor); absent from a fresh GEDCOM parse. */
  id?: string;
  individual_id: string;
  event_type: TreeEvent['eventType'];
  date_year: number | null;
  place_id: string | null;
  date_confidence: TreeEvent['dateConfidence'];
}

interface PlaceRow {
  id: string;
  raw: string;
  parts: string[];
}

export function buildTreeIndexFromRows(
  individuals: TreeIndividual[],
  families: FamilyRow[],
  familyChildren: FamilyChildRow[],
  events: EventRow[],
  places: PlaceRow[],
): TreeIndex {
  const individualMap = new Map<string, TreeIndividual>();
  for (const row of individuals) individualMap.set(row.id, row);

  const childrenByFamily = new Map<string, FamilyChildRow[]>();
  for (const link of familyChildren) {
    if (!childrenByFamily.has(link.family_id)) childrenByFamily.set(link.family_id, []);
    childrenByFamily.get(link.family_id)!.push(link);
  }

  const familyList: TreeFamily[] = families.map((row) => {
    const links = childrenByFamily.get(row.id) ?? [];
    links.sort((a, b) => (a.birth_order ?? Number.MAX_SAFE_INTEGER) - (b.birth_order ?? Number.MAX_SAFE_INTEGER));
    return {
      id: row.id,
      husband_id: row.husband_id,
      wife_id: row.wife_id,
      marriage_year: row.marriage_date_year,
      marriage_place_id: row.marriage_place_id,
      children: links.map((l) => l.individual_id),
    };
  });

  const placeMap = new Map<string, TreePlace>();
  for (const row of places) {
    placeMap.set(row.id, { ...row, region: regionOf(row.parts), country: classifyPlace(row.parts).country });
  }

  const eventList: TreeEvent[] = events.map((row) => ({
    individualId: row.individual_id,
    eventType: row.event_type,
    year: row.date_year,
    placeId: row.place_id,
    dateConfidence: row.date_confidence,
  }));

  return { individuals: individualMap, families: familyList, events: eventList, places: placeMap };
}

/**
 * Index a parsed GEDCOM without a database round-trip, by running the
 * same transform the importer uses. Ids are deterministic per parse.
 */
export function buildTreeIndexFromParsed(parsed: ParsedGedcom): TreeIndex {
  let next = 0;
  const payload = buildImportPayload(parsed, { userId: 'index', generateId: () => `x${next++}` });
  return buildTreeIndexFromRows(
    payload.individuals.map((row) => ({
      id: row.id!,
      full_name: row.full_name,
      given_name: row.given_name ?? null,
      surname: row.surname ?? null,
      sex: row.sex ?? 'U',
      birth_year: row.birth_year ?? null,
      death_year: row.death_year ?? null,
      living: row.living ?? false,
    })),
    payload.families.map((row) => ({
      id: row.id!,
      husband_id: row.husband_id ?? null,
      wife_id: row.wife_id ?? null,
      marriage_date_year: row.marriage_date_year ?? null,
      marriage_place_id: row.marriage_place_id ?? null,
    })),
    payload.familyChildren.map((row) => ({
      family_id: row.family_id,
      individual_id: row.individual_id,
      birth_order: row.birth_order ?? null,
    })),
    payload.individualEvents.map((row) => ({
      individual_id: row.individual_id,
      event_type: row.event_type,
      date_year: row.date_year ?? null,
      place_id: row.place_id ?? null,
      date_confidence: row.date_confidence ?? null,
    })),
    payload.places.map((row) => ({ id: row.id!, raw: row.raw, parts: row.parts ?? [] })),
  );
}


// Adjacency ------------------------------------------------------------------

/** child id → deduped parent ids, from the family records. */
export function parentsByChild(index: TreeIndex): Map<string, string[]> {
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

/** parent id → deduped child ids, from the family records. */
export function childrenByParent(index: TreeIndex): Map<string, string[]> {
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

export async function fetchTreeIndex(client: WitnessSupabaseClient, treeId: string): Promise<TreeIndex> {
  const [individuals, families, familyChildren, events, places] = await Promise.all([
    fetchAllPages<TreeIndividual>(
      (after) => {
        let q = client
          .from('individuals')
          .select('id, full_name, given_name, surname, sex, birth_year, death_year, living')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching individuals failed',
    ),
    fetchAllPages<FamilyRow>(
      (after) => {
        let q = client
          .from('families')
          .select('id, husband_id, wife_id, marriage_date_year, marriage_place_id')
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
          .select('family_id, individual_id, birth_order')
          .eq('tree_id', treeId)
          .order('family_id')
          .order('individual_id')
          .limit(PAGE_SIZE);
        if (after) q = seekAfter(q, ['family_id', 'individual_id'], [after.family_id, after.individual_id]);
        return q;
      },
      'Fetching family children failed',
    ),
    fetchAllPages<EventRow>(
      (after) => {
        let q = client
          .from('individual_events')
          .select('id, individual_id, event_type, date_year, place_id, date_confidence')
          .eq('tree_id', treeId)
          .order('id')
          .limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching events failed',
    ),
    fetchAllPages<PlaceRow>(
      (after) => {
        let q = client.from('places').select('id, raw, parts').eq('tree_id', treeId).order('id').limit(PAGE_SIZE);
        if (after) q = q.gt('id', after.id);
        return q;
      },
      'Fetching places failed',
    ),
  ]);
  return buildTreeIndexFromRows(individuals, families, familyChildren, events, places);
}
