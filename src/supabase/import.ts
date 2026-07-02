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
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from(table) as any).insert(batch);
    if (error) {
      throw new Error(`Failed inserting into ${table} (batch of ${batch.length}): ${error.message}`);
    }
  }
}

export interface ImportGedcomOptions extends BuildImportPayloadOptions {
  batchSize?: number;
}

export interface ImportGedcomResult {
  treeId: string;
}

/**
 * Writes a parsed GEDCOM into Supabase. Inserts in FK-safe order: trees,
 * places, individuals, individual_events, families, family_children,
 * curiosities, curiosity_individuals. Every insert relies on RLS — the
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

  await insertInBatches(client, 'places', payload.places, batchSize);
  await insertInBatches(client, 'individuals', payload.individuals, batchSize);
  await insertInBatches(client, 'individual_events', payload.individualEvents, batchSize);
  await insertInBatches(client, 'families', payload.families, batchSize);
  await insertInBatches(client, 'family_children', payload.familyChildren, batchSize);
  await insertInBatches(client, 'curiosities', payload.curiosities, batchSize);
  await insertInBatches(client, 'curiosity_individuals', payload.curiosityIndividuals, batchSize);

  return { treeId: payload.tree.id as string };
}

export { buildImportPayload } from './transform.js';
export type { ImportPayload } from './transform.js';
