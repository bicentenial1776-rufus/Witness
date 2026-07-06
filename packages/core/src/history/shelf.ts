import { MAX_LIFESPAN_YEARS } from '../query/aliveDuring.js';
import type { GeographyIndex } from '../query/geography.js';
import { fetchGeographyIndex } from '../query/geography.js';
import type { WitnessSupabaseClient } from '../supabase/client.js';
import { fetchHistoricalEvents, type EventTier, type HistoricalEvent } from './events.js';

/**
 * Surface 2 of the query architecture (docs/QUERY_LIBRARY.md): the curated
 * shelf — the 3–5 event cards Explore leads with, chosen for this tree,
 * this month. Scoring is pure; only getCuratedShelf touches the network.
 *
 * An event earns its card through result density (how many ancestors were
 * alive), geographic match (geo_scope against the tree's place
 * concentrations), lens affinity (detected heritage branches), and
 * anniversary proximity (a 25/50/100-year multiple of the current year).
 * Regional and local events must be geographically or lens relevant;
 * major events qualify on density alone — a tree with no California
 * ancestors never sees the Gold Rush, however many people were alive
 * in 1848.
 */

export const SHELF_MIN = 3;
export const SHELF_MAX = 5;

export interface ShelfEntry {
  event: HistoricalEvent;
  /** Ancestors whose lifespan overlaps the event — the card's number. */
  aliveCount: number;
  /** "250 years ago" when a 25/50/100-year anniversary falls this year. */
  anniversaryLabel: string | null;
  /** Composite score — exposed for tests and debugging. */
  score: number;
}

// Branch detection -----------------------------------------------------------

/** Share of a tree's placed events a region group needs to count as a branch. */
export const BRANCH_SHARE_THRESHOLD = 0.05;

const ACADIAN_REGIONS = new Set(['Acadia', 'Nova Scotia', 'New Brunswick', 'Prince Edward Island']);
const NEW_ENGLAND_REGIONS = new Set([
  'Massachusetts',
  'Rhode Island',
  'Connecticut',
  'New Hampshire',
  'Maine',
  'Vermont',
]);

/**
 * The heritage branches a tree's geography supports, in the lens_affinity
 * vocabulary. Deliberately coarse: a branch is detected when at least 5%
 * of the tree's placed events sit in its territory (for Colonial New
 * England, in the colonial era). The full Identity Lens feature will
 * refine this; the shelf only needs a confident signal.
 */
export function detectBranches(index: GeographyIndex): Set<string> {
  let placed = 0;
  let acadian = 0;
  let colonialNewEngland = 0;
  let irish = 0;
  let frenchCanadian = 0;

  for (const event of index.events) {
    if (!event.placeId) continue;
    const region = index.places.get(event.placeId)?.region;
    if (!region) continue;
    placed++;
    if (ACADIAN_REGIONS.has(region)) acadian++;
    if (NEW_ENGLAND_REGIONS.has(region) && event.year !== null && event.year <= 1775) {
      colonialNewEngland++;
    }
    if (region === 'Ireland') irish++;
    if (region === 'Quebec') frenchCanadian++;
  }

  const branches = new Set<string>();
  if (!placed) return branches;
  if (acadian / placed >= BRANCH_SHARE_THRESHOLD) branches.add('acadian');
  if (colonialNewEngland / placed >= BRANCH_SHARE_THRESHOLD) branches.add('colonial_new_england');
  if (irish / placed >= BRANCH_SHARE_THRESHOLD) branches.add('irish');
  if (frenchCanadian / placed >= BRANCH_SHARE_THRESHOLD) branches.add('french_canadian');
  return branches;
}

