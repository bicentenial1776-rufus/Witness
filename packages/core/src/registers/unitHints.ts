import type { ParsedUnit } from './normalizers/unitDesignation.js';

/**
 * Unit hints for a Variant B candidate (Rufus, 2026-09-06: "think about
 * how we can somehow identify a unit if the person is a genuine
 * candidate"). Witness never guesses a regiment from a name index it
 * does not hold; but the family's own file often names it — an
 * obituary clipping, a headstone reading "Co. H 25th Mass.", a pension
 * paper — and the readings now put those words within reach. This finds
 * regiment-shaped spans in free text and hands each to the deterministic
 * unit parser. Every hint carries the words it came from; the reader
 * attaches, Witness proposes.
 */

export interface UnitMention {
  /** The words as they appear in the text. */
  span: string;
  unit: ParsedUnit;
}

const STATE_WORDS =
  'maine|me\\.?|massachusetts|mass\\.?|new hampshire|n\\.? ?h\\.?|vermont|vt\\.?|connecticut|conn\\.?|rhode island|r\\.? ?i\\.?|new york|n\\.? ?y\\.?|new jersey|n\\.? ?j\\.?|pennsylvania|penn\\.?|pa\\.?|ohio|indiana|ind\\.?|illinois|ill\\.?|michigan|mich\\.?|wisconsin|wis\\.?|minnesota|minn\\.?|iowa|missouri|mo\\.?|kansas|kentucky|ky\\.?|tennessee|tenn\\.?|maryland|md\\.?|delaware|del\\.?|west virginia|virginia|va\\.?|california|cal\\.?|oregon|colorado|nebraska|nevada|dakota|new mexico|louisiana|alabama|ala\\.?|arkansas|ark\\.?|mississippi|miss\\.?|florida|fla\\.?|georgia|north carolina|texas|u\\.? ?s\\.? ?c\\.? ?t\\.?';
const BRANCH_WORDS = 'infantry|inf\\.?|cavalry|cav\\.?|heavy artillery|light artillery|artillery|art\\.?|sharpshooters|engineers|volunteers|vols\\.?';

const SPAN = new RegExp(
  `(?:(?:co(?:mpany|\\.)?\\s*[a-m])\\s*,?\\s*)?` +
    `(\\d{1,3})(?:st|nd|rd|th|d)?\\s+` +
    `(?:reg(?:iment|t)\\.?\\s+)?` +
    `(?:${STATE_WORDS})\\s+` +
    `(?:vol(?:unteer)?s?\\.?\\s+)?` +
    `(?:${BRANCH_WORDS})(?:\\s+(?:vol(?:unteer)?s?\\.?|${BRANCH_WORDS}))?` +
    `(?:\\s*,?\\s*co(?:mpany|\\.)?\\s*[a-m]\\b)?`,
  'gi',
);

export function findUnitMentions(text: string, parse: (designation: string) => ParsedUnit | null): UnitMention[] {
  // One hint per regiment: a later mention that adds the company fills it in.
  const out: UnitMention[] = [];
  const byKey = new Map<string, UnitMention>();
  for (const match of text.replace(/\s+/g, ' ').matchAll(SPAN)) {
    const span = match[0].trim();
    const unit = parse(span);
    if (!unit) continue;
    const existing = byKey.get(unit.unitKey);
    if (existing) {
      if (!existing.unit.company && unit.company) {
        existing.unit = { ...existing.unit, company: unit.company };
        existing.span = span;
      }
      continue;
    }
    const mention = { span, unit };
    byKey.set(unit.unitKey, mention);
    out.push(mention);
  }
  return out;
}

/** State abbreviation → the name Dyer's unit names use. */
export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  IA: 'Iowa', IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', MA: 'Massachusetts', MD: 'Maryland',
  ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri', MS: 'Mississippi', NC: 'North Carolina', NE: 'Nebraska', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada', NY: 'New York', OH: 'Ohio', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  TN: 'Tennessee', TX: 'Texas', VA: 'Virginia', VT: 'Vermont', WI: 'Wisconsin', WV: 'West Virginia',
};

/**
 * Where he lived in the war years, from the tree's own places: the state
 * named most often across dated events 1855–1870. Regiments were raised
 * by state, so this is the honest first shelf of the picker — "raised in
 * Maine, where he lived" — never a claim about which one was his.
 */
export function warStateFromPlaces(events: readonly { year: number | null; placeParts: readonly string[] | null }[]): string | null {
  const names = new Set(Object.values(STATE_NAMES).map((n) => n.toLowerCase()));
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.year === null || event.year < 1855 || event.year > 1870) continue;
    for (const part of event.placeParts ?? []) {
      const p = part.trim().toLowerCase();
      if (names.has(p)) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [state, n] of counts) {
    if (n > bestCount) {
      best = state;
      bestCount = n;
    }
  }
  return best ? Object.values(STATE_NAMES).find((n) => n.toLowerCase() === best) ?? null : null;
}
