export type DateConfidence = 'exact' | 'approximate' | 'estimated' | 'unknown';

export type DateQualifier =
  | 'exact'
  | 'about'
  | 'calculated'
  | 'estimated'
  | 'before'
  | 'after'
  | 'between'
  | 'unknown';

export interface NormalizedDate {
  raw: string;
  year: number | null;
  month?: number;
  day?: number;
  qualifier: DateQualifier;
  confidence: DateConfidence;
  rangeStartYear?: number;
  rangeEndYear?: number;
}

export interface PlaceRef {
  id: string;
  raw: string;
  parts: string[];
}

export interface GedcomEvent {
  date?: NormalizedDate;
  placeId?: string;
  /** Custom event name from EVEN.TYPE, e.g. "Citizenship". */
  label?: string;
  /** Free-text payload: occupation title, custom-event description. */
  detail?: string;
  /** Media attached directly to this fact. */
  media?: MediaRef[];
}

export interface IndividualName {
  full: string;
  given?: string;
  surname?: string;
  prefix?: string;
  suffix?: string;
}

export interface MediaRef {
  /** Xref of the OBJE record when the link is a pointer. */
  objeId?: string;
  file?: string;
  title?: string;
  /** Ancestry _PRIM: this is the person's primary photo. */
  primary: boolean;
}

export interface SourceRecord {
  /** GEDCOM xref, e.g. "S266917025". */
  id: string;
  title?: string;
  author?: string;
  /** Publication details; Ancestry packs original-data provenance in here. */
  publisher?: string;
  /** Ancestry _APID of the source database, e.g. "1,1265::0". */
  apid?: string;
}

export interface SourceCitation {
  /** Xref of the source record this citation points into. */
  sourceId: string;
  /** Which fact it supports: person, name, birth, residence, marriage, … */
  fact: string;
  /** Free-text locator: page, roll, school name and year, … */
  page?: string;
  /** Excerpt of what the record actually says (SOUR.DATA.TEXT). */
  text?: string;
  /** Link to the record image or partner site (SOUR.DATA.WWW). */
  url?: string;
  /** Ancestry _APID of the specific record — the deep-link id. */
  apid?: string;
  /** Media attached to this citation, including FTM record images. */
  media?: MediaRef[];
}

export interface Individual {
  id: string;
  name: IndividualName;
  sex: 'M' | 'F' | 'U';
  birth?: GedcomEvent;
  death?: GedcomEvent;
  hasDeathRecord: boolean;
  burial?: GedcomEvent;
  residences: GedcomEvent[];
  /** CENS census enumerations — the raw material of household research. */
  censuses: GedcomEvent[];
  /** BAPM baptisms (CHR christenings parse as custom events, unchanged). */
  baptisms: GedcomEvent[];
  /** IMMI / EMIG / NATU migration-and-citizenship events. */
  immigrations: GedcomEvent[];
  emigrations: GedcomEvent[];
  naturalizations: GedcomEvent[];
  /** Ancestry _MILT military service events. */
  military: GedcomEvent[];
  /** OCCU facts; the occupation text is in `detail`. */
  occupations: GedcomEvent[];
  /** EVEN custom facts (draft registration, citizenship, …); name in `label`. */
  customEvents: GedcomEvent[];
  probate?: GedcomEvent;
  familyAsChild: string[];
  /** Typed view of familyAsChild — only families with a recorded qualifier. */
  parentage: ChildParentage[];
  familyAsSpouse: string[];
  living: boolean;
  /** Resolved note text: inline notes plus referenced shared (S)NOTE records. */
  notes: string[];
  media: MediaRef[];
  /** Ancestry unique person identifier (_UID, or bare UID in newer exports). */
  uid?: string;
  /** First Ancestry _APID seen in the record (database::record id, for deep links). */
  apid?: string;
  /**
   * FamilySearch person id (_FSFTID), present in exports from FamilySearch-
   * synced software (RootsMagic, Ancestral Quest). Deep-links to the person
   * at familysearch.org regardless of which program wrote the file.
   */
  familySearchId?: string;
  /** Source citations attached to this person and their facts. */
  citations: SourceCitation[];
}

/**
 * A child's link to one of their parent families, from the standard tags:
 * FAMC.PEDI (GEDCOM 5.5.1 and 7) and the ADOP event's FAMC.ADOP, which
 * names which parent adopted. Ancestry's _FREL/_MREL say the same thing
 * from the family's side — see ChildRelationship.
 */
export interface ChildParentage {
  familyId: string;
  /** birth · adopted · foster · sealing, verbatim from the record. */
  pedigree?: string;
  /** Which parent the ADOP event names. */
  adoptedBy?: 'father' | 'mother' | 'both';
}

export interface ChildRelationship {
  childId: string;
  /** Ancestry _FREL: child's relationship to the father (adopted, step, …). */
  fatherRelation?: string;
  /** Ancestry _MREL: child's relationship to the mother. */
  motherRelation?: string;
}

export interface Family {
  id: string;
  husbandId?: string;
  wifeId?: string;
  childIds: string[];
  marriage?: GedcomEvent;
  /** Media attached directly to the family record. */
  media: MediaRef[];
  /** Only children with a non-default relationship qualifier appear here. */
  childRelationships: ChildRelationship[];
  /** Source citations for the family's facts (marriage, divorce, …). */
  citations: SourceCitation[];
}

export type CuriosityType =
  | 'child_born_before_parent'
  | 'death_before_birth'
  | 'implausible_lifespan'
  | 'marriage_before_birth'
  | 'parent_too_young'
  | 'parent_too_old'
  | 'large_sibling_date_gap';

export interface Curiosity {
  type: CuriosityType;
  message: string;
  individualIds: string[];
  familyId?: string;
}

/**
 * Normalized identity of the program or platform that wrote the file
 * (HEAD.SOUR, corroborated by vendor-specific ids). Distinct from link
 * capability: a RootsMagic export synced from FamilySearch links its people
 * to familysearch.org even though RootsMagic itself has no web pages.
 */
export type TreeProvider =
  | 'ancestry'
  | 'familysearch'
  | 'myheritage'
  | 'findmypast'
  | 'rootsmagic'
  | 'familytreemaker'
  | 'gramps'
  | 'legacy'
  | 'paf';

export interface GedcomMetadata {
  sourceFile?: string;
  /** Raw HEAD.GEDC.VERS payload, e.g. "5.5.1" or "7.0.14". */
  gedcomVersion?: string;
  /** Which parsing rules were applied; unknown versions degrade to 5.5.1. */
  specVersion: '5.5.1' | '7.0' | 'unknown';
  charset?: string;
  treeName?: string;
  /** Raw HEAD.SOUR payload, kept verbatim for providers we don't recognize yet. */
  sourceSystem?: string;
  /** Normalized provider identity; undefined when the header names none we know. */
  provider?: TreeProvider;
  /** Ancestry's numeric tree id (HEAD.SOUR._TREE.RIN); only in Ancestry exports. */
  ancestryTreeId?: string;
  exportDate?: string;
  individualCount: number;
  familyCount: number;
  placeCount: number;
  parseWarnings: string[];
  parseDurationMs: number;
}

export interface ParsedGedcom {
  individuals: Map<string, Individual>;
  families: Map<string, Family>;
  places: PlaceRef[];
  /** Top-level source records, keyed by xref. */
  sources: Map<string, SourceRecord>;
  curiosities: Curiosity[];
  metadata: GedcomMetadata;
}
