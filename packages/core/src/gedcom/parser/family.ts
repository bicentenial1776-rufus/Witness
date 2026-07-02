import type { GedcomNode } from '../types/raw.js';
import type { Family } from '../types/witness.js';
import { normalizeDate } from '../normalize/date.js';
import type { PlaceRegistry } from '../normalize/places.js';
import { child, children, value } from './query.js';
import { stripXref } from './xref.js';

/** Parses one `0 @F...@ FAM` record. Returns null if it has no xref to key it by. */
export function parseFamily(node: GedcomNode, places: PlaceRegistry): Family | null {
  if (!node.xref) return null;
  const id = stripXref(node.xref);

  const husband = value(node, 'HUSB');
  const wife = value(node, 'WIFE');
  const marrNode = child(node, 'MARR');
  const dateValue = value(marrNode, 'DATE');
  const placeValue = value(marrNode, 'PLAC');

  return {
    id,
    husbandId: husband ? stripXref(husband) : undefined,
    wifeId: wife ? stripXref(wife) : undefined,
    childIds: children(node, 'CHIL').map((n) => stripXref(n.value)),
    marriage: marrNode
      ? {
          date: dateValue ? normalizeDate(dateValue) : undefined,
          placeId: places.intern(placeValue),
        }
      : undefined,
  };
}
