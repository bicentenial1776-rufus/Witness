/**
 * Shared between the two Family Tree Maker media CLIs: finding a
 * GEDCOM's FILE references inside the exported Media folder, choosing
 * which to send, and moving the bytes into the private tree-media bucket.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, normalize, relative, sep } from 'node:path';
import type { buildImportPayload } from '../../src/supabase/transform.js';
import type { createWitnessClient } from '../../src/supabase/client.js';

export type MediaRow = ReturnType<typeof buildImportPayload>['media'][number];
export type UploadProfile = 'primary' | 'images' | 'all';

/**
 * Every file under the Media folder, keyed two ways: by the path relative
 * to the folder (exact) and by bare basename (fallback for GEDCOMs whose
 * FILE lines point at a machine that isn't this one). FTM folders are
 * flat in practice, but a basename shared across subfolders is ambiguous,
 * so the basename key is dropped rather than guessed — the exact key
 * still resolves it.
 */
export interface MediaFiles {
  byRelative: Map<string, string>;
  byBasename: Map<string, string>;
  ambiguousBasenames: number;
}

export function filesUnder(root: string): MediaFiles {
  const byRelative = new Map<string, string>();
  const byBasename = new Map<string, string>();
  const ambiguous = new Set<string>();
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        byRelative.set(relative(root, path).normalize('NFC'), path);
        const key = entry.name.normalize('NFC');
        if (byBasename.has(key)) ambiguous.add(key);
        else byBasename.set(key, path);
      }
    }
  };
  visit(root);
  for (const key of ambiguous) byBasename.delete(key);
  return { byRelative, byBasename, ambiguousBasenames: ambiguous.size };
}

function basenameOf(filePath: string | undefined): string | undefined {
  return filePath ? basename(normalize(filePath)).normalize('NFC') : undefined;
}

/**
 * The GEDCOM's FILE path, re-rooted onto the Media folder we were given:
 * FTM writes absolute paths, and the folder may have moved since export.
 */
export function locate(filePath: string | null | undefined, mediaDir: string, files: MediaFiles): string | undefined {
  if (!filePath) return undefined;
  const normalized = normalize(filePath).normalize('NFC');
  const marker = basename(mediaDir).normalize('NFC') + sep;
  const at = normalized.lastIndexOf(marker);
  if (at >= 0) {
    const rel = normalized.slice(at + marker.length);
    const exact = files.byRelative.get(rel);
    if (exact) return exact;
  }
  return files.byBasename.get(basenameOf(normalized) ?? '');
}

export function isImage(filePath: string | null | undefined): boolean {
  return /\.(jpe?g|png|gif|webp)$/i.test(filePath ?? '');
}

/** Prints the scan and returns gedcom_xref → local path for the selected files. */
export function printScan(
  mediaRows: MediaRow[],
  files: MediaFiles,
  mediaDir: string,
  profile: UploadProfile,
  primaryMediaIds: Set<string>,
): Map<string, string> {
  let matched = 0;
  let missing = 0;
  let bytes = 0;
  const matchedPaths = new Map<string, string>();
  for (const row of mediaRows) {
    const source = locate(row.file_path, mediaDir, files);
    if (!source) {
      missing += 1;
      continue;
    }
    const selected =
      profile === 'all' ||
      (profile === 'images' && isImage(row.file_path)) ||
      (profile === 'primary' && primaryMediaIds.has(row.id!));
    if (selected) {
      matched += 1;
      bytes += statSync(source).size;
      matchedPaths.set(row.gedcom_xref, source);
    }
  }
  const referenced = new Set(
    mediaRows.map((row) => locate(row.file_path, mediaDir, files)).filter((path): path is string => Boolean(path)),
  );
  const unreferenced = [...files.byRelative.values()].filter((path) => !referenced.has(path)).length;
  console.log(`Media rows: ${mediaRows.length}`);
  console.log(`Selected files: ${matched}`);
  console.log(`Missing files: ${missing}`);
  console.log(`Unreferenced files: ${unreferenced}`);
  if (files.ambiguousBasenames > 0) {
    console.log(`Ambiguous basenames (matched by exact path only): ${files.ambiguousBasenames}`);
  }
  console.log(`Matched bytes: ${(bytes / 1_000_000_000).toFixed(2)} GB`);
  return matchedPaths;
}

export function contentType(path: string): string {
  const extension = extname(path).toLowerCase();
  return (
    {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.txt': 'text/plain',
    }[extension] ?? 'application/octet-stream'
  );
}

/**
 * Uploads the selected files for a tree whose media rows already exist,
 * matching rows by gedcom_xref (ids differ between a dry-run payload and
 * the database). Rows already complete are skipped, so this resumes.
 */
export async function uploadMedia(
  client: ReturnType<typeof createWitnessClient>,
  userId: string,
  treeId: string,
  matchedPaths: Map<string, string>,
): Promise<void> {
  const rows: { id: string; gedcom_xref: string; upload_status: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error: selectError } = await client
      .from('media')
      .select('id, gedcom_xref, upload_status')
      .eq('tree_id', treeId)
      .range(offset, offset + 999);
    if (selectError) throw new Error(`Could not read imported media rows: ${selectError.message}`);
    rows.push(...(page ?? []));
    if (!page || page.length < 1000) break;
  }

  const rowByXref = new Map(rows.map((row) => [row.gedcom_xref, row]));
  let uploaded = 0;
  let missingRow = 0;
  let alreadyComplete = 0;
  let failed = 0;
  for (const [xref, source] of matchedPaths) {
    const row = rowByXref.get(xref);
    if (!row) {
      missingRow += 1;
      continue;
    }
    if (row.upload_status === 'complete') {
      alreadyComplete += 1;
      continue;
    }
    const bytes = readFileSync(source);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const storagePath = `${userId}/${treeId}/${row.id}${extname(source).toLowerCase()}`;
    const { error: uploadError } = await client.storage
      .from('tree-media')
      .upload(storagePath, bytes, { contentType: contentType(source), upsert: false });
    if (uploadError && !/already exists/i.test(uploadError.message)) {
      // One bad file must not abandon the other six hundred; the row stays
      // pending and the next run picks it up.
      failed += 1;
      console.warn(`Upload failed for ${source}: ${uploadError.message}`);
      continue;
    }
    const { error: updateError } = await client
      .from('media')
      .update({
        storage_path: storagePath,
        byte_size: bytes.byteLength,
        content_hash: hash,
        upload_status: 'complete',
      })
      .eq('id', row.id)
      .eq('tree_id', treeId);
    if (updateError) throw new Error(`Metadata update failed for ${source}: ${updateError.message}`);
    uploaded += 1;
    if (uploaded % 25 === 0) console.log(`Uploaded ${uploaded}/${matchedPaths.size}`);
  }
  console.log(
    `Upload complete: ${uploaded} uploaded, ${failed} failed, ` +
      `${alreadyComplete} already complete, ${missingRow} without a media row.`,
  );
}
