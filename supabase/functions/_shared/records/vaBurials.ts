/**
 * Veterans' gravesites — the pure matching half of the va-enrich worker
 * (supabase/functions/va-enrich; mirrored to _shared/records for Deno).
 *
 * The National Cemetery Administration publishes its Nationwide Gravesite
 * Locator as an open dataset (data.va.gov 3u66-fxug, CC0): 8.4 million
 * burials, each with the decedent's names and dates, the cemetery and its
 * coordinates, branch, rank, war, and the decedent's relationship to the
 * veteran the grave belongs to. Names are mixed-case and middle names and
 * suffixes are inconsistently split, so the worker searches by upper-cased
 * surname + first given name and this module decides which rows deserve a
 * card.
 *
 * Doctrine, the registers' own: a row is a candidate until the reader
 * says so; the death year must agree (within a year) or the row is not
 * offered at all; every point carries its reason in plain words.
 */

import { splitName } from './passengers.ts';

export interface VaGraveRow {
  decedent_id: string | number;
  d_first_name?: string | null;
  d_mid_name?: string | null;
  d_last_name?: string | null;
  d_suffix?: string | null;
  d_birth_date?: string | null;
  d_death_date?: string | null;
  section_id?: string | null;
  row_num?: string | null;
  site_num?: string | null;
  cem_name?: string | null;
  cem_addr_one?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  cem_url?: string | null;
  relationship?: string | null;
  v_first_name?: string | null;
  v_mid_name?: string | null;
  v_last_name?: string | null;
  v_suffix?: string | null;
  branch?: string | null;
  rank?: string | null;
  war?: string | null;
  location_point?: { type: 'Point'; coordinates: [number, number] } | null;
}

export interface VaPersonFacts {
  id: string;
  fullName: string;
  givenName: string | null;
  surname: string | null;
  birthYear: number | null;
  deathYear: number | null;
  /** Two-letter postal codes of the states the tree records events in. */
  usStates: readonly string[];
  /** Full names of the person's spouses in the tree, when loaded. */
  spouseNames?: readonly string[];
}

export type VaMatchConfidence = 'strong' | 'probable';

export interface VaMatchCandidate {
  row: VaGraveRow;
  score: number;
  confidence: VaMatchConfidence;
  reasons: string[];
  /** The card fields, denormalized the way person_register_links wants them. */
  recordName: string;
  recordSummary: string;
  sourceCitation: string;
  savedPayload: Record<string, unknown>;
}

/** "MM/DD/YYYY" → year, or null. The dataset also carries bare years. */
export function vaYear(date: string | null | undefined): number | null {
  if (!date) return null;
  const match = /(\d{4})\s*$/.exec(date.trim());
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) && year > 1700 && year < 2100 ? year : null;
}

/** "LAKESIDE CEMETERY" → "Lakeside Cemetery"; leaves mixed case alone. */
export function unshout(text: string | null | undefined): string {
  const t = (text ?? '').trim();
  if (!t) return '';
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .replace(/\b([a-z])/g, (ch) => ch.toUpperCase())
    .replace(/\bUs\b/g, 'US')
    .replace(/\b(Ii|Iii|Iv)\b/g, (s) => s.toUpperCase());
}

const WAR_LABELS: Record<string, string> = {
  'WORLD WAR I': 'World War I',
  'WORLD WAR II': 'World War II',
  KOREA: 'Korea',
  VIETNAM: 'Vietnam',
  'PERSIAN GULF': 'the Persian Gulf',
  'CIVIL WAR': 'the Civil War',
  'SPANISH AMERICAN WAR': 'the Spanish–American War',
};

/**
 * The dataset writes multi-service people as comma lists that repeat
 * ("US AIR FORCE, US AIR FORCE" · "T SGT, T SGT"): one entry per distinct
 * value, in order, re-cased.
 */
function dedupeList(text: string | null | undefined, label: (s: string) => string = unshout): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (text ?? '').split(',')) {
    const key = part.trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label(part.trim()));
  }
  return out.length > 0 ? out.join(', ') : null;
}

function warLabel(war: string | null | undefined): string | null {
  return dedupeList(war, (w) => WAR_LABELS[w.toUpperCase()] ?? unshout(w));
}

