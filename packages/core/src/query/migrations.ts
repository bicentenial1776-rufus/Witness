import type { GeographyIndex } from './geography.js';
import { isStateLevel, regionsCompatible } from './regions.js';

/**
 * Migration-path detection: orders each ancestor's dated life events,
 * maps them to regions, and treats every change of region within one
 * life as a migration. Aggregating those transitions across the tree
 * surfaces the family's dominant movements ("Massachusetts → Maine,
 * 41 people, around 1790").
 *
 * A record that only says "United States" is one census line away from
 * "Maine", not a move — compatible-precision regions are coalesced (the
 * more specific label wins) rather than counted as migrations.
 */

export interface MigrationMover {
  individualId: string;
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
  /** Everyone who made this move, earliest arrival first. */
  movers: MigrationMover[];
}

const EVENT_ORDER: Record<string, number> = { birth: 0, residence: 1, death: 2, burial: 3 };

export function migrationPaths(index: GeographyIndex): MigrationPath[] {
  const moves = new Map<string, MigrationMover[]>();

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
    if (!dated.length) continue;

    let current = { region: dated[0]!.region, year: dated[0]!.year };
    for (let i = 1; i < dated.length; i++) {
      const next = dated[i]!;
      if (regionsCompatible(current.region, next.region)) {
        current = {
          region: isStateLevel(next.region) ? next.region : current.region,
          year: next.year,
        };
        continue;
      }
      const key = `${current.region}→${next.region}`;
      if (!moves.has(key)) moves.set(key, []);
      moves.get(key)!.push({
        individualId,
        name: individual.full_name,
        fromYear: current.year,
        toYear: next.year,
      });
      current = { region: next.region, year: next.year };
    }
  }

  const paths: MigrationPath[] = [];
  for (const [key, movers] of moves) {
    const [from = '', to = ''] = key.split('→');
    const years = movers.map((m) => m.toYear).filter((y): y is number => y !== null).sort((a, b) => a - b);
    movers.sort((a, b) => (a.toYear ?? 9999) - (b.toYear ?? 9999));
    paths.push({
      from,
      to,
      count: movers.length,
      medianYear: years[Math.floor(years.length / 2)] ?? null,
      movers,
    });
  }

  paths.sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
  return paths;
}
