import { describe, expect, it } from 'vitest';

import {
  indexFromSnapshot,
  portraitFromIndex,
  searchIndex,
  snapshotTreeIndex,
} from '../offline.js';
import { buildIndex } from './buildIndex.js';

/**
 * Two-generation Beaulieu household: Étienne m. Marie 1720, children
 * Pierre (1721), Anne (1723), Jean (undated). Pierre remarries — two
 * family records naming the same spouse fold into one marriage. A stray
 * solo, Silas Crane, anchors the place-match case via a Worcester event.
 */
function fieldIndex() {
  return buildIndex(
    [
      { id: 'etienne', name: 'Étienne Beaulieu', sex: 'M', birth: 1695, death: 1760 },
      { id: 'marie', name: 'Marie Poirier', sex: 'F', birth: 1700, death: 1770 },
      { id: 'pierre', name: 'Pierre Beaulieu', sex: 'M', birth: 1721, death: 1790 },
      { id: 'anne', name: 'Anne Beaulieu', sex: 'F', birth: 1723, death: 1801 },
      { id: 'jean', name: 'Jean Beaulieu', sex: 'M', birth: null, death: null },
      { id: 'sarah', name: 'Sarah Kimball', sex: 'F', birth: 1725, death: 1795 },
      { id: 'child1', name: 'Abel Beaulieu', sex: 'M', birth: 1750, death: 1810 },
      { id: 'child2', name: 'Ruth Beaulieu', sex: 'F', birth: 1748, death: 1820 },
      { id: 'silas', name: 'Silas Crane', sex: 'M', birth: 1730, death: 1799 },
    ],
    [
      { id: 'fam0', husband: 'etienne', wife: 'marie', married: 1720, children: ['pierre', 'anne', 'jean'] },
      // Pierre's marriage recorded twice (merge debris): same spouse, split children.
      { id: 'fam1', husband: 'pierre', wife: 'sarah', married: 1747, children: ['child2'] },
      { id: 'fam2', husband: 'pierre', wife: 'sarah', married: null, children: ['child1'] },
    ],
    [
      { person: 'pierre', type: 'birth', year: 1721, placeParts: ['Trois-Rivières', 'Québec'] },
      { person: 'pierre', type: 'death', year: 1790, placeParts: ['Worcester', 'Massachusetts'] },
      { person: 'silas', type: 'residence', year: 1760, placeParts: ['Worcester', 'Massachusetts'] },
    ],
  );
}

describe('snapshotTreeIndex / indexFromSnapshot', () => {
  it('round-trips the index through JSON intact', () => {
    const index = fieldIndex();
    const snapshot = snapshotTreeIndex(index, 'tree-1', '2026-08-24T00:00:00Z');
    const revived = indexFromSnapshot(JSON.parse(JSON.stringify(snapshot)));

    expect(snapshot.treeId).toBe('tree-1');
    expect(revived.individuals.size).toBe(index.individuals.size);
    expect(revived.individuals.get('pierre')?.full_name).toBe('Pierre Beaulieu');
    expect(revived.families).toEqual(index.families);
    expect(revived.events).toEqual(index.events);
    // Region/country computed at build time survive the trip.
    expect([...revived.places.values()]).toEqual([...index.places.values()]);
  });
});

describe('portraitFromIndex', () => {
  it('assembles vitals, events, parents, sibship, and folded marriages', () => {
    const portrait = portraitFromIndex(fieldIndex(), 'pierre');
    expect(portrait).not.toBeNull();
    expect(portrait!.person.full_name).toBe('Pierre Beaulieu');

    expect(portrait!.events.map((e) => e.event_type)).toEqual(['birth', 'death']);
    expect(portrait!.events[0]!.place?.raw).toBe('Trois-Rivières, Québec');

    expect(portrait!.parents.map((p) => p.id)).toEqual(['etienne', 'marie']);
    // Whole sibship, self included, birth order with the undated last.
    expect(portrait!.siblings.map((p) => p.id)).toEqual(['pierre', 'anne', 'jean']);

    // Two family records, one spouse → one marriage, children merged and
    // birth-sorted, the dated record's year kept.
    expect(portrait!.marriages).toHaveLength(1);
    const marriage = portrait!.marriages[0]!;
    expect(marriage.year).toBe(1747);
    expect(marriage.spouse?.id).toBe('sarah');
    expect(marriage.children.map((c) => c.id)).toEqual(['child2', 'child1']);
  });

  it('returns null for a person the saved copy does not know', () => {
    expect(portraitFromIndex(fieldIndex(), 'stranger')).toBeNull();
  });

  it('handles a solo record: no parents, no siblings beyond self, no marriages', () => {
    const portrait = portraitFromIndex(fieldIndex(), 'silas');
    expect(portrait!.parents).toEqual([]);
    expect(portrait!.siblings).toEqual([]);
    expect(portrait!.marriages).toEqual([]);
  });
});

describe('searchIndex', () => {
  it('matches names case- and diacritic-insensitively, newest birth first', () => {
    const page = searchIndex(fieldIndex(), 'beaulieu', 10, 0);
    expect(page.total).toBe(6);
    // Newest birth year first; undated (Jean) closes the list.
    expect(page.hits.map((h) => h.id)).toEqual(['child1', 'child2', 'anne', 'pierre', 'etienne', 'jean']);
    expect(page.hits.every((h) => h.place === null)).toBe(true);

    // Folded query: 'etienne' finds Étienne.
    expect(searchIndex(fieldIndex(), 'etienne', 10, 0).hits[0]!.id).toBe('etienne');
  });

  it('matches places, tags them, and lets a name match win the dedupe', () => {
    const page = searchIndex(fieldIndex(), 'worcester', 10, 0);
    expect(page.total).toBe(2);
    const byId = new Map(page.hits.map((h) => [h.id, h]));
    // Both matched through the place; both carry the tag.
    expect(byId.get('silas')?.place).toBe('Worcester, Massachusetts');
    expect(byId.get('pierre')?.place).toBe('Worcester, Massachusetts');

    // A name query never tags a place, even when events would also match.
    const named = searchIndex(fieldIndex(), 'pierre', 10, 0);
    expect(named.hits.find((h) => h.id === 'pierre')?.place).toBeNull();
  });

  it('pages with a stable order and an honest total', () => {
    const first = searchIndex(fieldIndex(), 'beaulieu', 2, 0);
    const second = searchIndex(fieldIndex(), 'beaulieu', 2, 2);
    expect(first.total).toBe(6);
    expect(first.hits.map((h) => h.id)).toEqual(['child1', 'child2']);
    expect(second.hits.map((h) => h.id)).toEqual(['anne', 'pierre']);
  });

  it('answers empty for a blank query', () => {
    expect(searchIndex(fieldIndex(), '   ', 10, 0)).toEqual({ hits: [], total: 0 });
  });
});
