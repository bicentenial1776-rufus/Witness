import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { Database } from '../supabase/database.types.js';
import type { MatchConfidence } from '../history/passengers.js';
import { splitName } from '../history/passengers.js';

/**
 * The Crossing card: ship-passenger candidates from matchPassengers(),
 * persisted so the Portrait can show them and a human can confirm or
 * dismiss. See supabase/migrations/20260830090000_passenger_candidates.sql —
 * a match is a candidate to investigate, never a claim that an ancestor
 * sailed.
 */

export type PassengerCandidateStatus = Database['public']['Enums']['passenger_candidate_status'];

export interface PassengerCandidate {
  id: string;
  treeId: string;
  individualId: string;
  voyageId: string;
  passengerId: string;
  ship: string;
  arrivalYear: number;
  departurePort: string | null;
  arrivalPlace: string | null;
  passengerName: string;
  passengerBirthYear: number | null;
  passengerDeathYear: number | null;
  source: string;
  confidence: MatchConfidence;
  reasons: string[];
  status: PassengerCandidateStatus;
}

interface CandidateRow {
  id: string;
  tree_id: string;
  individual_id: string;
  voyage_id: string;
  passenger_id: string;
  ship: string;
  arrival_year: number;
  departure_port: string | null;
  arrival_place: string | null;
  passenger_name: string;
  passenger_birth_year: number | null;
  passenger_death_year: number | null;
  source: string;
  confidence: string;
  reasons: string[];
  status: PassengerCandidateStatus;
}

const CANDIDATE_SELECT =
  'id, tree_id, individual_id, voyage_id, passenger_id, ship, arrival_year, departure_port, ' +
  'arrival_place, passenger_name, passenger_birth_year, passenger_death_year, source, ' +
  'confidence, reasons, status';

function toCandidate(row: CandidateRow): PassengerCandidate {
  return {
    id: row.id,
    treeId: row.tree_id,
    individualId: row.individual_id,
    voyageId: row.voyage_id,
    passengerId: row.passenger_id,
    ship: row.ship,
    arrivalYear: row.arrival_year,
    departurePort: row.departure_port,
    arrivalPlace: row.arrival_place,
    passengerName: row.passenger_name,
    passengerBirthYear: row.passenger_birth_year,
    passengerDeathYear: row.passenger_death_year,
    source: row.source,
    confidence: row.confidence as MatchConfidence,
    reasons: row.reasons,
    status: row.status,
  };
}

const CONFIDENCE_RANK: Record<MatchConfidence, number> = { strong: 0, probable: 1, weak: 2 };

/** One ancestor's candidates, best confidence first — 'confidence' is text,
    not an ordered type on the database side, so the rank is applied here. */
export async function fetchPassengerCandidatesForIndividual(
  client: WitnessSupabaseClient,
  individualId: string,
): Promise<PassengerCandidate[]> {
  const { data, error } = await client
    .from('passenger_candidates')
    .select(CANDIDATE_SELECT)
    .eq('individual_id', individualId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Fetching passenger candidates failed: ${error.message}`);
  return ((data ?? []) as unknown as CandidateRow[])
    .map(toCandidate)
    .sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]);
}

/** Every live candidate in the tree, newest first. */
export async function fetchPassengerCandidatesForTree(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<PassengerCandidate[]> {
  const { data, error } = await client
    .from('passenger_candidates')
    .select(CANDIDATE_SELECT)
    .eq('tree_id', treeId)
    .neq('status', 'dismissed')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Fetching passenger candidates failed: ${error.message}`);
  return ((data ?? []) as unknown as CandidateRow[]).map(toCandidate);
}

/** Confirm or dismiss a candidate. Confirming a candidate that writes a
    tree event is the caller's job (see apps/mobile/src/lib/passenger-candidates.ts) —
    this only records the verdict. */
export async function setPassengerCandidateStatus(
  client: WitnessSupabaseClient,
  candidateId: string,
  status: Exclude<PassengerCandidateStatus, 'pending'>,
): Promise<void> {
  const { data, error } = await client
    .from('passenger_candidates')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', candidateId)
    .select('id');
  if (error) throw new Error(`Updating passenger candidate failed: ${error.message}`);
  // RLS filters a row you can't write into a 0-row "success" — a family
  // member's tap must fail loudly, not half-complete the confirm flow.
  if (!data || data.length === 0) throw new Error('Only the tree owner can decide this record.');
}

export interface VerificationLink {
  label: string;
  url: string;
}

const WIKIDATA_QID = /\bQ\d+\b/;
const WIKIPEDIA_TITLE = /Wikipedia, "([^"]+)"/g;

/**
 * Public-domain transcriptions scanned at archive.org. The reader opens
 * on the first hit for `?q=`, so a surname query lands on the page where
 * the list names the person.
 */
const SCANNED_BOOKS = [
  {
    pattern: /Planters of the Commonwealth/i,
    archiveId: 'plantersofcommon00bank',
    label: 'Banks, Planters of the Commonwealth',
  },
  {
    pattern: /Original Lists of Persons of Quality/i,
    archiveId: 'originallistsofp00hott',
    label: 'Hotten, Original Lists of Persons of Quality',
  },
];

/**
 * Where a human can go check a candidate before ruling on it. The source
 * line already says where a row came from; this reads it and links to
 * that page — the person's own Wikipedia article, the list they appear
 * on, the scanned book opened to their surname — and falls back to a
 * search only when the source names nothing linkable. A search result is
 * a place to start looking; the source is where the claim lives.
 */
export function passengerVerificationLinks(candidate: PassengerCandidate): VerificationLink[] {
  const links: VerificationLink[] = [];
  const { givenNames, surname } = splitName(candidate.passengerName);

  // Wikidata resolves an item straight to its English Wikipedia article.
  const qid = candidate.source.match(WIKIDATA_QID)?.[0];
  if (qid) {
    links.push({
      label: 'Wikipedia article',
      url: `https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${qid}`,
    });
  }

  for (const match of candidate.source.matchAll(WIKIPEDIA_TITLE)) {
    const title = match[1];
    if (!title) continue;
    links.push({
      label: `Wikipedia: ${title}`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    });
  }

  for (const book of SCANNED_BOOKS) {
    if (!book.pattern.test(candidate.source)) continue;
    links.push({
      label: `${book.label} (archive.org)`,
      url: `https://archive.org/details/${book.archiveId}?q=${encodeURIComponent(surname || candidate.passengerName)}`,
    });
  }

  // Wikipedia's Go jumps to the article titled exactly this — or, for a
  // common name, the disambiguation page listing everyone who bears it —
  // and only falls back to a results page when neither exists. Ship and
  // year would defeat the title match, so the name goes alone.
  if (links.length === 0) {
    links.push({
      label: 'Find on Wikipedia',
      url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(candidate.passengerName)}&go=Go`,
    });
  }

  const familySearchParams: string[] = [];
  if (givenNames) familySearchParams.push(`q.givenName=${encodeURIComponent(givenNames)}`);
  if (surname) familySearchParams.push(`q.surname=${encodeURIComponent(surname)}`);
  if (candidate.passengerBirthYear) {
    familySearchParams.push(`q.birthLikeDate.from=${candidate.passengerBirthYear - 2}`);
    familySearchParams.push(`q.birthLikeDate.to=${candidate.passengerBirthYear + 2}`);
  }
  links.push({
    label: 'FamilySearch (free account needed)',
    url: `https://www.familysearch.org/search/record/results?${familySearchParams.join('&')}`,
  });

  return links;
}