function firstToken(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function initial(name: string | null | undefined): string {
  return (name ?? '').trim().charAt(0).toLowerCase();
}

const SELF = /veteran\s*\(self\)|^self$/i;

/**
 * Given name and surname, from the columns when the import filled them
 * and from the full name when it did not — the Howe/Field tree carries
 * null in both columns for every person, so the full name is the rule,
 * not the fallback.
 */
export function withNameParts(person: VaPersonFacts): VaPersonFacts {
  if (person.givenName?.trim() && person.surname?.trim()) return person;
  const split = splitName(person.fullName);
  return {
    ...person,
    givenName: person.givenName?.trim() || split.givenNames || null,
    surname: person.surname?.trim() || split.surname || null,
  };
}

/** The person's own second given name, if the tree records one. */
function treeMiddle(person: VaPersonFacts): string | null {
  const parts = (person.givenName ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(' ') : null;
}

function decedentName(row: VaGraveRow): string {
  return [row.d_first_name, row.d_mid_name, row.d_last_name]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .concat(row.d_suffix?.trim() ? `, ${row.d_suffix.trim()}` : '');
}

function veteranName(row: VaGraveRow): string {
  return [row.v_first_name, row.v_mid_name, row.v_last_name]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Score one locator row against one tree person. Null when the row is
 * not offered at all — a death year that disagrees, or no death year to
 * check. Same-name strangers are the whole risk in an 8-million-row set;
 * the death year is the gate and the birth year does the sorting.
 */
export function scoreVaRow(personIn: VaPersonFacts, row: VaGraveRow): VaMatchCandidate | null {
  const person = withNameParts(personIn);
  const recordDeath = vaYear(row.d_death_date);
  const recordBirth = vaYear(row.d_birth_date);
  if (recordDeath === null || person.deathYear === null) return null;

  let score = 0;
  const reasons: string[] = [];

  const deathGap = Math.abs(recordDeath - person.deathYear);
  if (deathGap === 0) {
    score += 3;
    reasons.push(`died in ${recordDeath}, the year your tree records`);
  } else if (deathGap === 1) {
    score += 1;
    reasons.push(`died in ${recordDeath}; your tree says ${person.deathYear} — a year apart`);
  } else {
    return null;
  }

  if (recordBirth !== null && person.birthYear !== null) {
    const birthGap = Math.abs(recordBirth - person.birthYear);
    if (birthGap === 0) {
      score += 3;
      reasons.push(`born in ${recordBirth}, the year your tree records`);
    } else if (birthGap <= 2) {
      score += 1;
      reasons.push(`born in ${recordBirth}; your tree says ${person.birthYear} — within two years`);
    } else {
      return null;
    }
  } else if (person.birthYear === null) {
    reasons.push('your tree has no birth year to check against the record');
  }

  const middle = treeMiddle(person);
  const recordMiddle = (row.d_mid_name ?? '').trim();
  if (middle && recordMiddle) {
    if (firstToken(middle) === firstToken(recordMiddle)) {
      score += 2;
      reasons.push(`middle name ${unshout(recordMiddle)} agrees`);
    } else if (initial(middle) === initial(recordMiddle)) {
      score += 1;
      reasons.push(`middle initial ${initial(recordMiddle).toUpperCase()} agrees`);
    } else {
      score -= 2;
      reasons.push(`the record's middle name is ${unshout(recordMiddle)}; your tree says ${middle}`);
    }
  }

  const state = (row.state ?? '').trim().toUpperCase();
  if (state && person.usStates.some((s) => s.toUpperCase() === state)) {
    score += 1;
    reasons.push(`buried in ${state}, a state your tree already places them in`);
  }

  const relationship = (row.relationship ?? '').trim();
  const veteran = veteranName(row);
  if (relationship && !SELF.test(relationship) && veteran) {
    const label = unshout(relationship).toLowerCase();
    const spouse = (person.spouseNames ?? []).find(
      (name) => firstToken(name) === firstToken(row.v_first_name) && name.trim().split(/\s+/).pop()?.toLowerCase() === (row.v_last_name ?? '').trim().toLowerCase(),
    );
    if (spouse && /wife|husband|spouse|widow/i.test(relationship)) {
      score += 2;
      reasons.push(`buried as the ${label} of ${unshout(veteran)} — ${spouse} in your tree`);
    } else {
      reasons.push(`buried as the ${label} of ${unshout(veteran)}, a veteran`);
    }
  }

  // Four is the floor: an exact death year alone (3) is not offered; it
  // needs the state, or a birth year within two, or a middle initial to
  // go with it. Six is strong — death and birth exact, in effect.
  if (score < 4) return null;
  const confidence: VaMatchConfidence = score >= 6 ? 'strong' : 'probable';

  const cemetery = unshout(row.cem_name) || 'a veterans cemetery';
  const where = [unshout(row.city), state].filter(Boolean).join(', ');
  const branch = dedupeList(row.branch);
  const rank = dedupeList(row.rank);
  const service = [branch, rank, warLabel(row.war)].filter(Boolean);
  // The cemetery rides in the record NAME, not the summary: the confirm
  // event's detail is built from {record_name} by every client, including
  // App Store builds that predate the {record_summary} placeholder — so
  // the burial event reads "…, Lakeside Cemetery, Bryant Pond, ME" on all
  // of them, and the service line stays the summary.
  const recordSummary = service.join(' · ');
  const years = [recordBirth, recordDeath].filter((y) => y !== null).join('–');
  const recordName = `${unshout(decedentName(row))}${years ? ` (${years})` : ''} — ${cemetery}${where ? `, ${where}` : ''}`;
  const point = row.location_point?.coordinates;

  return {
    row,
    score,
    confidence,
    reasons,
    recordName,
    recordSummary,
    sourceCitation: `National Cemetery Administration, Nationwide Gravesite Locator — decedent ${row.decedent_id} (data.va.gov dataset 3u66-fxug, public domain)`,
    savedPayload: {
      decedent_id: String(row.decedent_id),
      decedent_name: unshout(decedentName(row)),
      birth_date: row.d_birth_date ?? null,
      death_date: row.d_death_date ?? null,
      event_year: recordDeath,
      cemetery,
      address: unshout(row.cem_addr_one) || null,
      city: unshout(row.city) || null,
      state: state || null,
      zip: row.zip ?? null,
      section: row.section_id ?? null,
      row: row.row_num ?? null,
      site: row.site_num ?? null,
      branch,
      rank,
      war: warLabel(row.war),
      relationship: relationship || null,
      veteran_name: veteran ? unshout(veteran) : null,
      cemetery_url: row.cem_url ?? null,
      latitude: Array.isArray(point) && typeof point[1] === 'number' ? point[1] : null,
      longitude: Array.isArray(point) && typeof point[0] === 'number' ? point[0] : null,
    },
  };
}

/**
 * All the rows worth offering for one person, best first, capped — a
 * common name with three plausible graves is three questions, not one
 * answer.
 */
export function matchVaRows(
  person: VaPersonFacts,
  rows: readonly VaGraveRow[],
  maxCandidates = 3,
): VaMatchCandidate[] {
  const seen = new Set<string>();
  const out: VaMatchCandidate[] = [];
  for (const row of rows) {
    const key = String(row.decedent_id);
    if (seen.has(key)) continue;
    seen.add(key);
    const candidate = scoreVaRow(person, row);
    if (candidate) out.push(candidate);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, maxCandidates);
}

/**
 * The SoQL filter for one person: upper-cased surname and first given
 * name, quotes doubled. Names in the dataset are mixed case, so the
 * `upper()` is what makes "Howe" and "HOWE" the same row.
 */
export function vaSoqlWhere(personIn: VaPersonFacts): string | null {
  const person = withNameParts(personIn);
  const surname = (person.surname ?? '').trim().toUpperCase().replace(/'/g, "''");
  const given = firstToken(person.givenName).toUpperCase().replace(/'/g, "''");
  if (!surname || !given || given.length < 2) return null;
  return `upper(d_last_name)='${surname}' AND upper(d_first_name)='${given}' AND d_death_date IS NOT NULL`;
}

const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
  'puerto rico': 'PR',
};

/** Postal codes for every US state named in a person's place parts. */
export function usStatesFromPlaceParts(placeParts: readonly (readonly string[] | null)[]): string[] {
  const codes = new Set<string>();
  for (const parts of placeParts) {
    for (const part of parts ?? []) {
      const key = part.trim().toLowerCase();
      const code = STATE_CODES[key] ?? (/^[a-z]{2}$/.test(key) && Object.values(STATE_CODES).includes(key.toUpperCase()) ? key.toUpperCase() : null);
      if (code) codes.add(code);
    }
  }
  return [...codes];
}
