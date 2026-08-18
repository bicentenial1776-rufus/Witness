// Family context for the story experience (witness-family-context-spec.md):
// siblings and aunts/uncles of a subject, with best-effort proximity facts
// from geocoded residence events. One RelativeFact[] is computed per story
// view and feeds BOTH the pedigree chart and the AI narrative brief — one
// source of truth, per the spec's shared-data-layer decision. Cousins and
// wider kin are deliberately out of scope.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ProximityBucket = 'same_town' | 'same_county' | 'within_100mi' | 'elsewhere' | 'unknown';

export interface RelativeFact {
  person_id: string;
  name: string;
  relationship: 'sibling' | 'aunt' | 'uncle';
  birth_year?: number;
  death_year?: number;
  /** Living people never enter AI prompts (house doctrine); the chart may still show them. */
  living: boolean;
  /** Whether a story (biography) has already been generated for this person. */
  has_story: boolean;
  proximity_bucket: ProximityBucket;
}

/** A dated, geocoded residence — the raw material of a proximity claim. */
export interface ResidencePoint {
  year: number | null;
  latitude: number;
  longitude: number;
  placeId: string;
}

const EARTH_RADIUS_MI = 3958.8;

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Bucket thresholds: an identical geocoded place (or a hair apart) reads as
// the same town; 30 miles approximates a county's reach in the periods most
// trees cover; 100 miles reuses the Nearby feature's "same region" radius.
export function bucketMiles(miles: number): Exclude<ProximityBucket, 'unknown'> {
  if (miles < 5) return 'same_town';
  if (miles < 30) return 'same_county';
  if (miles <= 100) return 'within_100mi';
  return 'elsewhere';
}

/**
 * How close two residences sit in TIME: a proximity claim needs both
 * parties' locations during overlapping years. Undated residences only
 * qualify when they are that person's sole known residence (a one-address
 * life is its own date range). 15 years is the widest gap we'll bridge —
 * census-interval data rarely lines up exactly.
 */
const MAX_YEAR_GAP = 15;

/**
 * Best-available proximity between two people from their residence events
 * ("curiosities not verdicts": no qualifying pair means "unknown", never a
 * guess). Chooses the pair of residences closest together in time, breaking
 * ties by distance; same interned place id short-circuits to same_town.
 */
export function pickProximity(
  a: ResidencePoint[],
  b: ResidencePoint[],
): ProximityBucket {
  const usable = (list: ResidencePoint[]) =>
    list.filter((r) => r.year !== null || list.length === 1);
  const aUsable = usable(a);
  const bUsable = usable(b);
  if (aUsable.length === 0 || bUsable.length === 0) return 'unknown';

  let best: { gap: number; miles: number } | null = null;
  for (const ra of aUsable) {
    for (const rb of bUsable) {
      const gap =
        ra.year !== null && rb.year !== null ? Math.abs(ra.year - rb.year) : MAX_YEAR_GAP;
      if (gap > MAX_YEAR_GAP) continue;
      const miles = ra.placeId === rb.placeId ? 0 : haversineMiles(ra.latitude, ra.longitude, rb.latitude, rb.longitude);
      if (!best || gap < best.gap || (gap === best.gap && miles < best.miles)) {
        best = { gap, miles };
      }
    }
  }
  return best ? bucketMiles(best.miles) : 'unknown';
}

interface IndividualRow {
  id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
  sex: 'M' | 'F' | 'U';
}

/**
 * The subject's family circle — siblings (shared parent-family) and
 * aunts/uncles (parents' siblings) — with story flags and proximity.
 * Pure graph traversal over rows the importer already writes; no new
 * source data. Tree-scoped by RLS plus the subject's own links.
 */
