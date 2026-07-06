/**
 * Canonicalizes the trailing parts of a GEDCOM place string into a country
 * and (for the US and Canada) a state/province. Real exports are messy:
 * "USA" / "United States" / "United States of America" coexist, states
 * appear bare or abbreviated ("Massachusetts", "MA", "Mass"), and many
 * places carry no country at all. All matching is case-insensitive and
 * ignores trailing periods.
 */

export interface PlaceRegion {
  /** Canonical country, or a passthrough of the last part when unrecognized. */
  country: string | null;
  /** Canonical US state or Canadian province, when one can be identified. */
  state: string | null;
}

const US = 'United States';
const CA = 'Canada';

const COUNTRY_SYNONYMS: Record<string, string> = {
  usa: US,
  us: US,
  'u s': US,
  'u s a': US,
  'united states': US,
  'united states of america': US,
  america: US,
  uk: 'United Kingdom',
  'u k': 'United Kingdom',
  'united kingdom': 'United Kingdom',
  'great britain': 'United Kingdom',
  canada: CA,
  holland: 'Netherlands',
};

const US_STATES: Record<string, string> = {
  alabama: 'Alabama', al: 'Alabama', ala: 'Alabama',
  alaska: 'Alaska', ak: 'Alaska',
  arizona: 'Arizona', az: 'Arizona', ariz: 'Arizona',
  arkansas: 'Arkansas', ar: 'Arkansas', ark: 'Arkansas',
  california: 'California', ca: 'California', cal: 'California', calif: 'California',
  colorado: 'Colorado', co: 'Colorado', colo: 'Colorado',
  connecticut: 'Connecticut', ct: 'Connecticut', conn: 'Connecticut',
  delaware: 'Delaware', de: 'Delaware', del: 'Delaware',
  'district of columbia': 'District of Columbia', dc: 'District of Columbia',
  florida: 'Florida', fl: 'Florida', fla: 'Florida',
  georgia: 'Georgia', ga: 'Georgia',
  hawaii: 'Hawaii', hi: 'Hawaii',
  idaho: 'Idaho', id: 'Idaho',
  illinois: 'Illinois', il: 'Illinois', ill: 'Illinois',
  indiana: 'Indiana', in: 'Indiana', ind: 'Indiana',
  iowa: 'Iowa', ia: 'Iowa',
  kansas: 'Kansas', ks: 'Kansas', kan: 'Kansas', kans: 'Kansas',
  kentucky: 'Kentucky', ky: 'Kentucky', ken: 'Kentucky',
  louisiana: 'Louisiana', la: 'Louisiana',
  maine: 'Maine', me: 'Maine',
  maryland: 'Maryland', md: 'Maryland',
  massachusetts: 'Massachusetts', ma: 'Massachusetts', mass: 'Massachusetts',
  michigan: 'Michigan', mi: 'Michigan', mich: 'Michigan',
  minnesota: 'Minnesota', mn: 'Minnesota', minn: 'Minnesota',
  mississippi: 'Mississippi', ms: 'Mississippi', miss: 'Mississippi',
  missouri: 'Missouri', mo: 'Missouri',
  montana: 'Montana', mt: 'Montana', mont: 'Montana',
  nebraska: 'Nebraska', ne: 'Nebraska', neb: 'Nebraska', nebr: 'Nebraska',
  nevada: 'Nevada', nv: 'Nevada', nev: 'Nevada',
  'new hampshire': 'New Hampshire', nh: 'New Hampshire',
  'new jersey': 'New Jersey', nj: 'New Jersey',
  'new mexico': 'New Mexico', nm: 'New Mexico',
  'new york': 'New York', ny: 'New York',
  'north carolina': 'North Carolina', nc: 'North Carolina',
  'north dakota': 'North Dakota', nd: 'North Dakota',
  ohio: 'Ohio', oh: 'Ohio',
  oklahoma: 'Oklahoma', ok: 'Oklahoma', okla: 'Oklahoma',
  oregon: 'Oregon', or: 'Oregon', ore: 'Oregon',
  pennsylvania: 'Pennsylvania', pa: 'Pennsylvania', penn: 'Pennsylvania', penna: 'Pennsylvania',
  'rhode island': 'Rhode Island', ri: 'Rhode Island',
  'south carolina': 'South Carolina', sc: 'South Carolina',
  'south dakota': 'South Dakota', sd: 'South Dakota',
  tennessee: 'Tennessee', tn: 'Tennessee', tenn: 'Tennessee',
  texas: 'Texas', tx: 'Texas', tex: 'Texas',
  utah: 'Utah', ut: 'Utah',
  vermont: 'Vermont', vt: 'Vermont',
  virginia: 'Virginia', va: 'Virginia',
  washington: 'Washington', wa: 'Washington', wash: 'Washington',
  'west virginia': 'West Virginia', wv: 'West Virginia',
  wisconsin: 'Wisconsin', wi: 'Wisconsin', wis: 'Wisconsin', wisc: 'Wisconsin',
  wyoming: 'Wyoming', wy: 'Wyoming', wyo: 'Wyoming',
};

