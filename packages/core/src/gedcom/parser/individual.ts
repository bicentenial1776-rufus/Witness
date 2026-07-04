import type { GedcomNode } from '../types/raw.js';
import type { GedcomEvent, Individual, IndividualName } from '../types/witness.js';
import { flagLiving } from '../analyze/living.js';
import { normalizeDate } from '../normalize/date.js';
import type { PlaceRegistry } from '../normalize/places.js';
import { child, children, value } from './query.js';
import { resolveMediaRef, resolveNote, type SharedRecords } from './records.js';
import { stripXref } from './xref.js';

function parseEvent(node: GedcomNode | undefined, places: PlaceRegistry): GedcomEvent | undefined {
  if (!node) return undefined;
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
  };
}

function parseName(nameNode: GedcomNode | undefined): IndividualName {
  if (!nameNode) return { full: 'Unknown' };
  // GEDCOM wraps the surname in slashes, e.g. "Henry Field /Howe/".
  const full = nameNode.value.replace(/\//g, '').replace(/\s+/g, ' ').trim();
  return {
    full: full || 'Unknown',
    given: value(nameNode, 'GIVN'),
    surname: value(nameNode, 'SURN'),
    prefix: value(nameNode, 'NPFX'),
    suffix: value(nameNode, 'NSFX'),
  };
}

/** First _APID anywhere in the record — Ancestry's database::record id. */
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

  const birth = parseEvent(child(node, 'BIRT'), places);
  const deathNode = child(node, 'DEAT');
  const death = parseEvent(deathNode, places);
  const hasDeathRecord = Boolean(deathNode);

  const parseEvents = (tag: string) =>
    children(node, tag)
      .map((n) => parseEvent(n, places))
      .filter((e): e is GedcomEvent => Boolean(e));

  return {
    id,
    name: parseName(child(node, 'NAME')),
    sex,
    birth,
    death,
    hasDeathRecord,
    burial: parseEvent(child(node, 'BURI'), places),
    residences: parseEvents('RESI'),
    military: parseEvents('_MILT'),
    familyAsChild: children(node, 'FAMC').map((n) => stripXref(n.value)),
    familyAsSpouse: children(node, 'FAMS').map((n) => stripXref(n.value)),
    living: flagLiving(birth, hasDeathRecord),
    notes: [...children(node, 'NOTE'), ...children(node, 'SNOTE')]
      .map((n) => resolveNote(n, shared))
      .filter((text): text is string => Boolean(text)),
    media: children(node, 'OBJE').map((n) => resolveMediaRef(n, shared)),
    // Newer Ancestry exports emit bare UID instead of the older _UID.
    uid: value(node, '_UID') ?? value(node, 'UID'),
    apid: findApid(node),
  };
}
