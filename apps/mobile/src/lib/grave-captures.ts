import { Directory, File, Paths } from 'expo-file-system';

import { supabase } from '@/lib/supabase';

/**
 * At the Stone — capture plumbing. One capture is one stone: its photos
 * (private grave-photos bucket, under the user's folder), where the
 * reader stood, and what the read-headstone edge function made of it.
 * A cemetery has no signal as its normal condition, so captures that
 * can't upload are queued on disk and flushed when the app next finds
 * the network.
 */

export interface DivinedFacts {
  name: string | null;
  death_year: number | null;
  death_month: number | null;
  death_day: number | null;
  birth_year_carved: number | null;
  birth_year_computed: number | null;
  age_years: number | null;
  age_months: number | null;
  relationship_phrases: string[];
  military: string | null;
  epitaph: string | null;
  legibility: 'clear' | 'partial' | 'poor';
}

export interface MatchCandidate {
  individual_id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  score: number;
  reasons: string[];
}

export interface GraveCapture {
  id: string;
  tree_id: string;
  status: 'queued' | 'reading' | 'read' | 'attached' | 'lead' | 'dismissed' | 'failed';
  photo_paths: string[];
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  accuracy_m: number | null;
  captured_at: string;
  cemetery: string | null;
  transcription: string | null;
  divined: DivinedFacts | null;
  candidates: MatchCandidate[] | null;
  matched_individual_id: string | null;
}

export interface PendingStone {
  treeId: string;
  photoUris: string[];
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  accuracyM: number | null;
  capturedAt: string;
}

const QUEUE_DIR = 'grave-captures';

function queueFile(): File {
  return new File(Paths.document, QUEUE_DIR, 'queue.json');
}

async function readQueue(): Promise<PendingStone[]> {
  try {
    const file = queueFile();
    if (!file.exists) return [];
    return JSON.parse(await file.text());
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingStone[]): void {
  const dir = new Directory(Paths.document, QUEUE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  queueFile().write(JSON.stringify(queue));
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}

/** Copies the camera's temp photos somewhere that survives a relaunch. */
function persistPhotos(uris: string[]): string[] {
  const dir = new Directory(Paths.document, QUEUE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const out: string[] = [];
  for (const uri of uris) {
    const dest = new File(Paths.document, QUEUE_DIR, `${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`);
    new File(uri).copy(dest);
    out.push(dest.uri);
  }
  return out;
}

/**
 * Uploads one stone's photos, creates the capture row, and starts the
 * reading. Throws when offline — callers queue instead.
 */
async function submitStone(stone: PendingStone): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');

  const paths: string[] = [];
  for (const uri of stone.photoUris) {
    const res = await fetch(uri);
    const bytes = await res.arrayBuffer();
    const path = `${userId}/${stone.capturedAt.replace(/[:.]/g, '-')}/${paths.length}.jpg`;
    const { error } = await supabase.storage
      .from('grave-photos')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
    paths.push(path);
  }

  const { data: row, error: insertError } = await supabase
    .from('grave_captures')
    .insert({
      tree_id: stone.treeId,
      user_id: userId,
      photo_paths: paths,
      latitude: stone.latitude,
      longitude: stone.longitude,
      heading: stone.heading,
      accuracy_m: stone.accuracyM,
      captured_at: stone.capturedAt,
    })
    .select('id')
    .single();
  if (insertError) throw new Error(insertError.message);

  // The reading runs server-side; nothing waits on it here.
  supabase.functions.invoke('read-headstone', { body: { captureId: row.id } }).catch(() => {});
  return row.id as string;
}

/**
 * The capture screen's one call: try to submit now; failing that (one
 * bar and none), persist the photos and queue for later.
 */
export async function captureStone(stone: PendingStone): Promise<'submitted' | 'queued'> {
  try {
    await submitStone(stone);
    return 'submitted';
  } catch {
    const persisted = persistPhotos(stone.photoUris);
    const queue = await readQueue();
    queue.push({ ...stone, photoUris: persisted });
    writeQueue(queue);
    return 'queued';
  }
}

/** Flushes the offline queue; called when the ledger gains focus. */
export async function flushQueue(): Promise<number> {
  const queue = await readQueue();
  if (!queue.length) return 0;
  const remaining: PendingStone[] = [];
  let sent = 0;
  for (const stone of queue) {
    try {
      await submitStone(stone);
      sent += 1;
      for (const uri of stone.photoUris) {
        try {
          const f = new File(uri);
          if (f.exists) f.delete();
        } catch {
          // best-effort cleanup
        }
      }
    } catch {
      remaining.push(stone);
    }
  }
  writeQueue(remaining);
  return sent;
}

export async function listCaptures(treeId: string): Promise<GraveCapture[]> {
  const { data, error } = await supabase
    .from('grave_captures')
    .select('*')
    .eq('tree_id', treeId)
    .neq('status', 'dismissed')
    .order('captured_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as GraveCapture[];
}

/** A short-lived signed URL for a private stone photo. */
export async function photoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('grave-photos').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Re-run a failed or finished reading. */
export async function rereadCapture(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('read-headstone', { body: { captureId: id } });
  if (error) throw new Error('The reading failed — try again with signal.');
}

/**
 * The attach: this stone is that person. Marks the capture, and gives
 * the person a burial event carried by a place that arrives already
 * geocoded — the capture's own coordinates.
 */
export async function attachCapture(capture: GraveCapture, individualId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');

  let placeId: string | null = null;
  if (capture.cemetery) {
    const { data: existing } = await supabase
      .from('places')
      .select('id')
      .eq('tree_id', capture.tree_id)
      .eq('raw', capture.cemetery)
      .maybeSingle();
    if (existing) {
      placeId = existing.id as string;
    } else {
      const { data: place } = await supabase
        .from('places')
        .insert({
          tree_id: capture.tree_id,
          user_id: userId,
          raw: capture.cemetery,
          parts: capture.cemetery.split('·').map((p) => p.trim()),
          latitude: capture.latitude,
          longitude: capture.longitude,
          geocoded_at: capture.latitude != null ? new Date().toISOString() : null,
        })
        .select('id')
        .single();
      placeId = (place?.id as string) ?? null;
    }
  }

  const { data: existingBurial } = await supabase
    .from('individual_events')
    .select('id')
    .eq('individual_id', individualId)
    .eq('event_type', 'burial')
    .maybeSingle();
  if (!existingBurial) {
    await supabase.from('individual_events').insert({
      tree_id: capture.tree_id,
      user_id: userId,
      individual_id: individualId,
      event_type: 'burial',
      date_year: capture.divined?.death_year ?? null,
      detail: 'Read from the headstone',
      place_id: placeId,
      sort_order: 900,
    });
  }

  const { error } = await supabase
    .from('grave_captures')
    .update({ matched_individual_id: individualId, status: 'attached' })
    .eq('id', capture.id);
  if (error) throw new Error(error.message);
}

export async function setCaptureStatus(
  id: string,
  status: 'lead' | 'dismissed',
): Promise<void> {
  const { error } = await supabase.from('grave_captures').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}
