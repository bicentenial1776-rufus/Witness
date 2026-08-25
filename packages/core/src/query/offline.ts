import type { TreeEvent, TreeFamily, TreeIndex, TreeIndividual, TreePlace } from './treeIndex.js';

/**
 * Offline field mode (SPEC_offline-field-mode.md): the pure half. The
 * TreeIndex is already a complete snapshot for a graveside look-up; these
 * functions make it storable and answerable with no connection — a
 * serializable snapshot shape, a Portrait assembled from the index alone,
 * and a name search approximating the search_people RPC. Everything here
 * is deterministic over the index; the app owns disk and timeouts.
 */

export interface TreeIndexSnapshot {
  v: 1;
  treeId: string;
  savedAt: string;
  individuals: TreeIndividual[];
  families: TreeFamily[];
  events: TreeEvent[];
  places: TreePlace[];
}

export function snapshotTreeIndex(index: TreeIndex, treeId: string, savedAt: string): TreeIndexSnapshot {
  return {
    v: 1,
    treeId,
    savedAt,
    individuals: [...index.individuals.values()],
    families: index.families,
    events: index.events,
    places: [...index.places.values()],
  };
}

/** Region/country were computed at build time and ride the snapshot — no recompute. */
export function indexFromSnapshot(snapshot: TreeIndexSnapshot): TreeIndex {
  return {
    individuals: new Map(snapshot.individuals.map((i) => [i.id, i])),
    families: snapshot.families,
    events: snapshot.events,
    places: new Map(snapshot.places.map((p) => [p.id, p])),
  };
}

// The Portrait, from the saved copy --------------------------------------

export interface OfflineEvent {
  event_type: TreeEvent['eventType'];
  date_year: number | null;
  place: TreePlace | null;
}

export interface OfflineMarriage {
  year: number | null;
  spouse: TreeIndividual | null;
  children: TreeIndividual[];
}

export interface OfflinePortrait {
  person: TreeIndividual;
  events: OfflineEvent[];
  parents: TreeIndividual[];
  /** The whole sibship in birth order, this person included. */
  siblings: TreeIndividual[];
  marriages: OfflineMarriage[];
}

const byBirthYear = (a: TreeIndividual, b: TreeIndividual) =>
  (a.birth_year ?? Number.MAX_SAFE_INTEGER) - (b.birth_year ?? Number.MAX_SAFE_INTEGER);

/**
 * Identity, vitals, dated events, and the family register — the same
 * shapes the Portrait's live queries assemble, from the index alone.
 * Mirrors the screen's rules: parents are the spouses of the families
 * this person is a child of; siblings are those families' children in
 * recorded birth order; marriages fold duplicate family records naming
 * the same spouse. Returns null when the index doesn't know the person.
 */
export function portraitFromIndex(index: TreeIndex, personId: string): OfflinePortrait | null {
  const person = index.individuals.get(personId);
  if (!person) return null;

  const events: OfflineEvent[] = index.events
    .filter((e) => e.individualId === personId)
    .map((e) => ({
      event_type: e.eventType,
      date_year: e.year,
      place: e.placeId ? (index.places.get(e.placeId) ?? null) : null,
    }))
    .sort(
      (a, b) => (a.date_year ?? Number.MAX_SAFE_INTEGER) - (b.date_year ?? Number.MAX_SAFE_INTEGER),
    );

  const parentFamilies = index.families.filter((f) => f.children.includes(personId));
  const parentIds: string[] = [];
  const siblingIds: string[] = [];
  for (const family of parentFamilies) {
    for (const pid of [family.husband_id, family.wife_id]) {
      if (pid && pid !== personId && !parentIds.includes(pid)) parentIds.push(pid);
    }
    for (const cid of family.children) {
      if (!siblingIds.includes(cid)) siblingIds.push(cid);
    }
  }
  const resolve = (ids: string[]) =>
    ids.map((rid) => index.individuals.get(rid)).filter((p): p is TreeIndividual => Boolean(p));
  const parents = resolve(parentIds);
  const siblings = resolve(siblingIds).sort(byBirthYear);

  const ownFamilies = index.families
    .filter((f) => f.husband_id === personId || f.wife_id === personId)
    .sort((a, b) => (a.marriage_year ?? Number.MAX_SAFE_INTEGER) - (b.marriage_year ?? Number.MAX_SAFE_INTEGER));
  const bySpouse = new Map<string, OfflineMarriage>();
  let anon = 0;
  for (const family of ownFamilies) {
    const spouseId = family.husband_id === personId ? family.wife_id : family.husband_id;
    const spouse = spouseId ? (index.individuals.get(spouseId) ?? null) : null;
    const children = resolve(family.children).sort(byBirthYear);
    if (!spouse && children.length === 0) continue;
    const key = spouse ? spouse.id : `__anon${anon++}`;
    const existing = bySpouse.get(key);
    if (!existing) {
      bySpouse.set(key, { year: family.marriage_year, spouse, children });
    } else {
      if (existing.year == null) existing.year = family.marriage_year;
      const seen = new Set(existing.children.map((c) => c.id));
      existing.children = [...existing.children, ...children.filter((c) => !seen.has(c.id))].sort(byBirthYear);
    }
  }

  return { person, events, parents, siblings, marriages: [...bySpouse.values()] };
}

// Search, from the saved copy --------------------------------------------

export interface OfflineSearchHit {
  id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
  /** Set when the match was a place, not the name — same tag the RPC uses. */
  place: string | null;
}

export interface OfflineSearchPage {
  hits: OfflineSearchHit[];
  total: number;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * The search_people RPC approximated locally: one query over names OR
 * event places, deduped by person (a name match wins over a place match),
 * every match counted, one page returned newest birth year first with
 * undated people last — the same reading order the server hands back.
 */
export function searchIndex(index: TreeIndex, query: string, limit: number, offset: number): OfflineSearchPage {
  const q = fold(query.trim());
  if (!q) return { hits: [], total: 0 };

  const matches = new Map<string, OfflineSearchHit>();
  for (const person of index.individuals.values()) {
    if (fold(person.full_name).includes(q)) {
      matches.set(person.id, {
        id: person.id,
        full_name: person.full_name,
        birth_year: person.birth_year,
        death_year: person.death_year,
        living: person.living,
        place: null,
      });
    }
  }

  const matchingPlaces = new Map<string, string>();
  for (const place of index.places.values()) {
    if (fold(place.raw).includes(q)) matchingPlaces.set(place.id, place.raw);
  }
  if (matchingPlaces.size) {
    for (const event of index.events) {
      if (!event.placeId || matches.has(event.individualId)) continue;
      const raw = matchingPlaces.get(event.placeId);
      if (!raw) continue;
      const person = index.individuals.get(event.individualId);
      if (!person) continue;
      matches.set(person.id, {
        id: person.id,
        full_name: person.full_name,
        birth_year: person.birth_year,
        death_year: person.death_year,
        living: person.living,
        place: raw,
      });
    }
  }

  const ordered = [...matches.values()].sort(
    (a, b) =>
      (b.birth_year ?? Number.MIN_SAFE_INTEGER) - (a.birth_year ?? Number.MIN_SAFE_INTEGER) ||
      a.full_name.localeCompare(b.full_name),
  );
  return { hits: ordered.slice(offset, offset + limit), total: ordered.length };
}
