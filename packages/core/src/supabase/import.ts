import type { ParsedGedcom } from '../gedcom/index.js';
import type { WitnessSupabaseClient } from './client.js';
import type { Database } from './database.types.js';
import { buildImportPayload, type BuildImportPayloadOptions } from './transform.js';

const DEFAULT_BATCH_SIZE = 500;
const MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_MS = 1000;
// Import heartbeat interval — see heartbeat() in importParsedGedcom.
const HEARTBEAT_MS = 20_000;

type TableName = keyof Database['public']['Tables'];

interface RequestFailure {
  message: string;
  code?: string;
  status?: number;
  attempts: number;
}

// Postgres: statement timeout, serialization/deadlock retries, connection
// loss. Gateway: rate limiting and the 5xx family. Network: fetch never got
// an answer (status 0 and a message like "fetch failed: The network
// connection was lost", which is what a phone on a weak signal reports).
const RETRYABLE_CODES = new Set(['57014', '40001', '40P01', '53300', '08000', '08003', '08006']);
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const NETWORK_MESSAGE = /fetch failed|failed to fetch|network|load failed|timed? ?out|ECONN|socket/i;

function isTransient(failure: RequestFailure): boolean {
  return (
    (failure.code !== undefined && RETRYABLE_CODES.has(failure.code)) ||
    (failure.status !== undefined && RETRYABLE_STATUS.has(failure.status)) ||
    NETWORK_MESSAGE.test(failure.message)
  );
}

