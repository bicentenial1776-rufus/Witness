import type { WitnessSupabaseClient } from '../supabase/client.js';
import { fetchAllPages } from '../supabase/paginate.js';
import { fetchTreeHealthData, type HealthFamily, type HealthIndividual, type TreeHealthData } from './treeHealth.js';

/**
 * Orphan records: people the family graph cannot reach from the main
 * tree. Two species, per Rufus (2026-07-25):
 *
 *  - ISLANDS — clusters wired to each other but not to the tree, each
 *    presented through its anchor (the best-connected member) with a
 *    count to convey the enormity.
 *  - SOLO records — no parent, spouse, or child links at all. The bare
 *    ones (a name and nothing else) are flagged as candidates for
 *    deletion: in reality they were likely lost in a merge.
 *
 * Every island and solo gets a heuristic connection suggestion — the
 * main-tree person it most plausibly belongs near, scored on surname
 * (exact or phonetic), lifespan overlap, and shared places. Suggestions
 * are leads to verify at the source, never conclusions.
 */

export interface ConnectionSuggestion {
  candidateId: string;
  candidateName: string;
  reasons: string[];
  score: number;
}

export interface OrphanIsland {
  memberIds: string[];
  anchorId: string;
  suggestion: ConnectionSuggestion | null;
}

export interface SoloOrphan {
  individualId: string;
  /** A name and nothing else — no dates, no events. Likely merge debris. */
  deletionCandidate: boolean;
  suggestion: ConnectionSuggestion | null;
}

export interface OrphanReport {
  mainTreeSize: number;
  totalDisconnected: number;
  islands: OrphanIsland[];
  solos: SoloOrphan[];
}

// ── Connectivity ─────────────────────────────────────────────────────

