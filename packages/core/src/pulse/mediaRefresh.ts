import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { IdRemap } from './carryForward.js';
import {
  carriedStoragePath,
  planMediaCarry,
  type MediaCarryPlan,
  type NewMediaRow,
  type OldMediaLink,
  type OldMediaRow,
} from './mediaCarry.js';

/**
 * The database and bucket side of the photo carry (mediaCarry.ts plans it).
 *
 * Order matters, and every step is safe to repeat:
 * 1. Readings move first, onto the row the reader will find them under.
 *    The read-media worker only touches complete uploads, so moving a
 *    reading before its row turns complete means the worker can never
 *    race in and mint a second reading for the same file.
 * 2. Adopted rows take the old row's bytes by upsert on (tree_id,
 *    gedcom_xref) — the storage path still names the OLD tree's folder
 *    at this point. If anything after this fails, the old tree is still
 *    standing and both trees read the same object.
 * 3. Recreated rows are inserted with their person-level links.
 * 4. Only once the old tree is gone are the objects moved into the new
 *    tree's folder (moveCarriedObjects). A move that fails is not a loss:
 *    the row keeps its old path, which the owner can still read. Family
 *    members cannot, because the bucket's sharing policy gates on the
 *    tree id in the path — that is why the move exists, and why a
 *    leftover is reported rather than swallowed.
 */

