import type { WitnessSupabaseClient } from '../supabase/client.js';
import type {
  PersonRegisterLink,
  RegisterConfig,
  RegisterDef,
  RegisterLinkStatus,
  RegisterRecord,
} from './types.js';

/**
 * The register catalog and link rows, app-shaped. Reference tables are
 * global (select for any signed-in user, seeded by service role); links
 * are the researcher's own rows. Mirrors naraRecords.ts's conventions.
 */

interface RegisterRow {
  register_key: string;
  display_name: string;
  variant: string;
  provenance_label: string;
  coverage_caveat: string | null;
  status: string;
  config: unknown;
}

interface RecordRow {
  id: string;
  register_key: string;
  record_kind: string;
  name_as_recorded: string;
  surname_normalized: string | null;
  given_normalized: string | null;
  entity_key: string | null;
  attributes: unknown;
  source_citation: string;
  finding_aid_url: string | null;
}

interface LinkRow {
  id: string;
  tree_id: string;
  individual_id: string;
  register_key: string;
  record_id: string | null;
  status: RegisterLinkStatus;
  match_score: number | null;
  match_reasons: unknown;
  record_name: string | null;
  record_summary: string | null;
  source_citation: string | null;
  finding_aid_url: string | null;
  saved_payload: unknown;
  confirmed_at: string | null;
}

const LINK_SELECT =
  'id, tree_id, individual_id, register_key, record_id, status, match_score, match_reasons, ' +
  'record_name, record_summary, source_citation, finding_aid_url, saved_payload, confirmed_at';

function toDef(row: RegisterRow): RegisterDef {
  return {
    registerKey: row.register_key,
    displayName: row.display_name,
    variant: row.variant as RegisterDef['variant'],
    provenanceLabel: row.provenance_label,
    coverageCaveat: row.coverage_caveat,
    status: row.status as RegisterDef['status'],
    config: (row.config ?? {}) as RegisterConfig,
  };
}

function toRecord(row: RecordRow): RegisterRecord {
  return {
    id: row.id,
    registerKey: row.register_key,
    recordKind: row.record_kind as RegisterRecord['recordKind'],
    nameAsRecorded: row.name_as_recorded,
    surnameNormalized: row.surname_normalized,
    givenNormalized: row.given_normalized,
    entityKey: row.entity_key,
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
    sourceCitation: row.source_citation,
    findingAidUrl: row.finding_aid_url,
  };
}

function toLink(row: LinkRow): PersonRegisterLink {
  return {
    id: row.id,
    treeId: row.tree_id,
    individualId: row.individual_id,
    registerKey: row.register_key,
    recordId: row.record_id,
    status: row.status,
    matchScore: row.match_score,
    matchReasons: Array.isArray(row.match_reasons) ? (row.match_reasons as string[]) : [],
    recordName: row.record_name,
    recordSummary: row.record_summary,
    sourceCitation: row.source_citation,
    findingAidUrl: row.finding_aid_url,
    savedPayload: (row.saved_payload as Record<string, unknown> | null) ?? null,
    confirmedAt: row.confirmed_at,
  };
}

export async function fetchActiveRegisters(
  client: WitnessSupabaseClient,
): Promise<Map<string, RegisterDef>> {
  const { data, error } = await client.from('registers').select('*').eq('status', 'active');
  if (error) throw new Error(`Fetching registers failed: ${error.message}`);
  return new Map(((data ?? []) as unknown as RegisterRow[]).map((r) => [r.register_key, toDef(r)]));
}

export async function fetchRegisterRecords(
  client: WitnessSupabaseClient,
  registerKey: string,
): Promise<RegisterRecord[]> {
  // Paged: PostgREST caps unranged selects at 1,000 rows, and the Acadian
  // register alone is 2,645 — an unpaged read silently matched against a
  // third of the roll. Ordered so pages can't skip or repeat rows.
  const rows: RecordRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('register_records')
      .select('id, register_key, record_kind, name_as_recorded, surname_normalized, given_normalized, entity_key, attributes, source_citation, finding_aid_url')
      .eq('register_key', registerKey)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Fetching register records failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as RecordRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows.map(toRecord);
}

