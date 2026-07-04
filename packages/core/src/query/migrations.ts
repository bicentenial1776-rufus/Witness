import type { GeographyIndex } from './geography.js';

/**
 * Migration-path detection: orders each ancestor's dated life events,
 * maps them to regions, and treats every change of region within one
 * life as a migration. Aggregating those transitions across the tree
 * surfaces the family's dominant movements ("Massachusetts → Maine,
 * 41 people, around 1790").
 */

export interface MigrationExample {
  name: string;
  fromYear: number | null;
  toYear: number | null;
}

export interface MigrationPath {
  from: string;
  to: string;
  count: number;
  /** Median year of arrival across everyone who made this move. */
  medianYear: number | null;
  examples: MigrationExample[];
}

const EVENT_ORDER: Record<string, number> = { birth: 0, residence: 1, death: 2, burial: 3 };
const MAX_EXAMPLES = 3;

export function migrationPaths(index: GeographyIndex): MigrationPath[] {
  interface Move {
    year: number | null;
    fromYear: number | null;
    name: string;
  }
  const moves = new Map<string, Move[]>();

  const eventsByIndividual = new Map<string, { region: string; year: number | null; order: number }[]>();
  for (const event of index.events) {
    if (!event.placeId) continue;
    const region = index.places.get(event.placeId)?.region;
    if (!region) continue;
    if (!eventsByIndividual.has(event.individualId)) eventsByIndividual.set(event.individualId, []);
    eventsByIndividual.get(event.individualId)!.push({
      region,
      year: event.year,
      order: EVENT_ORDER[event.eventType] ?? 1,
    });
  }

  for (const [individualId, events] of eventsByIndividual) {
    const individual = index.individuals.get(individualId);
    if (!individual) continue;

    // Only dated events can be sequenced; birth/death sort by type when
    // years tie so "born and died in 1700" still reads in life order.
    const dated = events
      .filter((e) => e.year !== null)
      .sort((a, b) => a.year! - b.year! || a.order - b.order);

    for (let i = 1; i < dated.length; i++) {
      const prev = dated[i - 1]!;
      const next = dated[i]!;
      if (prev.region === next.region) continue;
      const key = `${prev.region}→${next.region}`;
      if (!moves.has(key)) moves.set(key, []);
      moves.get(key)!.push({ year: next.year, fromYear: prev.year, name: individual.full_name });
    }
  }

  const paths: MigrationPath[] = [];
  for (const [key, list] of moves) {
    const [from = '', to = ''] = key.split('→');
    const years = list.map((m) => m.year).filter((y): y is number => y !== null).sort((a, b) => a - b);
    paths.push({
      from,
      to,
      count: list.length,
      medianYear: years[Math.floor(years.length / 2)] ?? null,
      examples: list.slice(0, MAX_EXAMPLES).map((m) => ({
        name: m.name,
        fromYear: m.fromYear,
        toYear: m.year,
      })),
    });
  }

  paths.sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
  return paths;
}