export async function fetchRelativeFacts(
  supabase: SupabaseClient,
  individualId: string,
): Promise<RelativeFact[]> {
  // Subject's parent families → parents and siblings.
  const { data: subjectFamc } = await supabase
    .from('family_children')
    .select('family_id')
    .eq('individual_id', individualId);
  const familyIds = (subjectFamc ?? []).map((r) => r.family_id);
  if (familyIds.length === 0) return [];

  const { data: parentFams } = await supabase
    .from('families')
    .select('id, husband_id, wife_id')
    .in('id', familyIds);
  const parentIds = [
    ...new Set((parentFams ?? []).flatMap((f) => [f.husband_id, f.wife_id])),
  ].filter((id): id is string => Boolean(id));

  const { data: siblingLinks } = await supabase
    .from('family_children')
    .select('individual_id')
    .in('family_id', familyIds);
  const siblingIds = [
    ...new Set((siblingLinks ?? []).map((r) => r.individual_id)),
  ].filter((sid) => sid !== individualId);

  // Parents' parent-families → their siblings = the subject's aunts/uncles.
  let auntUncleIds: string[] = [];
  if (parentIds.length) {
    const { data: parentFamc } = await supabase
      .from('family_children')
      .select('family_id')
      .in('individual_id', parentIds);
    const grandFamilyIds = [...new Set((parentFamc ?? []).map((r) => r.family_id))];
    if (grandFamilyIds.length) {
      const { data: parentSiblingLinks } = await supabase
        .from('family_children')
        .select('individual_id')
        .in('family_id', grandFamilyIds);
      auntUncleIds = [
        ...new Set((parentSiblingLinks ?? []).map((r) => r.individual_id)),
      ].filter((aid) => !parentIds.includes(aid) && aid !== individualId && !siblingIds.includes(aid));
    }
  }

  const relativeIds = [...siblingIds, ...auntUncleIds];
  if (relativeIds.length === 0) return [];

  const allIds = [individualId, ...relativeIds];
  const [{ data: rows }, { data: stories }, { data: residenceRows }] = await Promise.all([
    supabase
      .from('individuals')
      .select('id, full_name, birth_year, death_year, living, sex')
      .in('id', relativeIds)
      .returns<IndividualRow[]>(),
    supabase
      .from('enrichment_cache')
      .select('individual_id')
      .eq('enrichment_type', 'biography')
      .in('individual_id', relativeIds),
    supabase
      .from('individual_events')
      .select('individual_id, date_year, places(id, latitude, longitude)')
      .eq('event_type', 'residence')
      .in('individual_id', allIds),
  ]);

  const hasStory = new Set((stories ?? []).map((s) => s.individual_id));
  const residencesByPerson = new Map<string, ResidencePoint[]>();
  for (const row of (residenceRows ?? []) as unknown as {
    individual_id: string;
    date_year: number | null;
    places: { id: string; latitude: number | null; longitude: number | null } | null;
  }[]) {
    if (row.places?.latitude == null || row.places?.longitude == null) continue;
    const list = residencesByPerson.get(row.individual_id) ?? [];
    list.push({
      year: row.date_year,
      latitude: row.places.latitude,
      longitude: row.places.longitude,
      placeId: row.places.id,
    });
    residencesByPerson.set(row.individual_id, list);
  }
  const subjectResidences = residencesByPerson.get(individualId) ?? [];

  const relationshipOf = (row: IndividualRow): RelativeFact['relationship'] => {
    if (siblingIds.includes(row.id)) return 'sibling';
    return row.sex === 'F' ? 'aunt' : 'uncle';
  };

  return (rows ?? [])
    .map((row): RelativeFact => ({
      person_id: row.id,
      name: row.full_name,
      relationship: relationshipOf(row),
      birth_year: row.birth_year ?? undefined,
      death_year: row.death_year ?? undefined,
      living: row.living,
      has_story: hasStory.has(row.id),
      proximity_bucket: pickProximity(
        subjectResidences,
        residencesByPerson.get(row.id) ?? [],
      ),
    }))
    .sort((a, b) => {
      if (a.relationship !== b.relationship) {
        return a.relationship === 'sibling' ? -1 : 1;
      }
      return (a.birth_year ?? 9999) - (b.birth_year ?? 9999);
    });
}

/**
 * The wire brief for AI narrative weaving: living relatives excluded (they
 * never enter prompts or cached output), internal flags dropped. Capped so
 * an enormous family can't balloon the prompt.
 */
export function relativesBrief(facts: RelativeFact[]): object[] {
  return facts
    .filter((f) => !f.living)
    .slice(0, 24)
    .map((f) => ({
      name: f.name,
      relationship: f.relationship,
      birth_year: f.birth_year ?? null,
      death_year: f.death_year ?? null,
      proximity_bucket: f.proximity_bucket,
    }));
}