/** region → share of the tree's placed events there (0..1). */
export function regionShares(index: GeographyIndex): Map<string, number> {
  const counts = new Map<string, number>();
  let placed = 0;
  for (const event of index.events) {
    if (!event.placeId) continue;
    const region = index.places.get(event.placeId)?.region;
    if (!region) continue;
    placed++;
    counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  const shares = new Map<string, number>();
  for (const [region, count] of counts) shares.set(region, count / placed);
  return shares;
}

// Scoring --------------------------------------------------------------------

const TIER_PREFERENCE: Record<EventTier, number> = { major: 1, regional: 0.5, local: 0 };
const DENSITY_WEIGHT = 3;
const GEO_WEIGHT = 4;
const LENS_BONUS = 3;

/**
 * The library's overlap rule with the alive-during engine's assumed
 * lifespan for undocumented deaths, over the denormalized years the
 * geography index already carries.
 */
function countAlive(index: GeographyIndex, event: HistoricalEvent): number {
  let count = 0;
  for (const person of index.individuals.values()) {
    const birth = person.birth_year;
    if (birth === null || birth > event.endYear) continue;
    const death = person.death_year;
    if (death !== null ? death >= event.startYear : birth + MAX_LIFESPAN_YEARS >= event.startYear) {
      count++;
    }
  }
  return count;
}

function anniversaryBoost(event: HistoricalEvent, currentYear: number): { boost: number; label: string | null } {
  let best = { boost: 0, label: null as string | null };
  for (const year of [event.startYear, event.endYear]) {
    const yearsAgo = currentYear - year;
    if (yearsAgo <= 0 || yearsAgo % 25 !== 0) continue;
    const boost = yearsAgo % 100 === 0 ? 2 : yearsAgo % 50 === 0 ? 1.5 : 1;
    if (boost > best.boost) best = { boost, label: `${yearsAgo} years ago` };
  }
  return best;
}

/**
 * Pure selection rule. Returns the top 3–5 scored entries; when fewer
 * than 3 events pass the relevance gate, the strongest remaining events
 * with any results at all backfill so a sparse tree still gets a shelf.
 */
export function curateShelf(
  events: readonly HistoricalEvent[],
  index: GeographyIndex,
  currentYear: number,
): ShelfEntry[] {
  const branches = detectBranches(index);
  const shares = regionShares(index);

  const scored: { entry: ShelfEntry; eligible: boolean }[] = [];
  for (const event of events) {
    const aliveCount = countAlive(index, event);
    if (aliveCount === 0) continue;

    const geoShare = (event.geoScope?.regions ?? []).reduce(
      (sum, region) => sum + (shares.get(region) ?? 0),
      0,
    );
    const lensMatched = (event.lensAffinity ?? []).some((lens) => branches.has(lens));
    const anniversary = anniversaryBoost(event, currentYear);

    const score =
      DENSITY_WEIGHT * (aliveCount / Math.max(1, index.individuals.size)) +
      GEO_WEIGHT * geoShare +
      (lensMatched ? LENS_BONUS : 0) +
      anniversary.boost +
      TIER_PREFERENCE[event.tier];

    scored.push({
      entry: { event, aliveCount, anniversaryLabel: anniversary.label, score },
      eligible: event.tier === 'major' || geoShare > 0 || lensMatched,
    });
  }

  scored.sort((a, b) => b.entry.score - a.entry.score || a.entry.event.startYear - b.entry.event.startYear);

  const shelf = scored.filter((s) => s.eligible).slice(0, SHELF_MAX);
  if (shelf.length < SHELF_MIN) {
    for (const candidate of scored) {
      if (shelf.length >= SHELF_MIN) break;
      if (!shelf.includes(candidate)) shelf.push(candidate);
    }
  }
  return shelf.map((s) => s.entry);
}

/**
 * The shelf for a tree. Callers cache per tree and recompute on re-import
 * and monthly (the app's shelf cache does both).
 */
export async function getCuratedShelf(
  client: WitnessSupabaseClient,
  treeId: string,
  currentYear: number = new Date().getFullYear(),
  preloadedIndex?: GeographyIndex,
): Promise<ShelfEntry[]> {
  const [events, index] = await Promise.all([
    fetchHistoricalEvents(client),
    preloadedIndex ?? fetchGeographyIndex(client, treeId),
  ]);
  return curateShelf(events, index, currentYear);
}