const BUCKET = 'tree-media';
const PAGE = 1000;
const WRITE_BATCH = 200;
/** Ids in a query string, not a body: kept small so the URL stays short. */
const IN_BATCH = 50;
const MOVE_BATCH = 12;

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read ${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export interface MediaCarryables {
  oldMedia: OldMediaRow[];
  newMedia: NewMediaRow[];
  oldLinks: OldMediaLink[];
}

/** Only what the plan needs: uploaded old rows, their person links, the new tree's rows. */
export async function fetchMediaCarryables(
  supabase: WitnessSupabaseClient,
  oldTreeId: string,
  newTreeId: string,
): Promise<MediaCarryables> {
  const [oldMedia, newMedia, oldLinks] = await Promise.all([
    fetchAll<OldMediaRow>(
      (from, to) =>
        supabase
          .from('media')
          .select(
            'id, gedcom_xref, file_path, title, format, storage_path, byte_size, content_hash, upload_status',
          )
          .eq('tree_id', oldTreeId)
          .eq('upload_status', 'complete')
          .order('id')
          .range(from, to),
      'the old tree’s photos',
    ),
    fetchAll<NewMediaRow>(
      (from, to) =>
        supabase
          .from('media')
          .select('id, gedcom_xref, file_path, upload_status')
          .eq('tree_id', newTreeId)
          .order('id')
          .range(from, to),
      'the new tree’s photos',
    ),
    fetchAll<OldMediaLink>(
      (from, to) =>
        supabase
          .from('media_links')
          .select('media_id, individual_id, is_primary')
          .eq('tree_id', oldTreeId)
          .not('individual_id', 'is', null)
          .order('id')
          .range(from, to),
      'the old tree’s photo links',
    ),
  ]);
  return { oldMedia, newMedia, oldLinks };
}

export function planMediaRefresh(carryables: MediaCarryables, remap: IdRemap): MediaCarryPlan {
  return planMediaCarry(carryables.oldMedia, carryables.newMedia, carryables.oldLinks, remap);
}

function chunks<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function moveReadings(
  supabase: WitnessSupabaseClient,
  pairs: readonly { oldMediaId: string; newMediaId: string }[],
  oldTreeId: string,
  newTreeId: string,
): Promise<void> {
  if (pairs.length === 0) return;
  const oldIds = pairs.map((p) => p.oldMediaId);
  const readings: { id: string; media_id: string }[] = [];
  for (const batch of chunks(oldIds, IN_BATCH)) {
    const { data, error } = await supabase
      .from('media_readings')
      .select('id, media_id')
      .eq('tree_id', oldTreeId)
      .in('media_id', batch);
    if (error) throw new Error(`Could not read the photo readings: ${error.message}`);
    readings.push(...(data ?? []));
  }
  const newByOld = new Map(pairs.map((p) => [p.oldMediaId, p.newMediaId]));
  for (const reading of readings) {
    const newMediaId = newByOld.get(reading.media_id);
    if (!newMediaId) continue;
    // A retried refresh may already have moved a reading onto this row;
    // unique (media_id) would refuse the second — clear it first, then
    // move. The reading being moved is the one with the reader's verdict.
    const { error: clearError } = await supabase
      .from('media_readings')
      .delete()
      .eq('tree_id', newTreeId)
      .eq('media_id', newMediaId);
    if (clearError) throw new Error(`Could not clear a duplicate photo reading: ${clearError.message}`);
    const { error } = await supabase
      .from('media_readings')
      .update({ tree_id: newTreeId, media_id: newMediaId })
      .eq('id', reading.id);
    if (error) throw new Error(`Could not move a photo reading: ${error.message}`);
  }
}

export interface MediaCarryResult {
  adopted: number;
  recreated: number;
}

/**
 * Write the plan: readings, then adopted bytes, then recreated rows. The
 * objects stay in the old tree's folder until moveCarriedObjects.
 */
export async function applyMediaCarry(
  supabase: WitnessSupabaseClient,
  plan: MediaCarryPlan,
  userId: string,
  oldTreeId: string,
  newTreeId: string,
): Promise<MediaCarryResult> {
  // 1. Readings, before any row turns complete.
  await moveReadings(
    supabase,
    plan.adopting.map((a) => ({ oldMediaId: a.old.id, newMediaId: a.newMediaId })),
    oldTreeId,
    newTreeId,
  );

  // 2. Adopted rows take the bytes. Upsert on the natural key sets only the
  //    columns named here; the new file's own title, format and path stay.
  for (const batch of chunks(plan.adopting, WRITE_BATCH)) {
    const rows = batch.map((a) => ({
      tree_id: newTreeId,
      user_id: userId,
      gedcom_xref: a.newGedcomXref,
      storage_path: a.old.storage_path,
      byte_size: a.old.byte_size,
      content_hash: a.old.content_hash,
      upload_status: 'complete',
    }));
    const { error } = await supabase
      .from('media')
      .upsert(rows, { onConflict: 'tree_id,gedcom_xref' });
    if (error) throw new Error(`Could not carry the photos: ${error.message}`);
  }

  // 3. Rows with no counterpart in the new file: recreate, then link. The
  //    natural key keeps a retry from doubling them; a row already there
  //    (from an earlier attempt) is adopted by its xref instead.
  let recreated = 0;
  for (const batch of chunks(plan.recreating, WRITE_BATCH)) {
    const { data: inserted, error } = await supabase
      .from('media')
      .upsert(
        batch.map((r) => ({
          tree_id: newTreeId,
          user_id: userId,
          gedcom_xref: r.gedcomXref,
          file_path: r.old.file_path,
          title: r.old.title,
          format: r.old.format,
          storage_path: r.old.storage_path,
          byte_size: r.old.byte_size,
          content_hash: r.old.content_hash,
          upload_status: 'complete',
        })),
        { onConflict: 'tree_id,gedcom_xref' },
      )
      .select('id, gedcom_xref');
    if (error) throw new Error(`Could not recreate the photos: ${error.message}`);
    const idByXref = new Map((inserted ?? []).map((row) => [row.gedcom_xref, row.id]));
    const links = batch.flatMap((r) => {
      const media_id = idByXref.get(r.gedcomXref);
      if (!media_id) return [];
      return r.links.map((l) => ({
        tree_id: newTreeId,
        user_id: userId,
        media_id,
        individual_id: l.individual_id,
        is_primary: l.is_primary,
      }));
    });
    if (links.length > 0) {
      // A retry finds its own links from last time; skip those pairs.
      const have = new Set<string>();
      for (const ids of chunks([...idByXref.values()], IN_BATCH)) {
        const { data: existing, error: existingError } = await supabase
          .from('media_links')
          .select('media_id, individual_id')
          .eq('tree_id', newTreeId)
          .in('media_id', ids);
        if (existingError) throw new Error(`Could not read the photo links: ${existingError.message}`);
        for (const l of existing ?? []) have.add(`${l.media_id}|${l.individual_id}`);
      }
      const fresh = links.filter((l) => !have.has(`${l.media_id}|${l.individual_id}`));
      if (fresh.length > 0) {
        const { error: linkError } = await supabase.from('media_links').insert(fresh);
        if (linkError) throw new Error(`Could not link the recreated photos: ${linkError.message}`);
      }
    }
    await moveReadings(
      supabase,
      batch.flatMap((r) => {
        const newMediaId = idByXref.get(r.gedcomXref);
        return newMediaId ? [{ oldMediaId: r.old.id, newMediaId }] : [];
      }),
      oldTreeId,
      newTreeId,
    );
    recreated += inserted?.length ?? 0;
  }

  return { adopted: plan.adopting.length, recreated };
}

export interface MoveProgress {
  done: number;
  total: number;
}

export interface MoveResult {
  moved: number;
  /** Objects still in the old tree's folder; the owner can read them, family members cannot. */
  leftBehind: number;
  /** Old-folder objects no row references any more (stranded photos, superseded uploads). */
  discarded: number;
}

/**
 * Bring every carried object into the new tree's folder, then clear what
 * the old folder still holds that no row points at. Idempotent and
 * self-describing: the rows to move are the new tree's own complete rows
 * whose path is not yet under its folder, so a second run after a failure
 * picks up exactly what the first left. Call only once the old tree's rows
 * are gone (the You-screen rule for the bucket): the old folder is swept
 * of everything except objects a new row still reads from there.
 */
export async function moveCarriedObjects(
  supabase: WitnessSupabaseClient,
  userId: string,
  oldTreeId: string,
  newTreeId: string,
  onProgress?: (progress: MoveProgress) => void,
): Promise<MoveResult> {
  const prefix = `${userId}/${newTreeId}/`;
  const rows = (
    await fetchAll<{ id: string; gedcom_xref: string; storage_path: string | null }>(
      (from, to) =>
        supabase
          .from('media')
          .select('id, gedcom_xref, storage_path')
          .eq('tree_id', newTreeId)
          .eq('upload_status', 'complete')
          .order('id')
          .range(from, to),
      'the carried photos',
    )
  ).filter((row) => row.storage_path && !row.storage_path.startsWith(prefix));

  let moved = 0;
  let leftBehind = 0;
  const stillRead = new Set<string>();
  onProgress?.({ done: 0, total: rows.length });
  for (const batch of chunks(rows, MOVE_BATCH)) {
    const landed = await Promise.all(
      batch.map(async (row) => {
        const to = carriedStoragePath(userId, newTreeId, row.id, row.storage_path!);
        const { error } = await supabase.storage.from(BUCKET).move(row.storage_path!, to);
        if (!error) return { row, to };
        // Already there from an interrupted earlier run: the row just
        // needs to say so.
        if (/not found/i.test(error.message)) {
          const { data } = await supabase.storage
            .from(BUCKET)
            .list(prefix.slice(0, -1), { search: row.id, limit: 1 });
          if (data?.some((entry) => `${prefix}${entry.name}` === to)) return { row, to };
        }
        console.warn(`Photo left in the old folder (${row.storage_path}): ${error.message}`);
        return null;
      }),
    );
    const updates = landed.filter((l): l is { row: (typeof rows)[number]; to: string } => l !== null);
    const landedIds = new Set(updates.map((u) => u.row.id));
    for (const row of batch) if (!landedIds.has(row.id)) stillRead.add(row.storage_path!);
    if (updates.length > 0) {
      const { error } = await supabase.from('media').upsert(
        updates.map(({ row, to }) => ({
          tree_id: newTreeId,
          user_id: userId,
          gedcom_xref: row.gedcom_xref,
          storage_path: to,
        })),
        { onConflict: 'tree_id,gedcom_xref' },
      );
      if (error) throw new Error(`Could not record the moved photos: ${error.message}`);
    }
    moved += updates.length;
    leftBehind += batch.length - updates.length;
    onProgress?.({ done: moved + leftBehind, total: rows.length });
  }

  // The bucket has no cascade from trees. What the old folder still holds
  // is a stranded photo's object or an upload the new tree's own bytes
  // superseded — paid for and unreachable, unless a new row still reads
  // it from there because its move failed. Sweep everything else.
  let discarded = 0;
  try {
    const folder = `${userId}/${oldTreeId}`;
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: PAGE });
      if (error) throw new Error(error.message);
      const paths = (data ?? [])
        .filter((entry) => entry.id)
        .map((entry) => `${folder}/${entry.name}`)
        .filter((path) => !stillRead.has(path));
      if (paths.length === 0) break;
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
      if (removeError) throw new Error(removeError.message);
      discarded += paths.length;
      if ((data ?? []).length < PAGE) break;
    }
  } catch (error) {
    console.warn('Old tree photos left behind:', error instanceof Error ? error.message : error);
  }
  return { moved, leftBehind, discarded };
}
