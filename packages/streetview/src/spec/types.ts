/**
 * The Street View scene-spec contract.
 *
 * A SceneSpec is the versioned JSON boundary between the Witness data layer
 * (GEDCOM subtree, evidence, narrative) and the rendering engine. The engine
 * never sees a GEDCOM; the generator never sees a camera. Every entry point
 * in the app (Family Stage, Portrait, digest deep-link) compiles down to a
 * spec, and cached narratives/bookmarks pin the spec version they were
 * generated against.
 *
 * Privacy rule enforced at generation time: living persons carry no names,
 * no dates, and no places — only a surname-labelled household shell.
 */

export const SCENE_SPEC_VERSION = 1;

/** Period style-pack cell. Matches the demo taxonomy; packs formalize it. */
export type EraCell =
  | 'england_hall'
  | 'colonial_hall'
  | 'federal_farm'
  | 'quebec_farm'
  | 'milltown'
  | 'postwar';

/** Evidence band — the honesty layer, rendered visibly (door markers etc). */
export type EvidenceBand = 'documented' | 'partial' | 'lost' | 'living';

export interface HouseholdSpec {
  /** GEDCOM family xref, e.g. "F1555". Stable across regenerations. */
  id: string;
  /** The year the household is staged at (marriage, else inferred). */
  year: number;
  /** Style-pack cell, or null when the evidence can't support a period. */
  era: EraCell | null;
  band: EvidenceBand;
  /** 0..1 — how documented this household is (drives detail density). */
  score: number;
  /** Children recorded in the family. */
  children: number;
  /** Total source citations across the family and both spouses. */
  sources: number;
  /** Paternal-line surname used for world bearing. */
  surname: string;
  /** Names/dates/places are absent for living households (privacy). */
  husbandName?: string;
  wifeName?: string;
  husbandLifespan?: string;
  wifeLifespan?: string;
  marriageDate?: string;
  place?: string;
  /** Family xref of the husband's parents, when inside this spec. */
  fatherFamilyId?: string;
  /** Family xref of the wife's parents, when inside this spec. */
  motherFamilyId?: string;
  /** Generations back from the anchor (0 = anchor's own household). */
  generation?: number;
  /** World placement, metres. Computed deterministically from the seed. */
  x: number;
  z: number;
  /** Facing (radians); houses face the hub. */
  bearing: number;
}

export interface SurnameLine {
  surname: string;
  /** Compass bearing (radians) assigned to this line's wedge. */
  bearing: number;
  households: number;
}

export interface SceneSpecStats {
  individualsInTree: number;
  familiesInTree: number;
  householdsPlaced: number;
  householdsUndatable: number;
  yearMin: number;
  yearMax: number;
  bands: Record<EvidenceBand, number>;
}

export interface SceneSpec {
  version: typeof SCENE_SPEC_VERSION;
  /** Layout seed — same seed + same tree = identical world. */
  seed: number;
  anchor: {
    individualId: string;
    /** Withheld ("Living") when the anchor is flagged living? No — the
     *  anchor is the user; their name labels the experience, not a figure. */
    name: string;
  };
  households: HouseholdSpec[];
  majorLines: SurnameLine[];
  stats: SceneSpecStats;
}
