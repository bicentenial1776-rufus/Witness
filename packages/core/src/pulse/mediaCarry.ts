import type { IdRemap } from './carryForward.js';

/**
 * Carrying the tree's photos across a refresh.
 *
 * Media bytes come from exactly one place — the desktop overlay of a Family
 * Tree Maker export — and nothing in a refreshed GEDCOM brings them back:
 * the new file names its files but ships no bytes, and an Ancestry file
 * ships no file names at all. Before this, every refresh dropped the
 * media, media_links and media_readings rows with the old tree's cascade
 * and left the uploaded objects orphaned in the bucket (2026-09-15).
 *
 * The refreshed import already rebuilt the attachment graph — every OBJE
 * in the new file is a pending media row on the new tree, linked to the
 * right people, facts, and citations. So the carry is mostly not a move
 * at all: the old row's bytes ADOPT the new row that names the same file.
 *
 * Three tiers, most trustworthy first, each only for uploaded old rows:
 * 1. Same GEDCOM xref (FTM's @M12@ numbering is stable across its own
 *    exports), provided the two file names do not disagree.
 * 2. Same file path, then same file name — only where the value is unique
 *    on both sides; an ambiguous name matches nobody.
 * 3. No counterpart in the new file (an Ancestry export, or "Include
 *    media" left unticked). The old row is recreated on the new tree and
 *    its person-level links follow the person remap. Fact- and
 *    citation-level links have no remap yet and are dropped; a row with
 *    no link left to stand on is stranded, said out loud in the preview.
 */

export interface OldMediaRow {
  id: string;
  gedcom_xref: string;
  file_path: string | null;
  title: string | null;
  format: string | null;
  storage_path: string | null;
  byte_size: number | null;
  content_hash: string | null;
  upload_status: string;
}

export interface NewMediaRow {
  id: string;
  gedcom_xref: string;
  file_path: string | null;
  upload_status: string;
}

export interface OldMediaLink {
  media_id: string;
  individual_id: string | null;
  is_primary: boolean;
}

export interface MediaAdoption {
  old: OldMediaRow;
  /** The new tree's own row for the same file; it takes the old row's bytes. */
  newMediaId: string;
  newGedcomXref: string;
  tier: 'xref' | 'path';
}

export interface MediaRecreation {
  old: OldMediaRow;
  /**
   * The recreated row's key on the new tree: the old xref where it is free,
   * otherwise suffixed so a same-numbered but different file on the new
   * tree is never overwritten.
   */
  gedcomXref: string;
  /** Person-level links, already re-pointed onto the new tree's people. */
  links: { individual_id: string; is_primary: boolean }[];
}

export interface MediaCarryPlan {
  adopting: MediaAdoption[];
  recreating: MediaRecreation[];
  /** Uploaded old rows with nowhere to land — lost with the old tree. */
  stranded: OldMediaRow[];
  /** New rows that already hold bytes for a matched file: nothing to do. */
  alreadyComplete: number;
  tiers: { xref: number; path: number; person: number };
}

function normaliseXref(xref: string): string {
  return xref.replace(/^@+|@+$/g, '').trim().toUpperCase();
}

function normalisePath(path: string | null): string | null {
  const trimmed = path?.trim().replace(/\\/g, '/').toLowerCase();
  return trimmed ? trimmed : null;
}

function basenameOf(path: string | null): string | null {
  const normalised = normalisePath(path);
  if (!normalised) return null;
  const name = normalised.slice(normalised.lastIndexOf('/') + 1);
  return name ? name : null;
}

/** Values appearing exactly once — anything ambiguous is no key at all. */
function uniqueIndex<T>(rows: readonly T[], keyOf: (row: T) => string | null): Map<string, T> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const index = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key && counts.get(key) === 1) index.set(key, row);
  }
  return index;
}

export function isUploaded(row: { upload_status: string; storage_path: string | null }): boolean {
  return row.upload_status === 'complete' && Boolean(row.storage_path);
}

