// Mirrored from packages/core/src/registers/normalizers/acadianNames.ts — keep in sync
// (portSync.test.ts enforces byte equality outside this header).
import type { RegisterMatchPlugin, RegisterPersonFacts, RegisterRecord } from './mod.ts';

/**
 * The Acadian name normalizer and match plugin
 * (docs/witness-acadian-deportation-prompt.md, decision 5) — a first
 * pass, expected to be tuned. Deterministic and data-driven: the variant
 * table ships as a versioned file
 * (data/registers/acadian-deportation/name-variants.json) and is passed
 * in, never hardcoded here; only the fold logic and the register's
 * origin/destination signals are code.
 *
 * Deliberately NOT mapped in v1: translated dit-names (LeBlanc⇄White,
 * Bourg⇄Burke) — on a New England tree they would drown the matcher in
 * common Anglo surnames. They join the variant file only with a
 * tighter-gated design.
 */

export interface AcadianNameVariants {
  /** canonical (lowercase) -> variant spellings (lowercase). */
  given: Record<string, string[]>;
  surname: Record<string, string[]>;
}

function foldTable(table: Record<string, string[]>): Map<string, string> {
  const fold = new Map<string, string>();
  for (const [canonical, variants] of Object.entries(table)) {
    fold.set(canonical.toLowerCase(), canonical.toLowerCase());
    for (const variant of variants) fold.set(variant.toLowerCase(), canonical.toLowerCase());
  }
  return fold;
}

/** Places that say "the record's world": pre-Deportation Acadia. */
const ACADIAN_PLACES = [
  'acadi', 'grand pré', 'grand pre', 'grand-pré', 'grand-pre', 'minas',
  'les mines', 'gaspereau', 'rivière-aux-canards', 'riviere aux canards',
  'canard', 'beaubassin', 'pisiquid', 'piziquid', 'cobequid', 'port royal',
  'port-royal', 'nova scotia',
];

/** Places that say "the exile happened to them": where deportees landed. */
const EXILE_PLACES = [
  'louisiana', 'attakapas', 'opelousas', 'st. martinville', 'saint martinville',
  'saint-malo', 'st malo', 'belle-île', 'belle-ile', 'belle isle', 'miquelon',
  'cherbourg', 'nantes', 'poitou', 'saint-pierre',
];

function hitAny(person: RegisterPersonFacts, fragments: readonly string[]): string | null {
  for (const event of person.events) {
    for (const part of event.placeParts ?? []) {
      const lower = part.toLowerCase();
      const hit = fragments.find((f) => lower.includes(f));
      if (hit) return part;
    }
  }
  return null;
}

export function makeAcadianPlugin(variants: AcadianNameVariants): RegisterMatchPlugin {
  const givenFold = foldTable(variants.given);
  const surnameFold = foldTable(variants.surname);
  const canon = (fold: Map<string, string>) => (name: string) => {
    // Fold each token so "Jean Baptiste" folds token-wise.
    return name
      .split(/\s+/)
      .map((token) => fold.get(token.toLowerCase()) ?? token)
      .join(' ');
  };

  return {
    normalizeGiven: canon(givenFold),
    normalizeSurname: canon(surnameFold),
    extraSignals: (person: RegisterPersonFacts, _record: RegisterRecord) => {
      const reasons: string[] = [];
      const origin = hitAny(person, ACADIAN_PLACES);
      if (origin) reasons.push(`recorded at ${origin}, in the country the roll was taken`);
      const exile = hitAny(person, EXILE_PLACES);
      if (exile) reasons.push(`later recorded at ${exile}, an exile destination`);
      // Consistency with the record's world promotes one step; nothing
      // here vetoes — the years already did the vetoing.
      return { reasons, promote: reasons.length > 0 };
    },
  };
}
