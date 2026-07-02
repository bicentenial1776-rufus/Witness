import type { NormalizedDate, ParsedGedcom } from '../gedcom/index.js';
import type { Database } from './database.types.js';

type TreeInsert = Database['public']['Tables']['trees']['Insert'];
type PlaceInsert = Database['public']['Tables']['places']['Insert'];
type IndividualInsert = Database['public']['Tables']['individuals']['Insert'];
type IndividualEventInsert = Database['public']['Tables']['individual_events']['Insert'];
type FamilyInsert = Database['public']['Tables']['families']['Insert'];
type FamilyChildInsert = Database['public']['Tables']['family_children']['Insert'];
type CuriosityInsert = Database['public']['Tables']['curiosities']['Insert'];
type CuriosityIndividualInsert = Database['public']['Tables']['curiosity_individuals']['Insert'];
type IndividualEventType = Database['public']['Enums']['individual_event_type'];

export interface ImportPayload {
  tree: TreeInsert;
  places: PlaceInsert[];
  individuals: IndividualInsert[];
  individualEvents: IndividualEventInsert[];
  families: FamilyInsert[];
  familyChildren: FamilyChildInsert[];
  curiosities: CuriosityInsert[];
  curiosityIndividuals: CuriosityIndividualInsert[];
}

export interface BuildImportPayloadOptions {
  userId: string;
  /** Injectable so this stays testable/portable across Node, RN, and Deno. */
  generateId?: () => string;
}

function toIndividualEvent(
  individualId: string,
  treeId: string,
  userId: string,
  eventType: IndividualEventType,
  event: { date?: NormalizedDate; placeId?: string } | undefined,
  placeIdMap: Map<string, string>,
  sortOrder: number,
): IndividualEventInsert {
  const date = event?.date;
  return {
    individual_id: individualId,
    tree_id: treeId,
    user_id: userId,
    event_type: eventType,
    sort_order: sortOrder,
    place_id: event?.placeId ? (placeIdMap.get(event.placeId) ?? null) : null,
    date_raw: date?.raw ?? null,
    date_year: date?.year ?? null,
    date_month: date?.month ?? null,
    date_day: date?.day ?? null,
    date_qualifier: date?.qualifier ?? null,
    date_confidence: date?.confidence ?? null,
    date_range_start_year: date?.rangeStartYear ?? null,
    date_range_end_year: date?.rangeEndYear ?? null,
  };
}

/**
 * Pure transform from a parsed GEDCOM into DB-ready row arrays, in FK-safe
 * insert order. All primary keys are generated client-side (rather than
 * left to the DB) so cross-table references can be wired up in one pass
 * without round-tripping to Postgres between inserts.
 */
