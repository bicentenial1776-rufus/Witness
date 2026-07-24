import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { Database } from '../supabase/database.types.js';

/**
 * NARA candidate documents: rows the nara-enrich worker matched to
 * ancestors, awaiting the human confirm/dismiss pass. Candidates are
 * anchored to the person's US place, so the place screen can show the
 * papers of that place; confirmed rows double as the ancestor page's
 * document shelf.
 */

export type NaraCandidateStatus = Database['public']['Enums']['nara_candidate_status'];

export interface NaraCandidate {
  id: string;
  individualId: string;
  individualName: string;
  placeId: string | null;
  naId: number;
  title: string;
  recordGroup: string | null;
  startYear: number | null;
  endYear: number | null;
  objectUrl: string | null;
  objectCount: number;
  series: string;
  matchReason: string | null;
  status: NaraCandidateStatus;
}

/** Human labels for the worker's series keys. */
export const NARA_SERIES_LABELS: Record<string, string> = {
  wwii_draft: 'WWII draft registration',
  wwi_draft: 'WWI draft registration',
  naturalization: 'Naturalization record',
};

/** The stable public page for a record — free to link, no API budget. */
export function naraCatalogUrl(naId: number): string {
  return `https://catalog.archives.gov/id/${naId}`;
}

interface CandidateRow {
  id: string;
  individual_id: string;
  place_id: string | null;
  na_id: number;
  series: string;
  match_reason: string | null;
  status: NaraCandidateStatus;
  nara_documents: {
    title: string;
    record_group: string | null;
    start_year: number | null;
    end_year: number | null;
    object_url: string | null;
    object_count: number;
  };
  individuals: { full_name: string };
}

const CANDIDATE_SELECT =
  'id, individual_id, place_id, na_id, series, match_reason, status, ' +
  'nara_documents (title, record_group, start_year, end_year, object_url, object_count), ' +
  'individuals (full_name)';

function toCandidate(row: CandidateRow): NaraCandidate {
  return {
    id: row.id,
    individualId: row.individual_id,
    individualName: row.individuals.full_name,
    placeId: row.place_id,
    naId: row.na_id,
    title: row.nara_documents.title,
    recordGroup: row.nara_documents.record_group,
    startYear: row.nara_documents.start_year,
    endYear: row.nara_documents.end_year,
    objectUrl: row.nara_documents.object_url,
    objectCount: row.nara_documents.object_count,
    series: row.series,
    matchReason: row.match_reason,
    status: row.status,
  };
}

/** Pending and confirmed candidates anchored to one place. */
export async function fetchNaraCandidatesForPlace(
  client: WitnessSupabaseClient,
  treeId: string,
  placeId: string,
): Promise<NaraCandidate[]> {
  const { data, error } = await client
    .from('nara_candidates')
    .select(CANDIDATE_SELECT)
    .eq('tree_id', treeId)
    .eq('place_id', placeId)
    .neq('status', 'dismissed')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Fetching NARA candidates failed: ${error.message}`);
  return ((data ?? []) as unknown as CandidateRow[]).map(toCandidate);
}

/** One ancestor's candidates; pass status to narrow (e.g. confirmed shelf). */
export async function fetchNaraCandidatesForIndividual(
  client: WitnessSupabaseClient,
  individualId: string,
  status?: NaraCandidateStatus,
): Promise<NaraCandidate[]> {
  let query = client
    .from('nara_candidates')
    .select(CANDIDATE_SELECT)
    .eq('individual_id', individualId)
    .order('created_at', { ascending: true });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(`Fetching NARA candidates failed: ${error.message}`);
  return ((data ?? []) as unknown as CandidateRow[]).map(toCandidate);
}

/** Confirm or dismiss a candidate. */
export async function setNaraCandidateStatus(
  client: WitnessSupabaseClient,
  candidateId: string,
  status: Exclude<NaraCandidateStatus, 'pending'>,
): Promise<void> {
  const { error } = await client
    .from('nara_candidates')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', candidateId);
  if (error) throw new Error(`Updating NARA candidate failed: ${error.message}`);
}
