import { buildTreeIndexFromRows, type TreeIndex } from '../treeIndex.js';

/**
 * Terse synthetic-tree builder for the milestone and structure tests.
 * Ids double as names unless overridden; places are declared inline on
 * events as GEDCOM-style parts.
 */

export interface TestPerson {
  id: string;
  name?: string;
  surname?: string | null;
  sex?: 'M' | 'F' | 'U';
  birth?: number | null;
  death?: number | null;
  living?: boolean;
}

export interface TestFamily {
  id?: string;
  husband?: string | null;
  wife?: string | null;
  married?: number | null;
  children?: string[];
}

export interface TestEvent {
  person: string;
  type?: 'birth' | 'death' | 'residence' | 'burial';
  year?: number | null;
  placeParts?: string[];
  confidence?: 'exact' | 'approximate' | 'estimated' | 'unknown';
}

export function buildIndex(
  people: TestPerson[],
  families: TestFamily[] = [],
  events: TestEvent[] = [],
): TreeIndex {
  const placeIds = new Map<string, string>();
  const places: { id: string; raw: string; parts: string[] }[] = [];
  const eventRows = events.map((event) => {
    let placeId: string | null = null;
    if (event.placeParts) {
      const key = event.placeParts.join('|');
      if (!placeIds.has(key)) {
        placeIds.set(key, `pl${placeIds.size}`);
        places.push({ id: placeIds.get(key)!, raw: event.placeParts.join(', '), parts: event.placeParts });
      }
      placeId = placeIds.get(key)!;
    }
    return {
      individual_id: event.person,
      event_type: event.type ?? ('birth' as const),
      date_year: event.year ?? null,
      place_id: placeId,
      date_confidence: event.confidence ?? null,
    };
  });

  return buildTreeIndexFromRows(
    people.map((p) => ({
      id: p.id,
      full_name: p.name ?? p.id,
      given_name: null,
      surname: p.surname !== undefined ? p.surname : (p.name ?? p.id).split(' ').pop()!,
      sex: p.sex ?? 'U',
      birth_year: p.birth ?? null,
      death_year: p.death ?? null,
      living: p.living ?? false,
    })),
    families.map((f, i) => ({
      id: f.id ?? `f${i}`,
      husband_id: f.husband ?? null,
      wife_id: f.wife ?? null,
      marriage_date_year: f.married ?? null,
    })),
    families.flatMap((f, i) =>
      (f.children ?? []).map((childId, order) => ({
        family_id: f.id ?? `f${i}`,
        individual_id: childId,
        birth_order: order,
      })),
    ),
    eventRows,
    places,
  );
}
