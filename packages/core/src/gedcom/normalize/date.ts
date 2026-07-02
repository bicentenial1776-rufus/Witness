import type { DateConfidence, DateQualifier, NormalizedDate } from '../types/witness.js';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Optional day, optional month name, mandatory 3-4 digit year: "12 Apr 2018", "Apr 2018", "2018".
const DATE_PART_RE = /^(?:(\d{1,2})\s+)?(?:([A-Za-z]{3,})\s+)?(\d{3,4})$/;

const BETWEEN_RE = /^BET(?:WEEN)?\.?\s+(.+?)\s+AND\s+(.+)$/i;
const QUALIFIER_RE = /^(ABT|ABOUT|CAL|EST|BEF|BEFORE|AFT|AFTER)\.?\s+(.+)$/i;
const FALLBACK_YEAR_RE = /\b(\d{4})\b/;

interface DatePart {
  year: number;
  month?: number;
  day?: number;
}

function monthFromName(name: string): number | undefined {
  return MONTHS[name.slice(0, 3).toLowerCase()];
}

function parseDatePart(text: string): DatePart | null {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  const match = DATE_PART_RE.exec(trimmed);
  if (!match) return null;
  const [, dayStr, monthStr, yearStr] = match;
  const year = Number(yearStr);
  if (!Number.isInteger(year)) return null;
  const month = monthStr ? monthFromName(monthStr) : undefined;
  const day = month && dayStr ? Number(dayStr) : undefined;
  return { year, month, day };
}

function qualifierWordToQualifier(word: string): DateQualifier {
  switch (word.toUpperCase()) {
    case 'ABT':
    case 'ABOUT':
      return 'about';
    case 'CAL':
      return 'calculated';
    case 'EST':
      return 'estimated';
    case 'BEF':
    case 'BEFORE':
      return 'before';
    case 'AFT':
    case 'AFTER':
      return 'after';
    default:
      return 'about';
  }
}

function confidenceForQualifier(qualifier: DateQualifier): DateConfidence {
  switch (qualifier) {
    case 'exact':
      return 'exact';
    case 'estimated':
      return 'estimated';
    case 'about':
    case 'calculated':
    case 'before':
    case 'after':
    case 'between':
      return 'approximate';
    default:
      return 'unknown';
  }
}

/**
 * Normalizes a raw GEDCOM DATE value into a year + confidence, tolerating the
 * non-standard forms real exports produce (full-word qualifiers like
 * "BEFORE", stray whitespace, junk like "?unknown" or "DECEASED").
 */
export function normalizeDate(raw: string | undefined): NormalizedDate {
  const source = raw ?? '';

  if (!source.trim()) {
    return { raw: source, year: null, qualifier: 'unknown', confidence: 'unknown' };
  }

  const collapsed = source.replace(/\s+/g, ' ').trim();

  const between = BETWEEN_RE.exec(collapsed);
  if (between) {
    const start = parseDatePart(between[1]!);
    const end = parseDatePart(between[2]!);
    if (start && end) {
      return {
        raw: source,
        year: Math.round((start.year + end.year) / 2),
        qualifier: 'between',
        confidence: 'approximate',
        rangeStartYear: start.year,
        rangeEndYear: end.year,
      };
    }
  }

  const qualified = QUALIFIER_RE.exec(collapsed);
  if (qualified) {
    const qualifier = qualifierWordToQualifier(qualified[1]!);
    const parsed = parseDatePart(qualified[2]!);
    if (parsed) {
      return {
        raw: source,
        year: parsed.year,
        month: parsed.month,
        day: parsed.day,
        qualifier,
        confidence: confidenceForQualifier(qualifier),
      };
    }
    return { raw: source, year: null, qualifier, confidence: 'unknown' };
  }

  const plain = parseDatePart(collapsed);
  if (plain) {
    return {
      raw: source,
      year: plain.year,
      month: plain.month,
      day: plain.day,
      qualifier: 'exact',
      confidence: 'exact',
    };
  }

  // Last resort: salvage a plausible 4-digit year out of otherwise junk text.
  const fallback = FALLBACK_YEAR_RE.exec(collapsed);
  if (fallback) {
    return {
      raw: source,
      year: Number(fallback[1]),
      qualifier: 'about',
      confidence: 'approximate',
    };
  }

  return { raw: source, year: null, qualifier: 'unknown', confidence: 'unknown' };
}
