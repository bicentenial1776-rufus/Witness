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

export interface Individual {
  id: string;
  name: IndividualName;
  sex: 'M' | 'F' | 'U';
  birth?: GedcomEvent;
  death?: GedcomEvent;
  hasDeathRecord: boolean;
  burial?: GedcomEvent;
  residences: GedcomEvent[];
  familyAsChild: string[];
  familyAsSpouse: string[];
  living: boolean;
}

export interface Family {
  id: string;
  husbandId?: string;
  wifeId?: string;
  childIds: string[];
  marriage?: GedcomEvent;
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
  gedcomVersion?: string;
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
