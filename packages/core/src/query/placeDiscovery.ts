import { migrationPaths, type MigrationMover } from './migrations.js';
import { canonicalState, classifyPlace, isStateLevel } from './regions.js';

/**
 * Section III of the query library — Geographic Place Discovery. Pure
 * aggregations over any tree-shaped source: family origins, ocean
 * crossings, born-vs-died displacement, top-places rollups, region
 * shares, era filters, sequential emigration ("lived in Quebec before
 * New England"), and surname–place dominance. Everything here works from
 * place text classification alone; nothing needs the geocoding pipeline.
 *
 * Like MigrationSource, the source type is structural: the query
 * engine's TreeIndex and the app's cached GeographyIndex both satisfy
 * it, so screens reuse the index they already fetched.
 *
 * The "I'm in this town" lookups and radius search live in geography.ts;
 * frontier-territory and Great Migration questions are compositions of
 * residentsOfRegionsDuring / emigrantsBetween with the region sets below
 * (or caller-supplied ones), not hardcoded queries.
 */

export interface DiscoveryIndividual {
  id: string;
  full_name: string;
  surname: string | null;
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

export interface DiscoveryPlace {
  id: string;
  raw: string;
  parts: readonly string[];
  region: string | null;
  country: string | null;
}

export interface DiscoveryEvent {
  individualId: string;
  eventType: string;
  year: number | null;
  placeId: string | null;
}

export interface PlaceDiscoverySource {
  places: ReadonlyMap<string, DiscoveryPlace>;
  events: readonly DiscoveryEvent[];
  individuals: ReadonlyMap<string, DiscoveryIndividual>;
}

// Region sets ----------------------------------------------------------------

export const NEW_ENGLAND_STATES = [
  'Maine',
  'New Hampshire',
  'Vermont',
  'Massachusetts',
  'Rhode Island',
  'Connecticut',
] as const;

/** The census-South: the states the "did we live in the South?" share uses. */
export const SOUTHERN_STATES = [
  'Delaware',
  'Maryland',
  'District of Columbia',
  'Virginia',
  'West Virginia',
  'North Carolina',
  'South Carolina',
  'Georgia',
  'Florida',
  'Kentucky',
  'Tennessee',
  'Alabama',
  'Mississippi',
  'Arkansas',
  'Louisiana',
  'Oklahoma',
  'Texas',
] as const;

/** The Atlantic-seaboard origins of westward expansion. */
export const EASTERN_SEABOARD_STATES = [
  ...NEW_ENGLAND_STATES,
  'New York',
  'New Jersey',
  'Pennsylvania',
  'Delaware',
  'Maryland',
  'Virginia',
  'North Carolina',
  'South Carolina',
  'Georgia',
] as const;

/** Everything the 1800s called "the West", Northwest Territory onward. */
export const WESTWARD_FRONTIER_STATES = [
  'Ohio',
  'Indiana',
  'Illinois',
  'Michigan',
  'Wisconsin',
  'Minnesota',
  'Iowa',
  'Missouri',
  'Kansas',
  'Nebraska',
  'North Dakota',
  'South Dakota',
  'Montana',
  'Wyoming',
  'Colorado',
  'New Mexico',
  'Arizona',
  'Utah',
  'Nevada',
  'Idaho',
  'Oregon',
  'Washington',
  'California',
  'Texas',
  'Oklahoma',
  'Arkansas',
] as const;

/** Old-World side of the Atlantic, as countries classify from place text. */
const ATLANTIC_OLD_WORLD = new Set([
  'United Kingdom',
  'England',
  'Scotland',
  'Wales',
  'Ireland',
  'Northern Ireland',
  'France',
  'Germany',
  'Prussia',
  'Netherlands',
  'Belgium',
  'Luxembourg',
  'Spain',
  'Portugal',
  'Italy',
  'Switzerland',
  'Austria',
  'Norway',
  'Sweden',
  'Denmark',
  'Finland',
  'Poland',
  'Russia',
  'Ukraine',
  'Hungary',
  'Bohemia',
  'Czechoslovakia',
  'Greece',
  'Isle Of Man',
  'Channel Islands',
  'Jersey',
  'Guernsey',
]);

const AMERICAS = new Set([
  'United States',
  'Canada',
  'Mexico',
  'Bermuda',
  'Barbados',
  'Jamaica',
  'Cuba',
  'West Indies',
  'British America',
  'New France',
]);

const PACIFIC_FAR_SIDE = new Set([
  'China',
  'Japan',
  'Korea',
  'Philippines',
  'India',
  'Australia',
  'New Zealand',
]);

// Shared timeline walk --------------------------------------------------------

const EVENT_ORDER: Record<string, number> = { birth: 0, residence: 1, death: 2, burial: 3 };

interface TimelinePoint {
  year: number;
  eventType: string;
  place: DiscoveryPlace;
}

/** Each individual's dated, located events in life order. */
function datedTimelines(index: PlaceDiscoverySource): Map<string, TimelinePoint[]> {
  const timelines = new Map<string, TimelinePoint[]>();
  for (const event of index.events) {
    if (event.year === null || !event.placeId) continue;
    const place = index.places.get(event.placeId);
    if (!place) continue;
    if (!timelines.has(event.individualId)) timelines.set(event.individualId, []);
    timelines.get(event.individualId)!.push({ year: event.year, eventType: event.eventType, place });
  }
  for (const points of timelines.values()) {
    points.sort(
      (a, b) => a.year - b.year || (EVENT_ORDER[a.eventType] ?? 1) - (EVENT_ORDER[b.eventType] ?? 1),
    );
  }
  return timelines;
}

/** True when the place classifies into any of the named regions or countries. */
function placeInRegions(place: DiscoveryPlace, regions: readonly string[]): boolean {
  return (
    (place.region !== null && regions.includes(place.region)) ||
    (place.country !== null && regions.includes(place.country))
  );
}

// Origins ---------------------------------------------------------------------

export interface RegionOrigin {
  region: string;
  earliestYear: number;
  /** The ancestor whose event first places the family in this region. */
  individual: DiscoveryIndividual;
  placeRaw: string;
  /** Everyone with a located event in the region, all time. */
  individualCount: number;
}

/**
 * Where did the family originate? The earliest dated, located event per
 * region, oldest first — the regions the tree reaches back into.
 */
export function familyOrigins(index: PlaceDiscoverySource, limit = 10): RegionOrigin[] {
  const byRegion = new Map<string, { earliest: TimelinePoint; individualId: string; ids: Set<string> }>();
  for (const [individualId, points] of datedTimelines(index)) {
    for (const point of points) {
      const region = point.place.region;
      if (!region) continue;
      const current = byRegion.get(region);
      if (!current) {
        byRegion.set(region, { earliest: point, individualId, ids: new Set([individualId]) });
        continue;
      }
      current.ids.add(individualId);
      if (point.year < current.earliest.year) {
        current.earliest = point;
        current.individualId = individualId;
      }
    }
  }

  const origins: RegionOrigin[] = [];
  for (const [region, { earliest, individualId, ids }] of byRegion) {
    const individual = index.individuals.get(individualId);
    if (!individual) continue;
    origins.push({
      region,
      earliestYear: earliest.year,
      individual,
      placeRaw: earliest.place.raw,
      individualCount: ids.size,
    });
  }
  origins.sort((a, b) => a.earliestYear - b.earliestYear || a.region.localeCompare(b.region));
  return origins.slice(0, limit);
}

// Sequential emigration ---------------------------------------------------------

export interface Emigrant {
  individual: DiscoveryIndividual;
  from: { placeRaw: string; year: number };
  to: { placeRaw: string; year: number };
}

/**
 * Who lived in the from-regions before turning up in the to-regions?
 * The first located event in either set must be on the from side — a
 * New Englander who visited Quebec and came home is not an emigrant.
 * `from` is the last from-side event before arrival; earliest arrivals first.
 */
export function emigrantsBetween(
  index: PlaceDiscoverySource,
  from: readonly string[],
  to: readonly string[],
): Emigrant[] {
  const emigrants: Emigrant[] = [];
  for (const [individualId, points] of datedTimelines(index)) {
    const individual = index.individuals.get(individualId);
    if (!individual) continue;

    let lastFrom: TimelinePoint | null = null;
    let arrival: TimelinePoint | null = null;
    for (const point of points) {
      const onFromSide = placeInRegions(point.place, from);
      const onToSide = placeInRegions(point.place, to);
      if (!onFromSide && !onToSide) continue;
      if (onToSide) {
        if (lastFrom) {
          arrival = point;
          break;
        }
        // First sighting is already on the to side: not an emigrant.
        break;
      }
      lastFrom = point;
    }
    if (lastFrom && arrival) {
      emigrants.push({
        individual,
        from: { placeRaw: lastFrom.place.raw, year: lastFrom.year },
        to: { placeRaw: arrival.place.raw, year: arrival.year },
      });
    }
  }
  emigrants.sort((a, b) => a.to.year - b.to.year || a.individual.full_name.localeCompare(b.individual.full_name));
  return emigrants;
}

/** Which ancestors were part of westward expansion? Seaboard → frontier, by era. */
export function westwardExpansion(
  index: PlaceDiscoverySource,
  era: { startYear: number; endYear: number } = { startYear: 1783, endYear: 1912 },
): Emigrant[] {
  return emigrantsBetween(index, EASTERN_SEABOARD_STATES, WESTWARD_FRONTIER_STATES).filter(
    (e) => e.to.year >= era.startYear && e.to.year <= era.endYear,
  );
}

// Ocean crossings ----------------------------------------------------------------

export interface OceanCrossing {
  individual: DiscoveryIndividual;
  direction: 'toAmericas' | 'fromAmericas';
  from: { country: string; placeRaw: string; year: number };
  to: { country: string; placeRaw: string; year: number };
}

/**
 * Which ancestors crossed the Atlantic or Pacific? Every change of shore
 * within one documented life is a crossing, so a return voyage counts
 * twice. Earliest crossings first.
 */
export function oceanCrossings(index: PlaceDiscoverySource, ocean: 'atlantic' | 'pacific'): OceanCrossing[] {
  const farShore = ocean === 'atlantic' ? ATLANTIC_OLD_WORLD : PACIFIC_FAR_SIDE;
  const shoreOf = (place: DiscoveryPlace): 'americas' | 'abroad' | null => {
    if (!place.country) return null;
    if (AMERICAS.has(place.country)) return 'americas';
    if (farShore.has(place.country)) return 'abroad';
    return null;
  };

  const crossings: OceanCrossing[] = [];
  for (const [individualId, points] of datedTimelines(index)) {
    const individual = index.individuals.get(individualId);
    if (!individual) continue;

    let last: { point: TimelinePoint; shore: 'americas' | 'abroad' } | null = null;
    for (const point of points) {
      const shore = shoreOf(point.place);
      if (!shore) continue;
      if (last && shore !== last.shore) {
        crossings.push({
          individual,
          direction: shore === 'americas' ? 'toAmericas' : 'fromAmericas',
          from: { country: last.point.place.country!, placeRaw: last.point.place.raw, year: last.point.year },
          to: { country: point.place.country!, placeRaw: point.place.raw, year: point.year },
        });
      }
      last = { point, shore };
    }
  }
  crossings.sort((a, b) => a.to.year - b.to.year || a.individual.full_name.localeCompare(b.individual.full_name));
  return crossings;
}

// Per-person shore changes ---------------------------------------------------------

export interface PersonCrossing {
  ocean: 'atlantic' | 'pacific';
  direction: 'toAmericas' | 'fromAmericas';
  year: number;
}

/**
 * The ocean crossings visible in ONE person's own dated events — the same
 * change-of-shore rule as `oceanCrossings`, but computed from rows a
 * Portrait has already fetched, so no whole-tree index is needed (the full
 * index costs seconds on a large tree; a badge must not). Events without a
 * year or a classifiable country are ignored.
 */
export function personShoreCrossings(
  events: readonly { year: number | null; parts: readonly string[] | null }[],
): PersonCrossing[] {
  type Shore = { side: 'americas' } | { side: 'abroad'; ocean: 'atlantic' | 'pacific' };
  const shoreOf = (parts: readonly string[]): Shore | null => {
    const { country } = classifyPlace(parts);
    if (!country) return null;
    if (AMERICAS.has(country)) return { side: 'americas' };
    if (ATLANTIC_OLD_WORLD.has(country)) return { side: 'abroad', ocean: 'atlantic' };
    if (PACIFIC_FAR_SIDE.has(country)) return { side: 'abroad', ocean: 'pacific' };
    return null;
  };

  const dated = events
    .filter(
      (e): e is { year: number; parts: readonly string[] } => e.year !== null && e.parts !== null,
    )
    .slice()
    .sort((a, b) => a.year - b.year);

  const crossings: PersonCrossing[] = [];
  let last: Shore | null = null;
  for (const event of dated) {
    const shore = shoreOf(event.parts);
    if (!shore) continue;
    if (last && shore.side !== last.side) {
      const abroad = shore.side === 'abroad' ? shore : (last as Extract<Shore, { side: 'abroad' }>);
      crossings.push({
        ocean: abroad.ocean,
        direction: shore.side === 'americas' ? 'toAmericas' : 'fromAmericas',
        year: event.year,
      });
    }
    last = shore;
  }
  return crossings;
}

// Born vs died --------------------------------------------------------------------

export interface BornDiedApart {
  individual: DiscoveryIndividual;
  bornIn: string;
  diedIn: string;
  birthPlaceRaw: string;
  deathPlaceRaw: string;
}

/**
 * Who died in a different country (or state) than they were born in?
 * Compares the located birth and death events; at state level both ends
 * must classify to a state or province, so "Maine" vs bare "United
 * States" never reads as displacement.
 */
export function bornAndDiedApart(index: PlaceDiscoverySource, level: 'country' | 'state'): BornDiedApart[] {
  const birthPlace = new Map<string, DiscoveryPlace>();
  const deathPlace = new Map<string, DiscoveryPlace>();
  for (const event of index.events) {
    if (!event.placeId) continue;
    const place = index.places.get(event.placeId);
    if (!place) continue;
    if (event.eventType === 'birth' && !birthPlace.has(event.individualId)) {
      birthPlace.set(event.individualId, place);
    }
    if (event.eventType === 'death' && !deathPlace.has(event.individualId)) {
      deathPlace.set(event.individualId, place);
    }
  }

  const labelOf = (place: DiscoveryPlace): string | null => {
    if (level === 'country') return place.country;
    return place.region !== null && isStateLevel(place.region) ? place.region : null;
  };

  const apart: BornDiedApart[] = [];
  for (const [individualId, birth] of birthPlace) {
    const death = deathPlace.get(individualId);
    if (!death) continue;
    const bornIn = labelOf(birth);
    const diedIn = labelOf(death);
    if (!bornIn || !diedIn || bornIn === diedIn) continue;
    const individual = index.individuals.get(individualId);
    if (!individual) continue;
    apart.push({ individual, bornIn, diedIn, birthPlaceRaw: birth.raw, deathPlaceRaw: death.raw });
  }
  apart.sort(
    (a, b) =>
      (a.individual.birth_year ?? Number.MAX_SAFE_INTEGER) - (b.individual.birth_year ?? Number.MAX_SAFE_INTEGER) ||
      a.individual.full_name.localeCompare(b.individual.full_name),
  );
  return apart;
}

// Top places ------------------------------------------------------------------------

export type PlaceLevel = 'town' | 'county' | 'state' | 'country';

export interface PlaceCount {
  /** Display name — "Petersham, Massachusetts", "Middlesex, Massachusetts", "Quebec", … */
  name: string;
  individualCount: number;
  eventCount: number;
}

/** Trailing parts that read like regions, not towns, when they lead a place. */
const NON_TOWN_LEADS = new Set([
  'england',
  'scotland',
  'wales',
  'ireland',
  'northern ireland',
  'acadia',
  'new england',
]);

function normalizeLead(part: string): string {
  return part.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

/**
 * The label a place contributes at the requested level, or null when the
 * place doesn't resolve to that level. Towns and counties qualify with
 * their region so Cambridge, Massachusetts never merges with Cambridge,
 * England; counties are only read when a town–county–state chain is
 * unambiguous.
 */
export function placeLabelAt(place: DiscoveryPlace, level: PlaceLevel): string | null {
  const { parts, region, country } = place;
  switch (level) {
    case 'country':
      return country;
    case 'state':
      return region !== null && isStateLevel(region) ? region : null;
    case 'county': {
      // County sits immediately before the state part; require a town
      // ahead of it so a bare "Middlesex, Massachusetts" stays ambiguous.
      for (let i = parts.length - 1; i >= 2; i--) {
        const state = canonicalState(parts[i]!);
        if (state) return `${parts[i - 1]!}, ${state}`;
      }
      return null;
    }
    case 'town': {
      if (parts.length < 2) return null;
      const lead = parts[0]!;
      if (canonicalState(lead) || NON_TOWN_LEADS.has(normalizeLead(lead))) return null;
      return region ? `${lead}, ${region}` : country ? `${lead}, ${country}` : null;
    }
  }
}

/** Top towns/counties/states/countries by how many ancestors had an event there. */
export function topPlaces(index: PlaceDiscoverySource, level: PlaceLevel, limit = 10): PlaceCount[] {
  const individuals = new Map<string, Set<string>>();
  const events = new Map<string, number>();
  for (const event of index.events) {
    if (!event.placeId) continue;
    const place = index.places.get(event.placeId);
    if (!place) continue;
    const name = placeLabelAt(place, level);
    if (!name) continue;
    if (!individuals.has(name)) individuals.set(name, new Set());
    individuals.get(name)!.add(event.individualId);
    events.set(name, (events.get(name) ?? 0) + 1);
  }
  return [...individuals.entries()]
    .map(([name, ids]) => ({ name, individualCount: ids.size, eventCount: events.get(name) ?? 0 }))
    .sort((a, b) => b.individualCount - a.individualCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// Region share -----------------------------------------------------------------------

export interface RegionShare {
  /** Ancestors with a located event in the region set. */
  individualCount: number;
  /** Ancestors with at least one located event anywhere — the denominator. */
  locatedCount: number;
  /** individualCount / locatedCount, 0 when the tree has no located events. */
  share: number;
}

/**
 * What share of the family lived in these regions? Measured against
 * ancestors who have any located event at all, so missing place data
 * doesn't dilute the answer.
 */
export function regionShare(index: PlaceDiscoverySource, regions: readonly string[]): RegionShare {
  const located = new Set<string>();
  const matched = new Set<string>();
  for (const event of index.events) {
    if (!event.placeId) continue;
    const place = index.places.get(event.placeId);
    if (!place) continue;
    located.add(event.individualId);
    if (placeInRegions(place, regions)) matched.add(event.individualId);
  }
  return {
    individualCount: matched.size,
    locatedCount: located.size,
    share: located.size ? matched.size / located.size : 0,
  };
}

// Place persistence --------------------------------------------------------------------

export interface SingletonPlace {
  place: DiscoveryPlace;
  individual: DiscoveryIndividual;
  eventType: string;
  year: number | null;
}

/** Places that appear exactly once in the whole tree — the one-off outposts. */
export function singletonPlaces(index: PlaceDiscoverySource): SingletonPlace[] {
  const byPlace = new Map<string, DiscoveryEvent[]>();
  for (const event of index.events) {
    if (!event.placeId) continue;
    if (!byPlace.has(event.placeId)) byPlace.set(event.placeId, []);
    byPlace.get(event.placeId)!.push(event);
  }
  const singletons: SingletonPlace[] = [];
  for (const [placeId, events] of byPlace) {
    if (events.length !== 1) continue;
    const place = index.places.get(placeId);
    const individual = index.individuals.get(events[0]!.individualId);
    if (!place || !individual) continue;
    singletons.push({ place, individual, eventType: events[0]!.eventType, year: events[0]!.year });
  }
  singletons.sort((a, b) => a.place.raw.localeCompare(b.place.raw));
  return singletons;
}

export interface CenturyResidents {
  century: number;
  individualCount: number;
}

export interface PlacePersistence {
  place: DiscoveryPlace;
  centuries: CenturyResidents[];
  /** Distinct centuries with a dated event at this place. */
  centuryCount: number;
}

/**
 * Which places held the family across multiple centuries? The
 * generational-anchor towns, deepest roots first.
 */
export function placesAcrossCenturies(index: PlaceDiscoverySource, minCenturies = 2): PlacePersistence[] {
  const byPlace = new Map<string, Map<number, Set<string>>>();
  for (const event of index.events) {
    if (!event.placeId || event.year === null) continue;
    const century = Math.floor(event.year / 100) * 100;
    if (!byPlace.has(event.placeId)) byPlace.set(event.placeId, new Map());
    const centuries = byPlace.get(event.placeId)!;
    if (!centuries.has(century)) centuries.set(century, new Set());
    centuries.get(century)!.add(event.individualId);
  }

  const persistent: PlacePersistence[] = [];
  for (const [placeId, centuries] of byPlace) {
    if (centuries.size < minCenturies) continue;
    const place = index.places.get(placeId);
    if (!place) continue;
    persistent.push({
      place,
      centuries: [...centuries.entries()]
        .map(([century, ids]) => ({ century, individualCount: ids.size }))
        .sort((a, b) => a.century - b.century),
      centuryCount: centuries.size,
    });
  }
  persistent.sort((a, b) => b.centuryCount - a.centuryCount || a.place.raw.localeCompare(b.place.raw));
  return persistent;
}

// Era-filtered residents -----------------------------------------------------------------

export interface EraResident {
  individual: DiscoveryIndividual;
  events: { eventType: string; year: number; placeRaw: string }[];
}

/**
 * Who lived in these regions during an era? "Massachusetts before 1700",
 * "Ireland during the Great Famine", frontier territories in the 1800s —
 * all one shape. Undated events can't witness an era and are ignored.
 * Earliest-connected first.
 */
export function residentsOfRegionsDuring(
  index: PlaceDiscoverySource,
  regions: readonly string[],
  era?: { startYear?: number; endYear?: number },
): EraResident[] {
  const byIndividual = new Map<string, EraResident['events']>();
  for (const event of index.events) {
    if (!event.placeId || event.year === null) continue;
    if (era?.startYear !== undefined && event.year < era.startYear) continue;
    if (era?.endYear !== undefined && event.year > era.endYear) continue;
    const place = index.places.get(event.placeId);
    if (!place || !placeInRegions(place, regions)) continue;
    if (!byIndividual.has(event.individualId)) byIndividual.set(event.individualId, []);
    byIndividual.get(event.individualId)!.push({ eventType: event.eventType, year: event.year, placeRaw: place.raw });
  }

  const residents: EraResident[] = [];
  for (const [individualId, events] of byIndividual) {
    const individual = index.individuals.get(individualId);
    if (!individual) continue;
    events.sort((a, b) => a.year - b.year);
    residents.push({ individual, events });
  }
  residents.sort(
    (a, b) => a.events[0]!.year - b.events[0]!.year || a.individual.full_name.localeCompare(b.individual.full_name),
  );
  return residents;
}

// Migration clusters ------------------------------------------------------------------------

export interface MigrationCluster {
  from: string;
  to: string;
  /** Decade of arrival, e.g. 1840 for the 1840s. */
  decade: number;
  movers: MigrationMover[];
}

/**
 * Did branches of the family move in clusters? Groups of ancestors who
 * made the same regional move and arrived in the same decade — chain
 * migration made visible. Largest clusters first.
 */
export function migrationClusters(index: PlaceDiscoverySource, minSize = 2): MigrationCluster[] {
  const clusters: MigrationCluster[] = [];
  for (const path of migrationPaths(index)) {
    const byDecade = new Map<number, MigrationMover[]>();
    for (const mover of path.movers) {
      if (mover.toYear === null) continue;
      const decade = Math.floor(mover.toYear / 10) * 10;
      if (!byDecade.has(decade)) byDecade.set(decade, []);
      byDecade.get(decade)!.push(mover);
    }
    for (const [decade, movers] of byDecade) {
      if (movers.length < minSize) continue;
      clusters.push({ from: path.from, to: path.to, decade, movers });
    }
  }
  clusters.sort((a, b) => b.movers.length - a.movers.length || a.decade - b.decade || a.from.localeCompare(b.from));
  return clusters;
}

// Surname geography ---------------------------------------------------------------------------

export interface SurnameDominance {
  /** Town-level place name, qualified by region. */
  name: string;
  surname: string;
  /** Distinct individuals of the dominant surname with an event there. */
  surnameCount: number;
  /** Distinct individuals of any surname with an event there. */
  totalCount: number;
  share: number;
}

/**
 * Which surnames dominated particular towns? Towns where one surname is
 * the plurality of everyone recorded there, strongest holds first.
 */
export function surnamesDominatingPlaces(index: PlaceDiscoverySource, minIndividuals = 5): SurnameDominance[] {
  const byTown = new Map<string, Map<string, Set<string>>>();
  const totals = new Map<string, Set<string>>();
  for (const event of index.events) {
    if (!event.placeId) continue;
    const place = index.places.get(event.placeId);
    if (!place) continue;
    const name = placeLabelAt(place, 'town');
    if (!name) continue;
    const individual = index.individuals.get(event.individualId);
    if (!individual) continue;
    if (!totals.has(name)) totals.set(name, new Set());
    totals.get(name)!.add(individual.id);
    if (!individual.surname) continue;
    if (!byTown.has(name)) byTown.set(name, new Map());
    const surnames = byTown.get(name)!;
    if (!surnames.has(individual.surname)) surnames.set(individual.surname, new Set());
    surnames.get(individual.surname)!.add(individual.id);
  }

  const dominance: SurnameDominance[] = [];
  for (const [name, surnames] of byTown) {
    const totalCount = totals.get(name)!.size;
    if (totalCount < minIndividuals) continue;
    let top: { surname: string; count: number } | null = null;
    for (const [surname, ids] of surnames) {
      if (!top || ids.size > top.count || (ids.size === top.count && surname < top.surname)) {
        top = { surname, count: ids.size };
      }
    }
    if (!top) continue;
    dominance.push({
      name,
      surname: top.surname,
      surnameCount: top.count,
      totalCount,
      share: top.count / totalCount,
    });
  }
  dominance.sort((a, b) => b.share - a.share || b.surnameCount - a.surnameCount || a.name.localeCompare(b.name));
  return dominance;
}

export interface SurnamePlace {
  name: string;
  individualCount: number;
}

/** Where did a surname line live? Its towns, most-populated first. */
export function surnameHeartland(index: PlaceDiscoverySource, surname: string, limit = 10): SurnamePlace[] {
  const wanted = surname.toLowerCase();
  const byTown = new Map<string, Set<string>>();
  for (const event of index.events) {
    if (!event.placeId) continue;
    const individual = index.individuals.get(event.individualId);
    if (!individual?.surname || individual.surname.toLowerCase() !== wanted) continue;
    const place = index.places.get(event.placeId);
    if (!place) continue;
    const name = placeLabelAt(place, 'town');
    if (!name) continue;
    if (!byTown.has(name)) byTown.set(name, new Set());
    byTown.get(name)!.add(individual.id);
  }
  return [...byTown.entries()]
    .map(([name, ids]) => ({ name, individualCount: ids.size }))
    .sort((a, b) => b.individualCount - a.individualCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}