// A batch the database could not finish inside its statement timeout, or the
// gateway would not accept at all, is a batch to send in smaller pieces —
// resending it whole would only time out again.
function isOversized(failure: RequestFailure): boolean {
  return failure.code === '57014' || failure.status === 413;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RequestResult = { error: { message: string; code?: string } | null; status?: number };

/** Runs a request, retrying transient failures with exponential backoff. */
async function attempt(
  run: () => PromiseLike<RequestResult>,
  retryDelayMs: number,
  retryable: (failure: RequestFailure) => boolean = isTransient,
): Promise<RequestFailure | null> {
  for (let n = 1; ; n++) {
    const { error, status } = await run();
    if (!error) return null;
    const failure: RequestFailure = { message: error.message, code: error.code, status, attempts: n };
    if (!retryable(failure) || n >= MAX_ATTEMPTS) return failure;
    await sleep(retryDelayMs * 2 ** (n - 1));
  }
}

function describe(failure: RequestFailure): string {
  return failure.attempts > 1
    ? `${failure.message} (after ${failure.attempts} attempts)`
    : failure.message;
}

/**
 * An import that stopped part-way. The tree row exists and every row that
 * landed points at it; the caller decides what to do with them (mark the
 * tree failed, offer a delete). Carries where it stopped so the failure
 * event can say "citations, at 80%" rather than just "failed".
 */
export class GedcomImportError extends Error {
  readonly treeId: string;
  readonly table: TableName;
  readonly insertedRows: number;
  readonly totalRows: number;

  constructor(
    message: string,
    details: { treeId: string; table: TableName; insertedRows: number; totalRows: number },
  ) {
    super(message);
    this.name = 'GedcomImportError';
    this.treeId = details.treeId;
    this.table = details.table;
    this.insertedRows = details.insertedRows;
    this.totalRows = details.totalRows;
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
  /** Base delay between retries; each retry doubles it. Tests pass 0. */
  retryDelayMs?: number;
  onProgress?: (progress: ImportProgress) => void;
}

export interface ImportGedcomResult {
  treeId: string;
}

/**
 * Writes a parsed GEDCOM into Supabase. Inserts in FK-safe order: trees,
 * places, individuals, individual_events, individual_notes, families,
 * family_children, curiosities, curiosity_individuals, sources, citations,
 * media, media_links.
 * Every insert relies on RLS — the passed-in client must be authenticated as
 * the owning user (or use a service-role client that bypasses RLS, e.g. for
 * background jobs).
 *
 * Each batch is an upsert that ignores duplicates, so a batch the server
 * committed but the client never heard back about is safe to send again.
 * A transient failure is retried with backoff; a batch the database cannot
 * finish in time is split and resent in halves. Only an error that survives
 * that stops the import, as a GedcomImportError naming where it stopped.
 *
 * Not idempotent across calls: each call creates a new `trees` row, stamped
 * `import_status: 'importing'` until the last row lands and 'complete' after.
 * A tree left at 'importing' — or marked 'failed' by the caller — is a
 * partial import and nothing in the app should treat it as a real tree.
 */
export async function importParsedGedcom(
  client: WitnessSupabaseClient,
  parsed: ParsedGedcom,
  options: ImportGedcomOptions,
): Promise<ImportGedcomResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const payload = buildImportPayload(parsed, options);
  const treeId = payload.tree.id as string;

  const treeFailure = await attempt(() => client.from('trees').insert(payload.tree), retryDelayMs);
  if (treeFailure) throw new Error(`Failed inserting tree: ${describe(treeFailure)}`);

  const tables: [TableName, Record<string, unknown>[]][] = [
    ['places', payload.places],
    ['individuals', payload.individuals],
    ['individual_events', payload.individualEvents],
    ['individual_notes', payload.individualNotes],
    ['families', payload.families],
    ['family_children', payload.familyChildren],
    ['curiosities', payload.curiosities],
    ['curiosity_individuals', payload.curiosityIndividuals],
    ['sources', payload.sources],
    ['citations', payload.citations],
    ['media', payload.media],
    ['media_links', payload.mediaLinks],
  ];

  const totalRows = tables.reduce((sum, [, rows]) => sum + rows.length, 0);
  let insertedRows = 0;

  const stoppedAt = (table: TableName, message: string) =>
    new GedcomImportError(message, { treeId, table, insertedRows, totalRows });

  // A heartbeat on the tree row while rows land, so the server's delete guard
  // (delete_tree_batch, migration 20260917220000) can tell an import that is
  // running from one that died. Fire-and-forget and never fatal: the import
  // must not stop over its own progress note.
  let lastHeartbeat = Date.now();
  function heartbeat(): void {
    if (Date.now() - lastHeartbeat < HEARTBEAT_MS) return;
    lastHeartbeat = Date.now();
    void client
      .from('trees')
      .update({ import_heartbeat_at: new Date().toISOString() })
      .eq('id', treeId)
      .then(
        ({ error }) => {
          if (error) console.warn('Import heartbeat failed:', error.message);
        },
        () => {},
      );
  }

  async function insertBatch(table: TableName, rows: Record<string, unknown>[]): Promise<void> {
    const failure = await attempt(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (client.from(table) as any).upsert(rows, { ignoreDuplicates: true }),
      retryDelayMs,
      (f) => isTransient(f) && !isOversized(f),
    );
    if (!failure) {
      insertedRows += rows.length;
      options.onProgress?.({ table, insertedRows, totalRows });
      heartbeat();
      return;
    }
    if (isOversized(failure) && rows.length > 1) {
      const half = Math.ceil(rows.length / 2);
      await insertBatch(table, rows.slice(0, half));
      await insertBatch(table, rows.slice(half));
      return;
    }
    throw stoppedAt(
      table,
      `Failed inserting into ${table} (batch of ${rows.length}): ${describe(failure)}`,
    );
  }

  for (const [table, rows] of tables) {
    for (let i = 0; i < rows.length; i += batchSize) {
      await insertBatch(table, rows.slice(i, i + batchSize));
    }
  }

  // The tree row went in claiming nothing; now that every insert has succeeded,
  // record what actually landed. These are row counts, not the GEDCOM header's
  // figures — a header that overstates its own file should not become the
  // number the app shows, nor the number recount_tree is later measured against.
  const countFailure = await attempt(
    () =>
      client
        .from('trees')
        .update({
          individual_count: payload.individuals.length,
          family_count: payload.families.length,
          place_count: payload.places.length,
          import_status: 'complete',
        })
        .eq('id', treeId),
    retryDelayMs,
  );
  if (countFailure) {
    throw stoppedAt('trees', `Failed recording tree counts: ${describe(countFailure)}`);
  }

  // Copy coordinates for every place string any tree has already resolved —
  // overlap is heavy, so most of the map lights up immediately. Whatever is
  // left gets picked up by the geocode-pending worker within hours. Non-fatal:
  // an import must never fail over geocoding.
  const { error: reuseError } = await client.rpc('reuse_geocodes', { p_tree_id: treeId });
  if (reuseError) console.warn('Geocode reuse failed (worker will cover it):', reuseError.message);

  return { treeId };
}

export { buildImportPayload } from './transform.js';
export type { ImportPayload } from './transform.js';
export type { Database, Json } from './database.types.js';
export type { WitnessSupabaseClient } from './client.js';
