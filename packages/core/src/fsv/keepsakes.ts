/**
 * KEEPSAKES — what the room's picture surfaces hold (Greg's design of
 * 2026-09-16, "Keepsakes and tunes"; the seam in docs/FSV_KEEPSAKES_SEAM.md).
 *
 * Two halves. The household's OWN photographs come from the tree file's
 * media, read here by the household's member ids and signed for the room
 * (nothing else lists media by household). What the file cannot fill —
 * news, place, papers — comes from the fsv-keepsakes edge function, cached
 * by kind, place and decade. Both are handed to the room page as one
 * object, `FsvKeepsakes`, and the page decides what hangs where.
 */

import type { WitnessSupabaseClient } from '../supabase/client.js';
import type { FsvHouseholdRecord } from './household.js';

/** One of the household's own pictures, signed for the room. */
export interface FsvPortraitKeepsake {
  /** The individual (the record's person id) the picture is attached to. */
  pid: string;
  url: string;
  title: string | null;
  /** The file marked this the person's primary picture. */
  primary: boolean;
}

/** Material from the time and place — what fsv-keepsakes returns. */
export interface FsvTimeKeepsake {
  title: string;
  date: string | null;
  image: string;
  thumb: string;
  url: string;
  provider: string;
  note: 'from the time';
}

export interface FsvKeepsakes {
  portrait: FsvPortraitKeepsake[];
  news?: FsvTimeKeepsake[];
  place?: FsvTimeKeepsake[];
  papers?: FsvTimeKeepsake[];
}

export const FSV_KEEPSAKE_KINDS = ['news', 'place', 'papers'] as const;
export type FsvKeepsakeKind = (typeof FSV_KEEPSAKE_KINDS)[number];

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff']);
const MAX_PORTRAITS = 12;
const MAX_PER_PERSON = 3;

/**
 * The household's own photographs: media linked to any member, complete
 * in Storage and an image, primary pictures first, at most a few per
 * person, signed for an hour. Empty for a living household — the room
 * never sees the living, and neither should their pictures.
 */
export async function fsvHouseholdPortraits(
  client: WitnessSupabaseClient,
  treeId: string,
  record: FsvHouseholdRecord,
  ttlSeconds = 3600,
): Promise<FsvPortraitKeepsake[]> {
  if (record.living) return [];
  const pids = record.members.map(([pid]) => pid);
  if (pids.length === 0) return [];

  const { data, error } = await client
    .from('media_links')
    .select('individual_id, is_primary, media(id, title, storage_path, upload_status, format)')
    .eq('tree_id', treeId)
    .in('individual_id', pids)
    .order('is_primary', { ascending: false })
    .limit(MAX_PORTRAITS * 4);
  if (error || !data) return [];

  type MediaRow = { id: string; title: string | null; storage_path: string | null; upload_status: string; format: string | null };
  const perPerson = new Map<string, number>();
  const seen = new Set<string>();
  const chosen: { pid: string; media: MediaRow; primary: boolean }[] = [];
  for (const link of data) {
    const media = (Array.isArray(link.media) ? link.media[0] : link.media) as MediaRow | null;
    const pid = link.individual_id as string | null;
    if (!media || !pid || seen.has(media.id)) continue;
    if (media.upload_status !== 'complete' || !media.storage_path) continue;
    if (!IMAGE_FORMATS.has((media.format ?? '').toLowerCase())) continue;
    if ((perPerson.get(pid) ?? 0) >= MAX_PER_PERSON) continue;
    seen.add(media.id);
    perPerson.set(pid, (perPerson.get(pid) ?? 0) + 1);
    chosen.push({ pid, media, primary: Boolean(link.is_primary) });
    if (chosen.length >= MAX_PORTRAITS) break;
  }

  const signed = await Promise.all(
    chosen.map(async ({ pid, media, primary }) => {
      const { data: s } = await client.storage.from('tree-media').createSignedUrl(media.storage_path!, ttlSeconds);
      return s?.signedUrl ? { pid, url: s.signedUrl, title: media.title, primary } : null;
    }),
  );
  return signed.filter((p): p is FsvPortraitKeepsake => p !== null);
}

/** Where and when the room stands — the chosen day, else the record's own place and year. */
export function fsvKeepsakePlace(
  record: FsvHouseholdRecord,
  dayIndex = 0,
): { town: string; state: string | null; county: string | null; country: string | null; year: number } | null {
  if (record.living) return null;
  const day = record.days[dayIndex] ?? record.days.find((d) => !d.thin) ?? record.days[0];
  if (day?.town && day.year) {
    return { town: day.town, state: day.state, county: day.county, country: day.country, year: day.year };
  }
  if (record.place && record.year) {
    const parts = record.place.split(',').map((p) => p.trim()).filter(Boolean);
    return {
      town: parts[0]!,
      state: parts.length >= 3 ? parts[parts.length - 2]! : null,
      county: parts.length >= 4 ? parts[1]! : null,
      country: parts[parts.length - 1] ?? null,
      year: record.year,
    };
  }
  return null;
}
