/**
 * Obituaries from Chronicling America — the pure half of the
 * obituary-leads worker (supabase/functions/obituary-leads; mirrored to
 * _shared/records for Deno).
 *
 * A death or funeral notice is the one public-domain record that names
 * a person's relatives outright — "survived by his wife Mary and sons
 * John and Henry" — and Chronicling America exposes every page's OCR.
 * The worker searches a person's name in their state around their death
 * year; this module finds the passage worth reading, decides whether a
 * page is worth the model's attention at all, and, once the model has
 * extracted what the notice says, holds the extraction up against the
 * tree so each named relative becomes a plain-words reason — a lead
 * for Tree Health, never a link.
 */

import { splitName } from '../history/passengers.js';

/** Words that mark a death or funeral notice, case-blind. */
const CUES =
  /\b(died|death|dies|funeral|obituar|passed away|survived by|interment|burial|buried|late residence|mourn|widow of|deceased|remains)\b/i;

export interface ObituaryWindow {
  /** The passage handed to the model, trimmed to size. */
  excerpt: string;
  /** How many obituary cues sit inside the window. */
  cueCount: number;
  /** The name form that was found ("Ezekiel Howe", "E. Howe", "Howe"). */
  nameForm: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The best passage on the page for this person: the surname occurrence
 * nearest an obituary cue, with the given name (or its initial) close by
 * when the page has it. Null when the surname is not on the page at
 * all, or no occurrence sits within reach of a cue — a page that merely
 * contains the surname is an advertisement, not a notice.
 */
export function findObituaryWindow(
  fullText: string,
  fullName: string,
  radius = 1400,
): ObituaryWindow | null {
  const text = fullText.replace(/\r/g, '');
  const { givenNames, surname } = splitName(fullName);
  if (!surname || surname.length < 3) return null;
  const given = givenNames.split(/\s+/)[0] ?? '';
  const surnameRe = new RegExp(`\\b${escapeRe(surname)}\\b`, 'gi');

  let best: { index: number; score: number; nameForm: string } | null = null;
  for (const m of text.matchAll(surnameRe)) {
    const at = m.index ?? 0;
    const local = text.slice(Math.max(0, at - 220), at + 220);
    const cues = local.match(new RegExp(CUES.source, 'gi'))?.length ?? 0;
    if (cues === 0) continue;
    let nameForm = surname;
    let score = cues;
    if (given) {
      const near = text.slice(Math.max(0, at - 60), at + surname.length + 60);
      if (new RegExp(`\\b${escapeRe(given)}\\b`, 'i').test(near)) {
        score += 4;
        nameForm = `${given} ${surname}`;
      } else if (new RegExp(`\\b${escapeRe(given.charAt(0))}\\.?\\s`, 'i').test(near)) {
        score += 1;
        nameForm = `${given.charAt(0)}. ${surname}`;
      }
    }
    if (!best || score > best.score) best = { index: at, score, nameForm };
  }
  if (!best) return null;

  const start = Math.max(0, best.index - Math.floor(radius / 2));
  const end = Math.min(text.length, best.index + Math.ceil(radius / 2));
  const excerpt = text.slice(start, end).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const cueCount = excerpt.match(new RegExp(CUES.source, 'gi'))?.length ?? 0;
  return { excerpt, cueCount, nameForm: best.nameForm };
}

/** What the model returns for one passage (obituary-leads' JSON schema). */
export interface ObituaryExtraction {
  about_person: boolean;
  kind: 'obituary' | 'death notice' | 'funeral notice' | 'marriage notice' | 'other';
  confidence: 'strong' | 'probable' | 'weak';
  deceased_name: string | null;
  death_date: string | null;
  age_at_death: string | null;
  residence: string | null;
  birthplace: string | null;
  occupation: string | null;
  spouse: string | null;
  parents: string[];
  children: string[];
  siblings: string[];
  others: string[];
  burial_place: string | null;
  quote: string | null;
}

/** The relatives the tree already records for the person, by kind. */
export interface TreeRelatives {
  spouses: readonly string[];
  children: readonly string[];
  parents: readonly string[];
  siblings: readonly string[];
}

function firstToken(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
}

function knownBy(given: string, names: readonly string[]): string | null {
  const g = firstToken(given);
  if (!g) return null;
  return names.find((n) => firstToken(n) === g) ?? null;
}

export interface RelativeReasons {
  reasons: string[];
  /** Relatives the notice names that the tree does not hold — the leads. */
  leads: string[];
  /** Relatives the notice names that the tree holds — corroboration. */
  agreements: number;
}

/**
 * Each relative the notice names, held up against the tree: a match is
 * corroboration ("names a son Henry — Henry Howe in your tree"), a miss
 * is a lead ("names a daughter Sarah not among his children in your
 * tree"). Plain words, one per relative, capped so a long notice does
 * not drown the card.
 */
export function relativesAgainstTree(
  extracted: ObituaryExtraction,
  tree: TreeRelatives,
  cap = 8,
): RelativeReasons {
  const reasons: string[] = [];
  const leads: string[] = [];
  let agreements = 0;
  const consider = (label: string, names: readonly string[], held: readonly string[], plural: string) => {
    for (const name of names) {
      if (!name?.trim()) continue;
      const match = knownBy(name, held);
      if (match) {
        agreements++;
        reasons.push(`names ${label} ${name.trim()} — ${match} in your tree`);
      } else {
        leads.push(name.trim());
        reasons.push(`names ${label} ${name.trim()}, not among the ${plural} in your tree — a lead`);
      }
    }
  };
  if (extracted.spouse) consider('a spouse', [extracted.spouse], tree.spouses, 'spouses');
  consider('a parent', extracted.parents ?? [], tree.parents, 'parents');
  consider('a child', extracted.children ?? [], tree.children, 'children');
  consider('a sibling', extracted.siblings ?? [], tree.siblings, 'brothers and sisters');
  return { reasons: reasons.slice(0, cap), leads, agreements };
}

export interface ObituaryHit {
  paperTitle: string;
  date: string;
  pageUrl: string;
  imageUrl: string | null;
}

export type ObituaryConfidence = 'strong' | 'probable';

export interface ObituaryCandidate {
  confidence: ObituaryConfidence;
  reasons: string[];
  recordName: string;
  recordSummary: string;
  sourceCitation: string;
  findingAidUrl: string;
  savedPayload: Record<string, unknown>;
}

/** "worcester daily spy (worcester [mass.]) 1850-1888" → "Worcester Daily Spy (Worcester, Mass.)" */
export function paperName(raw: string): string {
  return raw
    .replace(/\s*\d{4}-\d{4}\s*$/, '')
    .replace(/\s*\[([^\]]*)\]/g, ', $1')
    .replace(/\(\s*,\s*/g, '(')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * The card, from the model's reading plus the tree comparison. Null when
 * the model says the passage is not about the person, or is too unsure
 * — silence over guessing. Strong needs the model's own strong reading
 * of a death/funeral notice AND the death year on the page agreeing
 * with the tree, or a relative the tree already knows corroborating it.
 */
export function renderObituaryCandidate(
  person: { fullName: string; deathYear: number | null },
  hit: ObituaryHit,
  window: ObituaryWindow,
  extracted: ObituaryExtraction,
  tree: TreeRelatives,
): ObituaryCandidate | null {
  if (!extracted.about_person || extracted.confidence === 'weak') return null;
  const notice = extracted.kind === 'obituary' || extracted.kind === 'death notice' || extracted.kind === 'funeral notice';
  const relatives = relativesAgainstTree(extracted, tree);
  const reasons: string[] = [];

  const pageYear = Number(hit.date.slice(0, 4));
  const yearAgrees = person.deathYear !== null && Number.isFinite(pageYear) && Math.abs(pageYear - person.deathYear) <= 1;
  reasons.push(
    yearAgrees
      ? `printed ${hit.date.slice(0, 4)}, the year your tree records the death`
      : `printed ${hit.date.slice(0, 4)}`,
  );
  const article = /^[aeiou]/i.test(extracted.kind) ? 'an' : 'a';
  reasons.push(`the page reads “${window.nameForm}” beside the words of ${article} ${extracted.kind}`);
  reasons.push(...relatives.reasons);

  const strong = notice && extracted.confidence === 'strong' && (yearAgrees || relatives.agreements > 0);
  const confidence: ObituaryConfidence = strong ? 'strong' : 'probable';

  const paper = paperName(hit.paperTitle);
  const recordName = `${paper}, ${hit.date}`;
  const kindLabel = extracted.kind === 'other' ? 'A notice' : extracted.kind.replace(/^\w/, (c) => c.toUpperCase());
  const quote = extracted.quote?.trim() ? `“${extracted.quote.trim().slice(0, 300)}”` : null;
  const named = [
    extracted.spouse ? `spouse ${extracted.spouse}` : null,
    extracted.children?.length ? `children ${extracted.children.join(', ')}` : null,
    extracted.parents?.length ? `parents ${extracted.parents.join(', ')}` : null,
    extracted.siblings?.length ? `siblings ${extracted.siblings.join(', ')}` : null,
  ].filter(Boolean);
  const recordSummary = [kindLabel + (extracted.death_date ? `, ${extracted.death_date}` : ''), quote, named.length ? `Names ${named.join('; ')}.` : null]
    .filter(Boolean)
    .join(' ');

  return {
    confidence,
    reasons,
    recordName,
    recordSummary,
    sourceCitation: `${paper}, ${hit.date}, page ${/sp=(\d+)/.exec(hit.pageUrl)?.[1] ?? '?'} — Chronicling America, Library of Congress`,
    findingAidUrl: hit.pageUrl,
    savedPayload: {
      paper,
      date: hit.date,
      page_url: hit.pageUrl,
      image_url: hit.imageUrl,
      kind: extracted.kind,
      excerpt: window.excerpt.slice(0, 2400),
      extracted,
      leads: relatives.leads,
      event_year: person.deathYear,
    },
  };
}
