import { describe, expect, it } from 'vitest';
import type { GeographyIndex } from '../../query/geography.js';
import { classifyPlace, regionOf } from '../../query/regions.js';
import { HISTORICAL_EVENTS } from '../events.js';
import { curateShelf, detectBranches, SHELF_MAX, SHELF_MIN } from '../shelf.js';

interface SyntheticPerson {
  id: string;
  birth: number | null;
  death: number | null;
  /** GEDCOM-style parts, smallest first. */
  placeParts?: string[];
}

/** A minimal geography index: one birth event per person at their place. */
function indexOf(people: SyntheticPerson[]): GeographyIndex {
  const places = new Map<string, { id: string; raw: string; parts: string[]; latitude: null; longitude: null; region: string | null; country: string | null }>();
  const individuals = new Map<string, { id: string; full_name: string; surname: string | null; birth_year: number | null; death_year: number | null; living: boolean }>();
  const events: GeographyIndex['events'] = [];

  for (const person of people) {
    individuals.set(person.id, {
      id: person.id,
      full_name: `Person ${person.id}`,
      surname: null,
      birth_year: person.birth,
      death_year: person.death,
      living: false,
    });
    let placeId: string | null = null;
    if (person.placeParts) {
      placeId = person.placeParts.join('|');
      if (!places.has(placeId)) {
        places.set(placeId, {
          id: placeId,
          raw: person.placeParts.join(', '),
          parts: person.placeParts,
          latitude: null,
          longitude: null,
          region: regionOf(person.placeParts),
          country: classifyPlace(person.placeParts).country,
        });
      }
    }
    events.push({ individualId: person.id, eventType: 'birth', year: person.birth, placeId });
  }
  return { places, events, individuals, graveLinks: new Map<string, string>() };
}

const GRAND_PRE = ['Grand-Pré', 'Acadia'];
const BOSTON = ['Boston', 'Massachusetts', 'USA'];

/** Twelve Acadians spanning 1670–1800 — alive for the Dérangement. */
function acadianTree(): GeographyIndex {
  const people: SyntheticPerson[] = [];
  for (let i = 0; i < 12; i++) {
    people.push({ id: `a${i}`, birth: 1670 + i * 6, death: 1745 + i * 5, placeParts: GRAND_PRE });
  }
  return indexOf(people);
}

describe('detectBranches', () => {
  it('detects an Acadian branch from Acadian place concentration', () => {
    expect(detectBranches(acadianTree(), HISTORICAL_EVENTS)).toEqual(new Set(['acadian']));
  });

  it('detects Colonial New England only near the colonial era', () => {
    const colonial = indexOf([
      { id: 'c1', birth: 1650, death: 1700, placeParts: BOSTON },
      { id: 'c2', birth: 1660, death: 1710, placeParts: BOSTON },
    ]);
    expect(detectBranches(colonial, HISTORICAL_EVENTS)).toEqual(new Set(['colonial_new_england']));

    const modern = indexOf([{ id: 'm1', birth: 1950, death: null, placeParts: BOSTON }]);
    expect(detectBranches(modern, HISTORICAL_EVENTS)).toEqual(new Set());
  });

  it('stays quiet below the share threshold', () => {
    const people: SyntheticPerson[] = [{ id: 'a', birth: 1700, death: 1760, placeParts: GRAND_PRE }];
    for (let i = 0; i < 30; i++) {
      people.push({ id: `e${i}`, birth: 1700, death: 1760, placeParts: ['London', 'England'] });
    }
    expect(detectBranches(indexOf(people), HISTORICAL_EVENTS)).toEqual(new Set());
  });
});

describe('curateShelf — the Acadian acceptance case', () => {
  const shelf = curateShelf(HISTORICAL_EVENTS, acadianTree(), 2026);
  const ids = shelf.map((entry) => entry.event.id);

  it('returns 3–5 cards', () => {
    expect(shelf.length).toBeGreaterThanOrEqual(SHELF_MIN);
    expect(shelf.length).toBeLessThanOrEqual(SHELF_MAX);
  });

  it('surfaces the Grand Dérangement first for an Acadian-weighted tree', () => {
    expect(ids[0]).toBe('grand-derangement');
    expect(shelf[0]!.aliveCount).toBeGreaterThan(0);
  });

  it('does not surface geographically irrelevant regional or local events', () => {
    // Plenty of these people were alive for King Philip's War and the
    // Salem trials — but nothing in this tree is New England, so the
    // regional/local gate must hold them back.
    expect(ids).not.toContain('king-philips-war');
    expect(ids).not.toContain('salem-witch-trials');
    expect(ids).not.toContain('california-gold-rush');
  });

  it('never shelves an event with zero results', () => {
    expect(shelf.every((entry) => entry.aliveCount > 0)).toBe(true);
  });
});

describe('curateShelf — anniversaries', () => {
  it('labels a century anniversary and boosts it', () => {
    // In 2055 the Dérangement's 1755 start is 300 years back.
    const shelf = curateShelf(HISTORICAL_EVENTS, acadianTree(), 2055);
    const derangement = shelf.find((entry) => entry.event.id === 'grand-derangement');
    expect(derangement?.anniversaryLabel).toBe('300 years ago');
  });

  it('leaves off-cycle years unlabeled', () => {
    const shelf = curateShelf(HISTORICAL_EVENTS, acadianTree(), 2026);
    const derangement = shelf.find((entry) => entry.event.id === 'grand-derangement');
    expect(derangement?.anniversaryLabel).toBeNull();
  });

  it('labels the 250th of the Declaration in 2026 when it makes the shelf', () => {
    // A big generic tree alive in 1776, no place data: only major events
    // qualify, and 1776 + 250 = 2026 earns the label.
    const people: SyntheticPerson[] = [];
    for (let i = 0; i < 20; i++) people.push({ id: `p${i}`, birth: 1730 + i, death: 1790 + i });
    const shelf = curateShelf(HISTORICAL_EVENTS, indexOf(people), 2026);
    const declaration = shelf.find((entry) => entry.event.id === 'declaration-of-independence');
    expect(declaration).toBeDefined();
    expect(declaration!.anniversaryLabel).toBe('250 years ago');
  });
});

describe('curateShelf — degraded trees', () => {
  it('backfills with the best remaining events when too few pass the relevance gate', () => {
    // Lives confined to 1660–1700 with no usable places: no major event
    // overlaps, so the gate passes nothing — the shelf backfills from
    // what overlaps at all rather than coming back empty.
    const shelf = curateShelf(
      HISTORICAL_EVENTS,
      indexOf([
        { id: 'x1', birth: 1660, death: 1694 },
        { id: 'x2', birth: 1662, death: 1695 },
      ]),
      2026,
    );
    expect(shelf.length).toBeGreaterThan(0);
    expect(shelf.map((e) => e.event.id)).toContain('king-philips-war');
    expect(shelf.every((entry) => entry.aliveCount > 0)).toBe(true);
  });

  it('returns an empty shelf for an empty tree', () => {
    expect(curateShelf(HISTORICAL_EVENTS, indexOf([]), 2026)).toEqual([]);
  });
});
