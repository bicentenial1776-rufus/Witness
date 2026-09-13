// Mirrored from packages/core/src/registers/types.ts — keep in sync
// (portSync.test.ts enforces byte equality outside this header).
/**
 * Historical Record Registers — shared types
 * (docs/witness-historical-record-registers-package.md).
 *
 * A register is a named public-domain record set served one of three ways:
 * Variant A (curated person rows matched to the tree), Variant B (entity
 * rows whose dated events attach to a person), Variant C (deep-link out,
 * structured save-back). The `config` blob on the catalog row owns the
 * knobs; these types own its shape.
 */

export type RegisterVariant = 'A' | 'B' | 'C';

export type RegisterLinkStatus = 'parsed_from_gedcom' | 'candidate' | 'confirmed' | 'rejected';

export interface RegisterDef {
  registerKey: string;
  displayName: string;
  variant: RegisterVariant;
  provenanceLabel: string;
  /** Shown on every card when present ("index only", Confederate caveat…). */
  coverageCaveat: string | null;
  status: 'active' | 'disabled';
  config: RegisterConfig;
}

/** A window of years an event can fall into to signal exposure. */
export interface DateWindow {
  from: number;
  to: number;
  weight: number;
  reason: string;
}

/** A place fragment (matched case-insensitively against place parts). */
export interface PlaceSignal {
  pattern: string;
  weight: number;
  reason: string;
}

export interface ExposureConfig {
  /** Hard filter — a mismatched sex scores zero, silently. */
  sex?: 'M' | 'F';
  dateWindows?: DateWindow[];
  placeSignals?: PlaceSignal[];
  /** Extra weight when a single event hits a window AND a place signal. */
  coincidenceBonus?: number;
  birthYearRange?: { from: number; to: number; weight: number; reason: string };
  surnames?: { list: string[]; weight: number; reason: string };
  /** A source the tree itself cites whose title matches (case-blind) —
      "U.S., Civil War Pension Index" on a person is the strongest signal
      a register can get from the file. The reason names the source. */
  citationSignals?: { pattern: string; weight: number; reason: string }[];
  /** Minimum score to count as exposed. */
  threshold: number;
}

export interface MatchConfig {
  /** Years two records may differ and still agree (default 5). */
  yearTolerance?: number;
  /** Years apart that kill a pair outright (default 15). */
  yearConflict?: number;
  /** Most candidates one person may collect (default 5). */
  maxCandidatesPerPerson?: number;
}

/** Optional event written when the user confirms a Variant A/B link. */
export interface ConfirmEventSpec {
  eventType: string;
  /** `{record_name}` / `{record_summary}` / `{register_label}` / `{source}` placeholders. */
  detailTemplate: string;
}

export interface RegisterConfig {
  exposure?: ExposureConfig;
  /** Variant B: the versioned unit vocabulary (unit-terms.json), seeded into
      the catalog row so the app can parse a regiment out of the file's own
      words (unitHints.ts). */
  unitTerms?: unknown;
  match?: MatchConfig;
  /** Variant C (and "view source"): a URL template — see fillDeepLink. */
  deepLinkTemplate?: string;
  confirmEvent?: ConfirmEventSpec;
  /** Map marker style key, resolved by the app's map layer. */
  markerStyle?: string;
  /** The "?" behind the register's label: a 3–4 sentence historically
      accurate account of what the record set is, dismissible on tap. */
  explainer?: string;
}

/** The tree-side facts the exposure scorer and matcher read. */
export interface RegisterPersonFacts {
  id: string;
  fullName: string;
  sex?: 'M' | 'F' | 'U';
  birthYear: number | null;
  deathYear: number | null;
  events: readonly {
    type: string;
    year: number | null;
    placeParts: readonly string[] | null;
  }[];
  /** Titles of the sources the tree cites for this person, when loaded. */
  citationTitles?: readonly string[];
}

/** A reference row (Variant A person or Variant B entity). */
export interface RegisterRecord {
  id: string;
  registerKey: string;
  recordKind: 'person' | 'entity';
  nameAsRecorded: string;
  surnameNormalized: string | null;
  givenNormalized: string | null;
  entityKey: string | null;
  attributes: Record<string, unknown>;
  sourceCitation: string;
  findingAidUrl: string | null;
}

export interface ExposureResult {
  score: number;
  exposed: boolean;
  reasons: string[];
}

export type RegisterMatchConfidence = 'strong' | 'probable' | 'weak';

export interface RegisterMatchCandidate {
  person: RegisterPersonFacts;
  record: RegisterRecord;
  confidence: RegisterMatchConfidence;
  reasons: string[];
}

/** A person↔record link row, app-shaped. */
export interface PersonRegisterLink {
  id: string;
  treeId: string;
  individualId: string;
  registerKey: string;
  recordId: string | null;
  status: RegisterLinkStatus;
  matchScore: number | null;
  matchReasons: string[];
  recordName: string | null;
  recordSummary: string | null;
  sourceCitation: string | null;
  findingAidUrl: string | null;
  savedPayload: Record<string, unknown> | null;
  confirmedAt: string | null;
}
