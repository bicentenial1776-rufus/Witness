/**
 * Matching people across two exports of the same tree when no shared
 * key survives — Family Tree Maker's GEDCOM drops Ancestry's _UID, so
 * the only handles left are the name and the years.
 *
 * Tiers run strict to loose; each tier only considers people neither
 * side has matched yet, and only pairs where the key is unique on BOTH
 * sides — two "John Smith b. 1820" on either side stay unmatched rather
 * than guessed. The report says which tier each match came from so a
 * reader can decide how far down to trust it.
 */

export interface PersonKey {
  id: string;
  fullName: string;
  birthYear: number | null;
  deathYear: number | null;
  sex?: string | null;
}

export type MatchTier = 'exact' | 'loose' | 'birth' | 'loose-birth' | 'name-only';

export interface PersonMatch {
  sourceId: string;
  targetId: string;
  tier: MatchTier;
}

export interface MatchReport {
  matches: PersonMatch[];
  byTier: Record<MatchTier, number>;
  unmatchedSource: string[];
  unmatchedTarget: string[];
}

/** Case, spacing, and stray punctuation folded; nicknames and asterisks kept. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nicknames in quotes, trailing markers (*), and single-letter initials dropped. */
export function looseName(name: string): string {
  return normalizeName(name)
    .replace(/["“”'‘’][^"“”'‘’]*["“”'‘’]/g, ' ')
    .replace(/\*+/g, ' ')
    .split(' ')
    .filter((part) => part.length > 1)
    .join(' ');
}

const TIERS: { tier: MatchTier; key: (p: PersonKey) => string | null }[] = [
  { tier: 'exact', key: (p) => (p.birthYear || p.deathYear ? `${normalizeName(p.fullName)}|${p.birthYear ?? ''}|${p.deathYear ?? ''}` : null) },
  { tier: 'loose', key: (p) => (p.birthYear || p.deathYear ? `${looseName(p.fullName)}|${p.birthYear ?? ''}|${p.deathYear ?? ''}` : null) },
  { tier: 'birth', key: (p) => (p.birthYear ? `${normalizeName(p.fullName)}|${p.birthYear}` : null) },
  { tier: 'loose-birth', key: (p) => (p.birthYear ? `${looseName(p.fullName)}|${p.birthYear}` : null) },
  { tier: 'name-only', key: (p) => looseName(p.fullName) || null },
];

function uniqueIndex(people: PersonKey[], key: (p: PersonKey) => string | null): Map<string, PersonKey> {
  const seen = new Map<string, PersonKey | null>();
  for (const person of people) {
    const k = key(person);
    if (!k) continue;
    seen.set(k, seen.has(k) ? null : person);
  }
  const unique = new Map<string, PersonKey>();
  for (const [k, person] of seen) if (person) unique.set(k, person);
  return unique;
}

function yearsCompatible(a: PersonKey, b: PersonKey): boolean {
  const same = (x: number | null, y: number | null) => x === null || y === null || x === y;
  return same(a.birthYear, b.birthYear) && same(a.deathYear, b.deathYear);
}

function sexCompatible(a: PersonKey, b: PersonKey): boolean {
  const known = (s: string | null | undefined) => s === 'M' || s === 'F';
  return !known(a.sex) || !known(b.sex) || a.sex === b.sex;
}

export function matchPeople(source: PersonKey[], target: PersonKey[]): MatchReport {
  const matches: PersonMatch[] = [];
  const byTier: Record<MatchTier, number> = { exact: 0, loose: 0, birth: 0, 'loose-birth': 0, 'name-only': 0 };
  let openSource = source;
  let openTarget = target;

  for (const { tier, key } of TIERS) {
    const targetIndex = uniqueIndex(openTarget, key);
    const sourceIndex = uniqueIndex(openSource, key);
    const takenTargets = new Set<string>();
    const takenSources = new Set<string>();
    for (const [k, s] of sourceIndex) {
      const t = targetIndex.get(k);
      if (!t || !yearsCompatible(s, t) || !sexCompatible(s, t)) continue;
      matches.push({ sourceId: s.id, targetId: t.id, tier });
      byTier[tier] += 1;
      takenSources.add(s.id);
      takenTargets.add(t.id);
    }
    openSource = openSource.filter((p) => !takenSources.has(p.id));
    openTarget = openTarget.filter((p) => !takenTargets.has(p.id));
  }

  return {
    matches,
    byTier,
    unmatchedSource: openSource.map((p) => p.id),
    unmatchedTarget: openTarget.map((p) => p.id),
  };
}
