import type { GedcomNode } from '../types/raw.js';
import type { ChildParentage, GedcomEvent, Individual, IndividualName } from '../types/witness.js';
import { flagLiving } from '../analyze/living.js';
import { normalizeDate } from '../normalize/date.js';
import type { PlaceRegistry } from '../normalize/places.js';
import { child, children, value } from './query.js';
import { resolveMediaRef, resolveNote, type SharedRecords } from './records.js';
import { collectCitations } from './sources.js';
import { stripXref } from './xref.js';

function parseEvent(
  node: GedcomNode | undefined,
  places: PlaceRegistry,
  shared: SharedRecords,
  tag?: string,
): GedcomEvent | undefined {
  if (!node) return undefined;
  /* THE WORDS ON A CENSUS ROW (19 September 2026, for Family Street View's
     rooms). An export writes a census onto each person as a residence: a
     date, a place, a NOTE in the form "Occupation: Boot Bottomer; Relation
     to Head: Wife", and a source whose title names the census. The note and
     the titles were dropped here, so a room could not tell a census from a
     residence, nor who was head, nor what anybody did. They ride in
     `detail`, the note first, then one "Source: <title>" line per source,
     for RESI and CENS only; every other event's detail is what it was. */
  let detail: string | undefined;
  if (tag === 'RESI' || tag === 'CENS') {
    const notes = children(node, 'NOTE').map((n) => resolveNote(n, shared)).filter((t): t is string => !!t);
    const titles = children(node, 'SOUR').map((sn) => shared.sources.get(stripXref(sn.value.trim()))).filter((t): t is string => !!t);
    const lines = notes.concat(titles.map((t) => 'Source: ' + t));
    if (lines.length) detail = lines.join('\n');
  }
  const dateNode = child(node, 'DATE');
  const dateValue = dateNode?.value.trim();
  // GEDCOM 7.0 moves free-text qualifiers out of the date payload into a
  // PHRASE substructure; when present it is the human-readable original.
  const phrase = value(dateNode, 'PHRASE');
  const placeValue = value(node, 'PLAC');
  const date = dateValue ? normalizeDate(dateValue) : phrase ? normalizeDate(phrase) : undefined;
  return {
    date: date && phrase ? { ...date, raw: phrase } : date,
    placeId: places.intern(placeValue),
    ...(detail ? { detail } : {}),
    media: children(node, 'OBJE').map((media) => resolveMediaRef(media, shared)),
  };
}

/**
 * OCCU carries its payload on the tag line ("1 OCCU Farmer"); EVEN names the
 * fact in TYPE and sometimes carries a payload in the line value or a NOTE
 * ("1 EVEN / 2 TYPE Citizenship"). Skipped when nothing survives — an empty
 * event row tells no story.
 */
function parseDetailedEvent(
  node: GedcomNode,
  places: PlaceRegistry,
  shared: SharedRecords,
): GedcomEvent | undefined {
  const base = parseEvent(node, places, shared) ?? {};
  const label = decodeLabel(value(node, 'TYPE'));
  const noteNode = child(node, 'NOTE') ?? child(node, 'SNOTE');
  const detail = node.value.trim() || (noteNode ? resolveNote(noteNode, shared) : undefined);
  if (!base.date && !base.placeId && !label && !detail) return undefined;
  return {
    ...base,
    label,
    detail: detail || undefined,
  };
}

/**
 * Some exports write a custom fact's TYPE URL-encoded — "Death+of+sister+",
 * "Will%2FProbate" (Rich Douglass's PAF file, 2026-09-16). Decode only what
 * looks encoded, and never let a stray "%" fail an import.
 */
function decodeLabel(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!/%[0-9A-Fa-f]{2}|\+/.test(raw)) return raw;
  const spaced = raw.replace(/\+/g, ' ');
  let decoded = spaced;
  try {
    decoded = decodeURIComponent(spaced);
  } catch {
    // A "%" that is not an escape: keep the text as it stands.
  }
  const trimmed = decoded.replace(/\s+/g, ' ').trim();
  return trimmed || undefined;
}