export function buildImportPayload(parsed: ParsedGedcom, options: BuildImportPayloadOptions): ImportPayload {
  const { userId } = options;
  const generateId = options.generateId ?? (() => crypto.randomUUID());

  const treeId = generateId();
  const placeIdMap = new Map<string, string>();
  const individualIdMap = new Map<string, string>();
  const familyIdMap = new Map<string, string>();

  for (const place of parsed.places) placeIdMap.set(place.id, generateId());
  for (const individual of parsed.individuals.values()) individualIdMap.set(individual.id, generateId());
  for (const family of parsed.families.values()) familyIdMap.set(family.id, generateId());

  const tree: TreeInsert = {
    id: treeId,
    user_id: userId,
    name: parsed.metadata.treeName ?? parsed.metadata.sourceFile ?? 'Untitled tree',
    source_file: parsed.metadata.sourceFile ?? null,
    gedcom_version: parsed.metadata.gedcomVersion ?? null,
    charset: parsed.metadata.charset ?? null,
    export_date: parsed.metadata.exportDate ?? null,
    individual_count: parsed.metadata.individualCount,
    family_count: parsed.metadata.familyCount,
    place_count: parsed.metadata.placeCount,
    parse_warnings: parsed.metadata.parseWarnings,
  };

  const places: PlaceInsert[] = parsed.places.map((place) => ({
    id: placeIdMap.get(place.id)!,
    tree_id: treeId,
    user_id: userId,
    raw: place.raw,
    parts: place.parts,
  }));

  const individuals: IndividualInsert[] = [];
  const individualEvents: IndividualEventInsert[] = [];

  for (const individual of parsed.individuals.values()) {
    const individualId = individualIdMap.get(individual.id)!;
    individuals.push({
      id: individualId,
      tree_id: treeId,
      user_id: userId,
      gedcom_xref: individual.id,
      full_name: individual.name.full,
      given_name: individual.name.given ?? null,
      surname: individual.name.surname ?? null,
      prefix: individual.name.prefix ?? null,
      suffix: individual.name.suffix ?? null,
      sex: individual.sex,
      has_death_record: individual.hasDeathRecord,
      living: individual.living,
      birth_year: individual.birth?.date?.year ?? null,
      death_year: individual.death?.date?.year ?? null,
    });

    if (individual.birth) {
      individualEvents.push(toIndividualEvent(individualId, treeId, userId, 'birth', individual.birth, placeIdMap, 0));
    }
    if (individual.death) {
      individualEvents.push(toIndividualEvent(individualId, treeId, userId, 'death', individual.death, placeIdMap, 0));
    }
    if (individual.burial) {
      individualEvents.push(toIndividualEvent(individualId, treeId, userId, 'burial', individual.burial, placeIdMap, 0));
    }
    individual.residences.forEach((residence, index) => {
      individualEvents.push(toIndividualEvent(individualId, treeId, userId, 'residence', residence, placeIdMap, index));
    });
  }

  const families: FamilyInsert[] = [];
  const familyChildren: FamilyChildInsert[] = [];

  for (const family of parsed.families.values()) {
    const familyId = familyIdMap.get(family.id)!;
    const marriageDate = family.marriage?.date;
    families.push({
      id: familyId,
      tree_id: treeId,
      user_id: userId,
      gedcom_xref: family.id,
      husband_id: family.husbandId ? (individualIdMap.get(family.husbandId) ?? null) : null,
      wife_id: family.wifeId ? (individualIdMap.get(family.wifeId) ?? null) : null,
      marriage_place_id: family.marriage?.placeId ? (placeIdMap.get(family.marriage.placeId) ?? null) : null,
      marriage_date_raw: marriageDate?.raw ?? null,
      marriage_date_year: marriageDate?.year ?? null,
      marriage_date_month: marriageDate?.month ?? null,
      marriage_date_day: marriageDate?.day ?? null,
      marriage_date_qualifier: marriageDate?.qualifier ?? null,
      marriage_date_confidence: marriageDate?.confidence ?? null,
      marriage_date_range_start_year: marriageDate?.rangeStartYear ?? null,
      marriage_date_range_end_year: marriageDate?.rangeEndYear ?? null,
    });

    // A CHIL/FAMC pointer that references an xref we never parsed as an
    // INDI record is a real (if rare) possibility in messy exports; skip
    // rather than insert a dangling FK.
    family.childIds.forEach((childXref, index) => {
      const childId = individualIdMap.get(childXref);
      if (!childId) return;
      familyChildren.push({ family_id: familyId, individual_id: childId, user_id: userId, birth_order: index });
    });
  }

  const curiosities: CuriosityInsert[] = [];
  const curiosityIndividuals: CuriosityIndividualInsert[] = [];

  for (const curiosity of parsed.curiosities) {
    const curiosityId = generateId();
    curiosities.push({
      id: curiosityId,
      tree_id: treeId,
      user_id: userId,
      type: curiosity.type,
      message: curiosity.message,
      family_id: curiosity.familyId ? (familyIdMap.get(curiosity.familyId) ?? null) : null,
    });
    for (const xref of curiosity.individualIds) {
      const individualId = individualIdMap.get(xref);
      if (!individualId) continue;
      curiosityIndividuals.push({ curiosity_id: curiosityId, individual_id: individualId, user_id: userId });
    }
  }

  return { tree, places, individuals, individualEvents, families, familyChildren, curiosities, curiosityIndividuals };
}