export function planMediaCarry(
  oldMedia: readonly OldMediaRow[],
  newMedia: readonly NewMediaRow[],
  oldLinks: readonly OldMediaLink[],
  remap: IdRemap,
): MediaCarryPlan {
  const uploaded = oldMedia.filter(isUploaded);
  const newXrefs = new Set(newMedia.map((row) => normaliseXref(row.gedcom_xref)));
  const newByXref = uniqueIndex(newMedia, (row) => normaliseXref(row.gedcom_xref));
  const newByPath = uniqueIndex(newMedia, (row) => normalisePath(row.file_path));
  const newByName = uniqueIndex(newMedia, (row) => basenameOf(row.file_path));
  const oldByPath = uniqueIndex(uploaded, (row) => normalisePath(row.file_path));
  const oldByName = uniqueIndex(uploaded, (row) => basenameOf(row.file_path));

  const linksByMedia = new Map<string, OldMediaLink[]>();
  for (const link of oldLinks) {
    const list = linksByMedia.get(link.media_id);
    if (list) list.push(link);
    else linksByMedia.set(link.media_id, [link]);
  }

  const plan: MediaCarryPlan = {
    adopting: [],
    recreating: [],
    stranded: [],
    alreadyComplete: 0,
    tiers: { xref: 0, path: 0, person: 0 },
  };
  const claimed = new Set<string>();

  const adopt = (old: OldMediaRow, target: NewMediaRow, tier: 'xref' | 'path'): boolean => {
    if (claimed.has(target.id)) return false;
    claimed.add(target.id);
    if (target.upload_status === 'complete') {
      plan.alreadyComplete += 1;
      return true;
    }
    plan.adopting.push({ old, newMediaId: target.id, newGedcomXref: target.gedcom_xref, tier });
    plan.tiers[tier] += 1;
    return true;
  };

  for (const old of uploaded) {
    // Tier 1: the same xref, unless the file names plainly disagree — a
    // renumbered export must not hand one person's portrait to another.
    const byXref = newByXref.get(normaliseXref(old.gedcom_xref));
    if (byXref) {
      const oldName = basenameOf(old.file_path);
      const newName = basenameOf(byXref.file_path);
      const agree = !oldName || !newName || oldName === newName;
      if (agree && adopt(old, byXref, 'xref')) continue;
    }

    // Tier 2: the same file, by full path then by name, unique on both sides.
    const path = normalisePath(old.file_path);
    const byPath = path && oldByPath.get(path) === old ? newByPath.get(path) : undefined;
    if (byPath && adopt(old, byPath, 'path')) continue;
    const name = basenameOf(old.file_path);
    const byName = name && oldByName.get(name) === old ? newByName.get(name) : undefined;
    if (byName && adopt(old, byName, 'path')) continue;

    // Tier 3: no counterpart — recreate the row where its people landed.
    const links: MediaRecreation['links'] = [];
    const seen = new Set<string>();
    for (const link of linksByMedia.get(old.id) ?? []) {
      if (!link.individual_id) continue;
      const landed = remap.map.get(link.individual_id);
      if (!landed || seen.has(landed)) continue;
      seen.add(landed);
      links.push({ individual_id: landed, is_primary: link.is_primary });
    }
    if (links.length > 0) {
      const gedcomXref = newXrefs.has(normaliseXref(old.gedcom_xref))
        ? `${old.gedcom_xref}#carried`
        : old.gedcom_xref;
      plan.recreating.push({ old, gedcomXref, links });
      plan.tiers.person += 1;
      continue;
    }

    plan.stranded.push(old);
  }

  return plan;
}

/** Where a carried object belongs: the new tree's folder, keyed by its new row. */
export function carriedStoragePath(
  userId: string,
  newTreeId: string,
  newMediaId: string,
  oldStoragePath: string,
): string {
  const match = oldStoragePath.match(/(\.[^./\\]+)$/);
  return `${userId}/${newTreeId}/${newMediaId}${match?.[1]?.toLowerCase() ?? ''}`;
}

/** "Your N photos come along." Null when there is nothing to say. */
export function photosNote(plan: MediaCarryPlan): string | null {
  const moving = plan.adopting.length + plan.recreating.length + plan.alreadyComplete;
  if (moving === 0) return null;
  const noun = moving === 1 ? 'photo' : 'photos';
  const verb = moving === 1 ? 'comes' : 'come';
  return `Your ${moving} ${noun} ${verb} along.`;
}
