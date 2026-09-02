import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { Database } from '../supabase/database.types.js';
import type { MatchConfidence } from '../history/passengers.js';

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
  const { error } = await client
    .from('passenger_candidates')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', candidateId);
  if (error) throw new Error(`Updating passenger candidate failed: ${error.message}`);
}
