import type { ChildParentage, MediaRef, NormalizedDate, ParsedGedcom, SourceCitation } from '../gedcom/index.js';
import type { Database } from './database.types.js';

type TreeInsert = Database['public']['Tables']['trees']['Insert'];
type PlaceInsert = Database['public']['Tables']['places']['Insert'];
type IndividualInsert = Database['public']['Tables']['individuals']['Insert'];
type IndividualEventInsert = Database['public']['Tables']['individual_events']['Insert'];
type IndividualNoteInsert = Database['public']['Tables']['individual_notes']['Insert'];
type FamilyInsert = Database['public']['Tables']['families']['Insert'];
type FamilyChildInsert = Database['public']['Tables']['family_children']['Insert'];
type CuriosityInsert = Database['public']['Tables']['curiosities']['Insert'];
type CuriosityIndividualInsert = Database['public']['Tables']['curiosity_individuals']['Insert'];
type SourceInsert = Database['public']['Tables']['sources']['Insert'];
type CitationInsert = Database['public']['Tables']['citations']['Insert'];
type MediaInsert = Database['public']['Tables']['media']['Insert'];
type MediaLinkInsert = Database['public']['Tables']['media_links']['Insert'];
type IndividualEventType = Database['public']['Enums']['individual_event_type'];

type MediaSubject = Pick<
  MediaLinkInsert,
  'individual_id' | 'family_id' | 'individual_event_id' | 'citation_id'
>;

interface MediaAttachment {
  ref: MediaRef;
  subject: MediaSubject;
}

