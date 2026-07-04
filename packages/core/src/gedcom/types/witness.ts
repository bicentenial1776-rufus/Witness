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

export interface Individual {
  id: string;
  name: IndividualName;
  sex: 'M' | 'F' | 'U';
  birth?: GedcomEvent;
  death?: GedcomEvent;
  hasDeathRecord: boolean;
  burial?: GedcomEvent;
  residences: GedcomEvent[];
  /** Ancestry _MILT military service events. */
  military: GedcomEvent[];
  familyAsChild: string[];
  familyAsSpouse: string[];
  living: boolean;
  /** Resolved note text: inline notes plus referenced shared (S)NOTE records. */
  notes: string[];
  media: MediaRef[];
  /** Ancestry unique person identifier (_UID, or bare UID in newer exports). */
  uid?: string;
  /** First Ancestry _APID seen in the record (database::record id, for deep links). */
  apid?: string;
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
  /** Only children with a non-default relationship qualifier appear here. */
  childRelationships: ChildRelationship[];
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

export interface GedcomMetadata {
  sourceFile?: string;
  /** Raw HEAD.GEDC.VERS payload, e.g. "5.5.1" or "7.0.14". */
  gedcomVersion?: string;
  /** Which parsing rules were applied; unknown versions degrade to 5.5.1. */
  specVersion: '5.5.1' | '7.0' | 'unknown';
  charset?: string;
  treeName?: string;
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
  curiosities: Curiosity[];
  metadata: GedcomMetadata;
}