function components(individuals: HealthIndividual[], families: HealthFamily[]): string[][] {
  const parent = new Map<string, string>();
  for (const person of individuals) parent.set(person.id, person.id);
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = x;
    while (parent.get(cursor) !== cursor) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  for (const family of families) {
    const members = [family.husband_id, family.wife_id, ...family.children].filter(
      (id): id is string => Boolean(id) && parent.has(id!),
    );
    for (let i = 1; i < members.length; i++) parent.set(find(members[0]!), find(members[i]!));
  }
  const groups = new Map<string, string[]>();
  for (const person of individuals) {
    const root = find(person.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(person.id);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

// ── Suggestion scoring ───────────────────────────────────────────────

/** Classic Soundex — coarse, but Howe/How/Howes land together. */
export function soundex(name: string): string {
  const s = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  const code = (c: string) =>
    'BFPV'.includes(c) ? '1'
    : 'CGJKQSXZ'.includes(c) ? '2'
    : 'DT'.includes(c) ? '3'
    : c === 'L' ? '4'
    : 'MN'.includes(c) ? '5'
    : c === 'R' ? '6'
    : '';
  let out = s[0]!;
  let previous = code(s[0]!);
  for (const c of s.slice(1)) {
    const digit = code(c);
    if (digit && digit !== previous) out += digit;
    if (!'HW'.includes(c)) previous = digit;
    if (out.length === 4) break;
  }
  return out.padEnd(4, '0');
}

interface GroupProfile {
  surnames: Set<string>;
  phonetics: Set<string>;
  earliest: number | null;
  latest: number | null;
  placeIds: Set<string>;
}

function profile(
  memberIds: string[],
  byId: Map<string, HealthIndividual>,
  placesByPerson: Map<string, Set<string>>,
): GroupProfile {
  const surnames = new Set<string>();
  const phonetics = new Set<string>();
  const placeIds = new Set<string>();
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const id of memberIds) {
    const person = byId.get(id);
    if (!person) continue;
    if (person.surname) {
      surnames.add(person.surname.toLowerCase());
      phonetics.add(soundex(person.surname));
    }
    for (const year of [person.birth_year, person.death_year]) {
      if (year === null) continue;
      earliest = earliest === null ? year : Math.min(earliest, year);
      latest = latest === null ? year : Math.max(latest, year);
    }
    for (const placeId of placesByPerson.get(id) ?? []) placeIds.add(placeId);
  }
  return { surnames, phonetics, earliest, latest, placeIds };
}

const LIFESPAN_SLACK_YEARS = 40; // a generation-and-change on either side

function suggestFor(
  group: GroupProfile,
  mainIds: string[],
  byId: Map<string, HealthIndividual>,
  placesByPerson: Map<string, Set<string>>,
  placeNames: Map<string, string> | undefined,
): ConnectionSuggestion | null {
  let best: ConnectionSuggestion | null = null;
  for (const id of mainIds) {
    const person = byId.get(id);
    if (!person?.surname) continue;
    const surname = person.surname.toLowerCase();
    const exact = group.surnames.has(surname);
    const phonetic = !exact && group.phonetics.has(soundex(person.surname));
    if (!exact && !phonetic) continue; // surname kinship is the entry ticket

    let score = exact ? 3 : 2;
    const reasons = [
      exact ? `shares the surname ${person.surname}` : `surname ${person.surname} sounds alike`,
    ];

    if (group.earliest !== null && person.birth_year !== null) {
      const personEnd = person.death_year ?? person.birth_year + 80;
      const overlap =
        person.birth_year <= (group.latest ?? group.earliest) + LIFESPAN_SLACK_YEARS &&
        personEnd >= group.earliest - LIFESPAN_SLACK_YEARS;
      if (overlap) {
        score += 1;
        reasons.push(`alive in the same era (${group.earliest}–${group.latest ?? group.earliest})`);
      } else {
        score -= 2; // same surname, wrong century — probably noise
      }
    }

    const shared = [...(placesByPerson.get(id) ?? [])].find((p) => group.placeIds.has(p));
    if (shared) {
      score += 2;
      const placeName = placeNames?.get(shared);
      reasons.push(placeName ? `both tied to ${placeName}` : 'tied to the same place');
    }

    if (score >= 3 && (best === null || score > best.score)) {
      best = { candidateId: id, candidateName: person.full_name, reasons, score };
    }
  }
  return best;
}

// ── The report ───────────────────────────────────────────────────────

export function findOrphanRecords(
  data: TreeHealthData,
  options: { placeNames?: Map<string, string> } = {},
): OrphanReport {
  const byId = new Map(data.individuals.map((person) => [person.id, person]));

  const placesByPerson = new Map<string, Set<string>>();
  const datedEvents = new Set<string>();
  for (const event of data.events) {
    if (event.place_id) {
      if (!placesByPerson.has(event.individual_id)) placesByPerson.set(event.individual_id, new Set());
      placesByPerson.get(event.individual_id)!.add(event.place_id);
    }
    if (event.date_year !== null) datedEvents.add(event.individual_id);
  }

  const degree = new Map<string, number>();
  for (const family of data.families) {
    const members = [family.husband_id, family.wife_id, ...family.children].filter(
      (id): id is string => Boolean(id),
    );
    for (const id of members) degree.set(id, (degree.get(id) ?? 0) + members.length - 1);
  }

  const groups = components(data.individuals, data.families);
  const [main = [], ...rest] = groups;

  const islands: OrphanIsland[] = [];
  const solos: SoloOrphan[] = [];
  for (const memberIds of rest) {
    if (memberIds.length > 1) {
      const anchorId = [...memberIds].sort((a, b) => {
        const byDegree = (degree.get(b) ?? 0) - (degree.get(a) ?? 0);
        if (byDegree !== 0) return byDegree;
        return (byId.get(a)?.birth_year ?? 9999) - (byId.get(b)?.birth_year ?? 9999);
      })[0]!;
      islands.push({
        memberIds,
        anchorId,
        suggestion: suggestFor(
          profile(memberIds, byId, placesByPerson),
          main,
          byId,
          placesByPerson,
          options.placeNames,
        ),
      });
    } else {
      const id = memberIds[0]!;
      const person = byId.get(id)!;
      const bare =
        person.birth_year === null &&
        person.death_year === null &&
        !datedEvents.has(id) &&
        !(placesByPerson.get(id)?.size ?? 0);
      solos.push({
        individualId: id,
        deletionCandidate: bare,
        suggestion: bare
          ? null
          : suggestFor(profile([id], byId, placesByPerson), main, byId, placesByPerson, options.placeNames),
      });
    }
  }

  islands.sort((a, b) => b.memberIds.length - a.memberIds.length);
  // Deletion candidates last: actionable leads first, debris at the end.
  solos.sort((a, b) => Number(a.deletionCandidate) - Number(b.deletionCandidate));

  return {
    mainTreeSize: main.length,
    totalDisconnected: data.individuals.length - main.length,
    islands,
    solos,
  };
}

export interface OrphanBundle {
  data: TreeHealthData;
  report: OrphanReport;
}

/** One fetch for the Orphan Records screen: the tree bundle plus place names for suggestion reasons. */
export async function fetchOrphanBundle(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<OrphanBundle> {
  const [data, places] = await Promise.all([
    fetchTreeHealthData(client, treeId),
    fetchAllPages<{ id: string; raw: string }>(
      (from, to) =>
        client.from('places').select('id, raw').eq('tree_id', treeId).order('id').range(from, to),
      'Fetching places failed',
    ),
  ]);
  const report = findOrphanRecords(data, {
    placeNames: new Map(places.map((place) => [place.id, place.raw])),
  });
  return { data, report };
}
