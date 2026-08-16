import { classifyAliveDuring, type AliveCandidate, type AliveConfidence } from '../query/aliveDuring.js';
import { regionOf } from '../query/regions.js';
import type { WitnessSupabaseClient } from '../supabase/client.js';
import { fetchHistoricalEvents, type EventTier, type HistoricalEvent } from './events.js';

/**
 * Surface 1 of the query architecture (docs/QUERY_LIBRARY.md): the
 * "Lived Through" tags on an ancestor card. An event qualifies when the
 * lifespan overlaps its range — birth_year ≤ event_end AND (death_year
 * IS NULL OR death_year ≥ event_start) — via the same classification rule
 * as the alive-during engine, so undocumented deaths get the assumed-
 * lifespan treatment instead of tagging a 1720 birth with World War II.
 *
 * Geography GATES regional and local events — the same eligibility rule
 * the curated shelf has always applied (shelf.ts): a major-tier event
 * speaks to everyone, but a regional or local one must intersect the
 * places in this ancestor's own record. Before 2026-08-15 geography was
 * only a ranking boost, and a German ancestor's card wore the Salem
 * Witch Trials because nothing else in the corpus overlapped her years
 * (Katie Grafer's review). Zero tags beats a wrong tag.
 *
 * Ranking then prefers major tier, boosted for geo matches; capped at 5.
 */

export const LIVED_THROUGH_TAG_CAP = 5;

export interface LivedThroughTag {
  event: HistoricalEvent;
  /** Age when the event began; null when unknown or born mid-event. */
  ageAtStart: number | null;
  bornDuring: boolean;
  confidence: AliveConfidence;
  /** The event's geo_scope intersects the places in this person's record. */
  geoMatched: boolean;
}

const TIER_WEIGHT: Record<EventTier, number> = { major: 3, regional: 2, local: 1 };

/**
 * Lifts a geographically relevant event above non-matching events one
 * tier up (a matched regional beats an unmatched major), without letting
 * a matched local outrank a matched regional.
 */
const GEO_BOOST = 2;

function tagScore(tag: LivedThroughTag): number {
  return TIER_WEIGHT[tag.event.tier] + (tag.geoMatched ? GEO_BOOST : 0);
}

/**
 * Pure ranking rule: overlap filter, then score descending. Ties prefer
 * the major tier, then the earlier event. `personRegions` holds the
 * canonical display regions of the person's own event places.
 */
export function rankLivedThroughEvents(
  person: AliveCandidate,
  events: readonly HistoricalEvent[],
  personRegions: ReadonlySet<string>,
): LivedThroughTag[] {
  const tags: LivedThroughTag[] = [];
  for (const event of events) {
    const match = classifyAliveDuring(person, event);
    if (!match) continue;
    const geoMatched = (event.geoScope?.regions ?? []).some((region) => personRegions.has(region));
    // The shelf's eligibility rule: regional/local events must be
    // geographically relevant to this person. Never merely outranked —
    // absent, so a thin corpus can't push Salem onto a German card.
    if (event.tier !== 'major' && !geoMatched) continue;
    tags.push({
      event,
      ageAtStart: match.ageAtStart,
      bornDuring: match.bornDuring,
      confidence: match.confidence,
      geoMatched,
    });
  }

  tags.sort(
    (a, b) =>
      tagScore(b) - tagScore(a) ||
      TIER_WEIGHT[b.event.tier] - TIER_WEIGHT[a.event.tier] ||
      a.event.startYear - b.event.startYear,
  );
  return tags.slice(0, LIVED_THROUGH_TAG_CAP);
}

interface PlacePartsRow {
  places: { parts: string[] } | null;
}

/** The canonical regions this person's own events touch. */
export function regionsFromPlaceParts(rows: readonly PlacePartsRow[]): Set<string> {
  const regions = new Set<string>();
  for (const row of rows) {
    const region = row.places ? regionOf(row.places.parts) : null;
    if (region) regions.add(region);
  }
  return regions;
}

/**
 * The tags for one ancestor card: fetches the person, their event places,
 * and the event library, then applies the pure ranking rule. Null when the
 * individual doesn't exist.
 */
export async function getLivedThroughEvents(
  client: WitnessSupabaseClient,
  individualId: string,
): Promise<LivedThroughTag[] | null> {
  const [{ data: person }, { data: placeRows }, events] = await Promise.all([
    client
      .from('individuals')
      .select('id, full_name, sex, birth_year, death_year, living')
      .eq('id', individualId)
      .maybeSingle(),
    client.from('individual_events').select('places(parts)').eq('individual_id', individualId),
    fetchHistoricalEvents(client),
  ]);
  if (!person) return null;
  const regions = regionsFromPlaceParts((placeRows ?? []) as PlacePartsRow[]);
  return rankLivedThroughEvents(person, events, regions);
}