export async function fetchRegisterLinksForIndividual(
  client: WitnessSupabaseClient,
  individualId: string,
): Promise<PersonRegisterLink[]> {
  const { data, error } = await client
    .from('person_register_links')
    .select(LINK_SELECT)
    .eq('individual_id', individualId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Fetching register links failed: ${error.message}`);
  return ((data ?? []) as unknown as LinkRow[]).map(toLink);
}

export async function fetchRegisterLinksForTree(
  client: WitnessSupabaseClient,
  treeId: string,
): Promise<PersonRegisterLink[]> {
  const { data, error } = await client
    .from('person_register_links')
    .select(LINK_SELECT)
    .eq('tree_id', treeId)
    .neq('status', 'rejected')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Fetching register links failed: ${error.message}`);
  return ((data ?? []) as unknown as LinkRow[]).map(toLink);
}

/** Record the researcher's verdict; any event write is the caller's job. */
export async function setRegisterLinkStatus(
  client: WitnessSupabaseClient,
  linkId: string,
  status: Exclude<RegisterLinkStatus, 'candidate'>,
): Promise<void> {
  const { data, error } = await client
    .from('person_register_links')
    .update({
      status,
      confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
    })
    .eq('id', linkId)
    .select('id');
  if (error) throw new Error(`Updating register link failed: ${error.message}`);
  // RLS filters a row you can't write into a 0-row "success" — a family
  // member's tap must fail loudly, not half-complete the confirm flow.
  if (!data || data.length === 0) throw new Error('Only the tree owner can decide this record.');
}

/** Variant C: the structured save-back — one confirmed row per saved record. */
export async function saveRegisterRecordLink(
  client: WitnessSupabaseClient,
  input: {
    treeId: string;
    userId: string;
    individualId: string;
    registerKey: string;
    recordName: string;
    recordSummary: string | null;
    sourceCitation: string | null;
    findingAidUrl: string | null;
    savedPayload: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await client.from('person_register_links').insert({
    tree_id: input.treeId,
    user_id: input.userId,
    individual_id: input.individualId,
    register_key: input.registerKey,
    status: 'confirmed',
    record_name: input.recordName,
    record_summary: input.recordSummary,
    source_citation: input.sourceCitation,
    finding_aid_url: input.findingAidUrl,
    saved_payload: input.savedPayload as never,
    confirmed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Saving the record failed: ${error.message}`);
}

/**
 * Variant B's search: entity records of one register whose name carries
 * every word the reader typed ("15 mass" finds the 15th Massachusetts
 * Infantry). Reference data is readable to any signed-in user.
 */
export async function searchRegisterEntities(
  client: WitnessSupabaseClient,
  registerKey: string,
  query: string,
  limit = 30,
): Promise<RegisterRecord[]> {
  let q = client
    .from('register_records')
    .select('id, register_key, record_kind, name_as_recorded, surname_normalized, given_normalized, entity_key, attributes, source_citation, finding_aid_url')
    .eq('register_key', registerKey)
    .eq('record_kind', 'entity')
    .order('name_as_recorded')
    .limit(limit);
  for (const word of query.trim().split(/\s+/).filter(Boolean)) q = q.ilike('name_as_recorded', `%${word}%`);
  const { data, error } = await q;
  if (error) throw new Error(`Searching the register failed: ${error.message}`);
  return ((data ?? []) as unknown as RecordRow[]).map(toRecord);
}

/**
 * Variant B's confirm: the reader attaches the entity (the regiment) to
 * a person's link. The link keeps a snapshot of the record so the card
 * stays whole if the reference row is ever retired; company and rank
 * are the reader's own words and live in saved_payload.
 */
export async function attachRegisterEntity(
  client: WitnessSupabaseClient,
  linkId: string,
  record: RegisterRecord,
  extra: { company?: string | null; rank?: string | null } = {},
): Promise<void> {
  const excerpt = typeof record.attributes['history_excerpt'] === 'string' ? (record.attributes['history_excerpt'] as string) : null;
  const { data, error } = await client
    .from('person_register_links')
    .update({
      record_id: record.id,
      record_name: record.nameAsRecorded,
      record_summary: excerpt ? excerpt.slice(0, 600) : null,
      source_citation: record.sourceCitation,
      finding_aid_url: record.findingAidUrl,
      saved_payload: {
        entity_key: record.entityKey,
        company: extra.company?.trim() || null,
        rank: extra.rank?.trim() || null,
        organized: record.attributes['organized'] ?? null,
        mustered_out: record.attributes['mustered_out'] ?? null,
      } as never,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', linkId)
    .select('id');
  if (error) throw new Error(`Attaching the record failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error('Only the tree owner can attach a record.');
}
