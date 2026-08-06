import type { ParsedGedcom } from '../gedcom/index.js';
import type { WitnessSupabaseClient } from './client.js';
import type { Database } from './database.types.js';
import { buildImportPayload, type BuildImportPayloadOptions } from './transform.js';

const DEFAULT_BATCH_SIZE = 500;

type TableName = keyof Database['public']['Tables'];

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function insertInBatches<T extends Record<string, unknown>>(
  client: WitnessSupabaseClient,
  table: TableName,
  rows: T[],
  batchSize: number,
  reportInserted: (count: number) => void,
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from(table) as any).insert(batch);
    if (error) {
      throw new Error(`Failed inserting into ${table} (batch of ${batch.length}): ${error.message}`);
    }
    reportInserted(batch.length);
  }
}

export interface ImportProgress {
  /** Table currently being written. */
  table: TableName;
  /** Rows written so far across all tables. */
  insertedRows: number;
  /** Total rows the import will write. */
  totalRows: number;
}

export interface ImportGedcomOptions extends BuildImportPayloadOptions {
  batchSize?: number;
  onProgress?: (progress: ImportProgress) => void;
}

export interface ImportGedcomResult {
  treeId: string;
}

/**
 * Writes a parsed GEDCOM into Supabase. Inserts in FK-safe order: trees,
 * places, individuals, individual_events, families, family_children,
 * curiosities, curiosity_individuals, sources, citations. Every insert
 * relies on RLS — the
 * passed-in client must be authenticated as the owning user (or use a
 * service-role client that bypasses RLS, e.g. for background jobs).
 *
 * Not idempotent: each call creates a new `trees` row. Re-importing the
 * same file today means duplicate data, not an upsert-in-place.
 */
export async function importParsedGedcom(
  client: WitnessSupabaseClient,
  parsed: ParsedGedcom,
  options: ImportGedcomOptions,
): Promise<ImportGedcomResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const payload = buildImportPayload(parsed, options);

  const { error: treeError } = await client.from('trees').insert(payload.tree);
  if (treeError) throw new Error(`Failed inserting tree: ${treeError.message}`);

  const tables: [TableName, Record<string, unknown>[]][] = [
    ['places', payload.places],
    ['individuals', payload.individuals],
    ['individual_events', payload.individualEvents],
    ['families', payload.families],
    ['family_children', payload.familyChildren],
    ['curiosities', payload.curiosities],
    ['curiosity_individuals', payload.curiosityIndividuals],
    ['sources', payload.sources],
    ['citations', payload.citations],
  ];

  const totalRows = tables.reduce((sum, [, rows]) => sum + rows.length, 0);
  let insertedRows = 0;

  for (const [table, rows] of tables) {
    await insertInBatches(client, table, rows, batchSize, (count) => {
      insertedRows += count;
      options.onProgress?.({ table, insertedRows, totalRows });
    });
  }

  // The tree row went in claiming nothing; now that every insert has succeeded,
  // record what actually landed. These are row counts, not the GEDCOM header's
  // figures — a header that overstates its own file should not become the
  // number the app shows, nor the number recount_tree is later measured against.
  const { error: countError } = await client
    .from('trees')
    .update({
      individual_count: payload.individuals.length,
      family_count: payload.families.length,
      place_count: payload.places.length,
    })
    .eq('id', payload.tree.id as string);
  if (countError) throw new Error(`Failed recording tree counts: ${countError.message}`);

  // Copy coordinates for every place string any tree has already resolved —
  // overlap is heavy, so most of the map lights up immediately. Whatever is
  // left gets picked up by the geocode-pending worker within hours. Non-fatal:
  // an import must never fail over geocoding.
  const { error: reuseError } = await client.rpc('reuse_geocodes', {
    p_tree_id: payload.tree.id as string,
  });
  if (reuseError) console.warn('Geocode reuse failed (worker will cover it):', reuseError.message);

  return { treeId: payload.tree.id as string };
}

export { buildImportPayload } from './transform.js';
export type { ImportPayload } from './transform.js';
export type { Database, Json } from './database.types.js';
export type { WitnessSupabaseClient } from './client.js';