export interface ImportPayload {
  tree: TreeInsert;
  places: PlaceInsert[];
  individuals: IndividualInsert[];
  individualEvents: IndividualEventInsert[];
  /** Person-level NOTE / SNOTE text from the file, in the file's order. */
  individualNotes: IndividualNoteInsert[];
  families: FamilyInsert[];
  familyChildren: FamilyChildInsert[];
  curiosities: CuriosityInsert[];
  curiosityIndividuals: CuriosityIndividualInsert[];
  sources: SourceInsert[];
  citations: CitationInsert[];
  media: MediaInsert[];
  mediaLinks: MediaLinkInsert[];
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
  event: { date?: NormalizedDate; placeId?: string; label?: string; detail?: string; media?: MediaRef[] } | undefined,
  placeIdMap: Map<string, string>,
  sortOrder: number,
  generateId: () => string,
): IndividualEventInsert {
  const date = event?.date;
  return {
    id: generateId(),
    individual_id: individualId,
    tree_id: treeId,
    user_id: userId,
    event_type: eventType,
    sort_order: sortOrder,
    label: event?.label ?? null,
    detail: event?.detail ?? null,
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
    ancestry_tree_id: parsed.metadata.ancestryTreeId ?? null,
    provider: parsed.metadata.provider ?? null,
    export_date: parsed.metadata.exportDate ?? null,
    // Zero until the rows actually land. The tree row is inserted first (every
    // other table points at it), so any count written here is a claim about
    // data that does not exist yet — and the app picks its active tree by
    // largest individual_count, so a header count of 5,495 would hand the whole
    // UI to an empty tree for the length of the import. importParsedGedcom
    // writes the real figures once the inserts succeed.
    individual_count: 0,
    family_count: 0,
    place_count: 0,
    import_status: 'importing',
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
  const individualNotes: IndividualNoteInsert[] = [];
  const mediaAttachments: MediaAttachment[] = [];

  const pushEvent = (...args: Parameters<typeof toIndividualEvent>) => {
    const row = toIndividualEvent(...args);
    individualEvents.push(row);
    for (const ref of args[4]?.media ?? []) {
      mediaAttachments.push({ ref, subject: { individual_event_id: row.id! } });
    }
  };

  for (const individual of parsed.individuals.values()) {
    const individualId = individualIdMap.get(individual.id)!;
    // The file's notes on this person, in the file's order. Ids are minted
    // here so a batch resent after a lost connection lands once.
    individual.notes.forEach((content, position) => {
      individualNotes.push({
        id: generateId(),
        tree_id: treeId,
        user_id: userId,
        individual_id: individualId,
        position,
        content,
      });
    });
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
      ancestry_uid: individual.uid ?? null,
      ancestry_apid: individual.apid ?? null,
      familysearch_id: individual.familySearchId ?? null,
    });
    for (const ref of individual.media) {
      mediaAttachments.push({ ref, subject: { individual_id: individualId } });
    }

    if (individual.birth) {
      pushEvent(individualId, treeId, userId, 'birth', individual.birth, placeIdMap, 0, generateId);
    }
    if (individual.death) {
      pushEvent(individualId, treeId, userId, 'death', individual.death, placeIdMap, 0, generateId);
    }
    if (individual.burial) {
      pushEvent(individualId, treeId, userId, 'burial', individual.burial, placeIdMap, 0, generateId);
    }
    individual.residences.forEach((residence, index) => {
      pushEvent(individualId, treeId, userId, 'residence', residence, placeIdMap, index, generateId);
    });
    individual.censuses.forEach((census, index) => {
      pushEvent(individualId, treeId, userId, 'census', census, placeIdMap, index, generateId);
    });
    individual.baptisms.forEach((baptism, index) => {
      pushEvent(individualId, treeId, userId, 'baptism', baptism, placeIdMap, index, generateId);
    });
    individual.immigrations.forEach((immigration, index) => {
      pushEvent(individualId, treeId, userId, 'immigration', immigration, placeIdMap, index, generateId);
    });
    individual.emigrations.forEach((emigration, index) => {
      pushEvent(individualId, treeId, userId, 'emigration', emigration, placeIdMap, index, generateId);
    });
    individual.naturalizations.forEach((naturalization, index) => {
      pushEvent(individualId, treeId, userId, 'naturalization', naturalization, placeIdMap, index, generateId);
    });
    individual.military.forEach((service, index) => {
      pushEvent(individualId, treeId, userId, 'military', service, placeIdMap, index, generateId);
    });
    individual.occupations.forEach((occupation, index) => {
      pushEvent(individualId, treeId, userId, 'occupation', occupation, placeIdMap, index, generateId);
    });
    individual.customEvents.forEach((event, index) => {
      pushEvent(individualId, treeId, userId, 'custom', event, placeIdMap, index, generateId);
    });
    if (individual.probate) {
      pushEvent(individualId, treeId, userId, 'probate', individual.probate, placeIdMap, 0, generateId);
    }
  }

  const families: FamilyInsert[] = [];
  const familyChildren: FamilyChildInsert[] = [];

  // A child's own FAMC.PEDI / ADOP, keyed by child and family. Ancestry's
  // family-side _FREL/_MREL wins where both exist — it is recorded per
  // parent, where PEDI covers the whole family.
  const parentageByLink = new Map<string, ChildParentage>();
  for (const individual of parsed.individuals.values()) {
    for (const entry of individual.parentage) {
      parentageByLink.set(`${individual.id}|${entry.familyId}`, entry);
    }
  }

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
    for (const ref of family.media) {
      mediaAttachments.push({ ref, subject: { family_id: familyId } });
    }
    // There is no separate family-event table yet; keep marriage media on
    // the family until the event model gains a family_event row.
    for (const ref of family.marriage?.media ?? []) {
      mediaAttachments.push({ ref, subject: { family_id: familyId } });
    }

    // A CHIL/FAMC pointer that references an xref we never parsed as an
    // INDI record is a real (if rare) possibility in messy exports; skip
    // rather than insert a dangling FK.
    const relationByChild = new Map(family.childRelationships.map((r) => [r.childId, r]));
    // PAF exports can list the same child twice under one family; the
    // (family_id, individual_id) primary key rejects the second copy and
    // took a 61,773-person import down with it.
    const seenChildren = new Set<string>();
    family.childIds.forEach((childXref, index) => {
      const childId = individualIdMap.get(childXref);
      if (!childId || seenChildren.has(childXref)) return;
      seenChildren.add(childXref);
      const relation = relationByChild.get(childXref);
      const parentage = parentageByLink.get(`${childXref}|${family.id}`);
      // An ADOP event can name one adopting parent; the other side keeps
      // whatever the record says it was.
      const pedigreeFor = (side: 'father' | 'mother'): string | null => {
        if (!parentage?.pedigree) return null;
        if (parentage.adoptedBy && parentage.adoptedBy !== 'both' && parentage.adoptedBy !== side) {
          return null;
        }
        return parentage.pedigree;
      };
      familyChildren.push({
        family_id: familyId,
        individual_id: childId,
        user_id: userId,
        birth_order: index,
        father_relation: relation?.fatherRelation ?? pedigreeFor('father'),
        mother_relation: relation?.motherRelation ?? pedigreeFor('mother'),
      });
    });
  }

  const sourceIdMap = new Map<string, string>();
  for (const source of parsed.sources.values()) sourceIdMap.set(source.id, generateId());

  const sources: SourceInsert[] = [...parsed.sources.values()].map((source) => ({
    id: sourceIdMap.get(source.id)!,
    tree_id: treeId,
    user_id: userId,
    gedcom_xref: source.id,
    title: source.title ?? null,
    author: source.author ?? null,
    publisher: source.publisher ?? null,
    ancestry_apid: source.apid ?? null,
  }));

  // A citation pointing at a source record the file never defines is a
  // dangling FK, not evidence; skip it like an unparseable child pointer.
  const citations: CitationInsert[] = [];
  // Family Tree Maker writes the literal word "(null)" where a citation
  // has no transcribed text — 25,062 of the Howe/Field export's 29,186
  // citations carry it — and the Sources tab printed it in quotation
  // marks as if the record said so. Absent is absent.
  const withoutFtmNull = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' || /^\(null\)$/i.test(trimmed) ? null : value!;
  };

  const pushCitations = (
    list: SourceCitation[],
    subject: { individual_id: string } | { family_id: string },
  ) => {
    for (const citation of list) {
      const sourceId = sourceIdMap.get(citation.sourceId);
      if (!sourceId) continue;
      const citationId = generateId();
      citations.push({
        id: citationId,
        tree_id: treeId,
        user_id: userId,
        source_id: sourceId,
        fact: citation.fact,
        page: withoutFtmNull(citation.page),
        text_excerpt: withoutFtmNull(citation.text),
        url: withoutFtmNull(citation.url),
        ancestry_apid: citation.apid ?? null,
        ...subject,
      });
      for (const ref of citation.media ?? []) {
        mediaAttachments.push({ ref, subject: { citation_id: citationId } });
      }
    }
  };
  for (const individual of parsed.individuals.values()) {
    pushCitations(individual.citations, { individual_id: individualIdMap.get(individual.id)! });
  }
  for (const family of parsed.families.values()) {
    pushCitations(family.citations, { family_id: familyIdMap.get(family.id)! });
  }

  const mediaIdByKey = new Map<string, string>();
  const media: MediaInsert[] = [];
  const mediaLinks: MediaLinkInsert[] = [];
  const mediaKey = (ref: MediaRef): string =>
    ref.objeId ?? `inline:${ref.file ?? ''}:${ref.title ?? ''}`;
  const mediaFormat = (file: string | undefined): string | null => {
    const match = file?.match(/\.([^.\\/]+)$/);
    return match?.[1]?.toLowerCase() ?? null;
  };

  for (const attachment of mediaAttachments) {
    const key = mediaKey(attachment.ref);
    let mediaId = mediaIdByKey.get(key);
    if (!mediaId) {
      mediaId = generateId();
      mediaIdByKey.set(key, mediaId);
      media.push({
        id: mediaId,
        tree_id: treeId,
        user_id: userId,
        gedcom_xref: key,
        file_path: attachment.ref.file ?? null,
        title: attachment.ref.title ?? null,
        format: mediaFormat(attachment.ref.file),
        storage_path: null,
        byte_size: null,
        content_hash: null,
        upload_status: 'pending',
      });
    }
    // An id of our own, like every other row: a batch resent after a lost
    // reply must collide on its key rather than link the same photo twice.
    mediaLinks.push({
      id: generateId(),
      tree_id: treeId,
      user_id: userId,
      media_id: mediaId,
      is_primary: attachment.ref.primary,
      ...attachment.subject,
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
    for (const xref of new Set(curiosity.individualIds)) {
      const individualId = individualIdMap.get(xref);
      if (!individualId) continue;
      curiosityIndividuals.push({ curiosity_id: curiosityId, individual_id: individualId, user_id: userId });
    }
  }

  return {
    tree,
    places,
    individuals,
    individualEvents,
    individualNotes,
    families,
    familyChildren,
    curiosities,
    curiosityIndividuals,
    sources,
    citations,
    media,
    mediaLinks,
  };
}