function parseName(nameNode: GedcomNode | undefined): IndividualName {
  if (!nameNode) return { full: 'Unknown' };
  // GEDCOM wraps the surname in slashes, e.g. "Henry Field /Howe/".
  const full = nameNode.value.replace(/\//g, '').replace(/\s+/g, ' ').trim();
  // Ancestry and FTM also spell the parts out as GIVN/SURN subtags; PAF and
  // AncestQuest write only the NAME line. Until 2026-09-17 the parts came
  // from the subtags alone, so a 61,773-person PAF export landed with no
  // given name or surname on anyone — every surname-driven feature
  // (commonest names, the busiest line, orphan suggestions) went quiet.
  // The slashes are the standard; the subtags win only where present.
  const slashed = /^(.*?)\s*\/([^/]*)\/\s*(.*)$/.exec(nameNode.value);
  const clean = (s: string | undefined) => s?.replace(/\s+/g, ' ').trim() || undefined;
  return {
    full: full || 'Unknown',
    given: value(nameNode, 'GIVN') ?? clean(slashed?.[1]),
    surname: value(nameNode, 'SURN') ?? clean(slashed?.[2]),
    prefix: value(nameNode, 'NPFX'),
    // Text after the closing slash is a suffix — "John /Smith/ Jr.".
    suffix: value(nameNode, 'NSFX') ?? clean(slashed?.[3]),
  };
}

/** First _APID anywhere in the record — Ancestry's database::record id. */
/**
 * How this person is linked to each of their parent families, from the
 * standard tags: PEDI under FAMC, and the ADOP event, whose FAMC.ADOP
 * names which parent adopted. Ancestry says the same thing with
 * _FREL/_MREL on the family's CHIL pointer (parser/family.ts); both are
 * read, and the family-side qualifier wins when they disagree, since it
 * is recorded per parent rather than per family.
 */
function parseParentage(node: GedcomNode): ChildParentage[] {
  const byFamily = new Map<string, ChildParentage>();
  for (const famc of children(node, 'FAMC')) {
    const pedigree = value(famc, 'PEDI')?.toLowerCase();
    if (!pedigree) continue;
    byFamily.set(stripXref(famc.value), { familyId: stripXref(famc.value), pedigree });
  }
  for (const adoption of children(node, 'ADOP')) {
    const famc = child(adoption, 'FAMC');
    if (!famc) continue;
    const familyId = stripXref(famc.value);
    const which = value(famc, 'ADOP')?.toUpperCase();
    byFamily.set(familyId, {
      familyId,
      pedigree: 'adopted',
      adoptedBy: which === 'HUSB' ? 'father' : which === 'WIFE' ? 'mother' : 'both',
    });
  }
  return [...byFamily.values()];
}

function findApid(node: GedcomNode): string | undefined {
  if (node.tag === '_APID') return node.value.trim() || undefined;
  for (const c of node.children) {
    const found = findApid(c);
    if (found) return found;
  }
  return undefined;
}

/** Parses one `0 @I...@ INDI` record. Returns null if it has no xref to key it by. */
export function parseIndividual(
  node: GedcomNode,
  places: PlaceRegistry,
  shared: SharedRecords,
): Individual | null {
  if (!node.xref) return null;
  const id = stripXref(node.xref);

  const sexValue = value(node, 'SEX');
  const sex: Individual['sex'] = sexValue === 'M' || sexValue === 'F' ? sexValue : 'U';

  const birth = parseEvent(child(node, 'BIRT'), places, shared);
  const deathNode = child(node, 'DEAT');
  const death = parseEvent(deathNode, places, shared);
  const hasDeathRecord = Boolean(deathNode);

  const parseEvents = (tag: string) =>
    children(node, tag)
      .map((n) => parseEvent(n, places, shared, tag))
      .filter((e): e is GedcomEvent => Boolean(e));

  return {
    id,
    name: parseName(child(node, 'NAME')),
    sex,
    birth,
    death,
    hasDeathRecord,
    burial: parseEvent(child(node, 'BURI'), places, shared),
    residences: parseEvents('RESI'),
    // Previously dropped on the floor (Katie Grafer review 2026-08-15):
    censuses: parseEvents('CENS'),
    baptisms: parseEvents('BAPM'),
    immigrations: parseEvents('IMMI'),
    emigrations: parseEvents('EMIG'),
    naturalizations: parseEvents('NATU'),
    military: parseEvents('_MILT'),
    occupations: children(node, 'OCCU')
      .map((n) => parseDetailedEvent(n, places, shared))
      .filter((e): e is GedcomEvent => Boolean(e)),
    customEvents: children(node, 'EVEN')
      .map((n) => parseDetailedEvent(n, places, shared))
      .filter((e): e is GedcomEvent => Boolean(e)),
    probate: parseEvent(child(node, 'PROB'), places, shared),
    familyAsChild: children(node, 'FAMC').map((n) => stripXref(n.value)),
    parentage: parseParentage(node),
    familyAsSpouse: children(node, 'FAMS').map((n) => stripXref(n.value)),
    living: flagLiving(birth, hasDeathRecord),
    notes: [...children(node, 'NOTE'), ...children(node, 'SNOTE')]
      .map((n) => resolveNote(n, shared))
      .filter((text): text is string => Boolean(text)),
    // FTM stores its primary portrait as a sibling `_PHOTO` pointer rather
    // than an OBJE with `_PRIM Y`.
    media: [
      ...children(node, 'OBJE').map((n) => resolveMediaRef(n, shared)),
      ...children(node, '_PHOTO').map((n) => ({ ...resolveMediaRef(n, shared), primary: true })),
    ],
    // Newer Ancestry exports emit bare UID instead of the older _UID.
    uid: value(node, '_UID') ?? value(node, 'UID'),
    apid: findApid(node),
    familySearchId: value(node, '_FSFTID'),
    citations: collectCitations(node, 'person', shared),
  };
}
