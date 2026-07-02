import type { GedcomNode } from '../types/raw.js';
import type { GedcomEvent, Individual, IndividualName } from '../types/witness.js';
import { flagLiving } from '../analyze/living.js';
import { normalizeDate } from '../normalize/date.js';
import type { PlaceRegistry } from '../normalize/places.js';
import { child, children, value } from './query.js';
import { stripXref } from './xref.js';

function parseEvent(node: GedcomNode | undefined, places: PlaceRegistry): GedcomEvent | undefined {
  if (!node) return undefined;
  const dateValue = value(node, 'DATE');
  const placeValue = value(node, 'PLAC');
  return {
    date: dateValue ? normalizeDate(dateValue) : undefined,
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

/** Parses one `0 @I...@ INDI` record. Returns null if it has no xref to key it by. */
export function parseIndividual(node: GedcomNode, places: PlaceRegistry): Individual | null {
  if (!node.xref) return null;
  const id = stripXref(node.xref);

  const sexValue = value(node, 'SEX');
  const sex: Individual['sex'] = sexValue === 'M' || sexValue === 'F' ? sexValue : 'U';

  const birth = parseEvent(child(node, 'BIRT'), places);
  const deathNode = child(node, 'DEAT');
  const death = parseEvent(deathNode, places);
  const hasDeathRecord = Boolean(deathNode);

  return {
    id,
    name: parseName(child(node, 'NAME')),
    sex,
    birth,
    death,
    hasDeathRecord,
    burial: parseEvent(child(node, 'BURI'), places),
    residences: children(node, 'RESI')
      .map((n) => parseEvent(n, places))
      .filter((e): e is GedcomEvent => Boolean(e)),
    familyAsChild: children(node, 'FAMC').map((n) => stripXref(n.value)),
    familyAsSpouse: children(node, 'FAMS').map((n) => stripXref(n.value)),
    living: flagLiving(birth, hasDeathRecord),
  };
}