const CA_PROVINCES: Record<string, string> = {
  alberta: 'Alberta', ab: 'Alberta',
  'british columbia': 'British Columbia', bc: 'British Columbia',
  manitoba: 'Manitoba', mb: 'Manitoba',
  'new brunswick': 'New Brunswick', nb: 'New Brunswick',
  newfoundland: 'Newfoundland and Labrador', 'newfoundland and labrador': 'Newfoundland and Labrador', nl: 'Newfoundland and Labrador',
  'nova scotia': 'Nova Scotia', ns: 'Nova Scotia',
  ontario: 'Ontario', on: 'Ontario', 'upper canada': 'Ontario', 'canada west': 'Ontario',
  'prince edward island': 'Prince Edward Island', pei: 'Prince Edward Island',
  quebec: 'Quebec', qc: 'Quebec', pq: 'Quebec', québec: 'Quebec', 'lower canada': 'Quebec', 'canada east': 'Quebec',
  saskatchewan: 'Saskatchewan', sk: 'Saskatchewan',
  // Not a modern province, but the region identity matters more than the
  // modern map for the family lines Witness serves. Kept as its own name.
  acadia: 'Acadia', acadie: 'Acadia',
};

function normalizeToken(part: string): string {
  return part.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

function titleCase(part: string): string {
  return part.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/**
 * Classifies a parts array (smallest place first, per GEDCOM convention).
 * Single-part places ("Boise") are treated as unplaceable rather than
 * guessed at: country and state both come back null.
 */
export function classifyPlace(parts: readonly string[]): PlaceRegion {
  if (parts.length < 2) return { country: null, state: null };

  const last = normalizeToken(parts[parts.length - 1] ?? '');
  // "Massachusetts, USA" resolves to the state even at two parts; a town
  // in that position ("Boston, USA") simply won't match a state token.
  const secondLast = normalizeToken(parts[parts.length - 2] ?? '');

  const country = COUNTRY_SYNONYMS[last];
  if (country === US) {
    return { country: US, state: (secondLast && US_STATES[secondLast]) ?? null };
  }
  if (country === CA) {
    return { country: CA, state: (secondLast && CA_PROVINCES[secondLast]) ?? null };
  }
  if (country) return { country, state: null };

  if (US_STATES[last]) return { country: US, state: US_STATES[last] };
  if (CA_PROVINCES[last]) return { country: CA, state: CA_PROVINCES[last] };

  // Unrecognized trailing part: treat it as a country-level region as
  // written (England, Ireland, British America, Channel Islands, …).
  return { country: titleCase(parts[parts.length - 1] ?? ''), state: null };
}

/**
 * The display region for rollups: state/province when known, otherwise
 * country, otherwise null (unplaceable).
 */
export function regionOf(parts: readonly string[]): string | null {
  const { country, state } = classifyPlace(parts);
  return state ?? country;
}

/** Canonical US state / Canadian province for a single place part, if any. */
export function canonicalState(part: string): string | null {
  const token = normalizeToken(part);
  return US_STATES[token] ?? CA_PROVINCES[token] ?? null;
}

const STATE_COUNTRY: Record<string, string> = {};
for (const state of Object.values(US_STATES)) STATE_COUNTRY[state] = US;
for (const province of Object.values(CA_PROVINCES)) STATE_COUNTRY[province] = CA;

/** True when the region is a state/province rather than a whole country. */
export function isStateLevel(region: string): boolean {
  return region in STATE_COUNTRY;
}

/**
 * True when two display regions can describe the same place at different
 * precision — "Maine" and "United States" are one census record away from
 * each other, not a migration.
 */
export function regionsCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  return STATE_COUNTRY[a] === b || STATE_COUNTRY[b] === a;
}
