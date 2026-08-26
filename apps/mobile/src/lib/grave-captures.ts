import { Directory, File, Paths } from 'expo-file-system';

import { invalidateRelationshipCache } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

/**
 * At the Stone — capture plumbing. One capture is one stone: its photos
 * (private grave-photos bucket, under the user's folder), where the
 * reader stood, and what the read-headstone edge function made of it.
 * A cemetery has no signal as its normal condition, so captures that
 * can't upload are queued on disk and flushed when the app next finds
 * the network.
 */

/** A tree person one of the stone's kinship phrases points at. */
export interface KinAnchor {
  hint: string;
  role: 'spouse' | 'parent';
  individual_id: string;
  full_name: string;
}

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
  /** From the phrase itself: "wife of" → F, "son of" → M. */
  sex_hint?: 'F' | 'M' | null;
  anchors?: KinAnchor[];
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

/** Re-run only the tree matching — free, for after the tree changes. */
export async function rescoreCapture(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('read-headstone', {
    body: { captureId: id, rescoreOnly: true },
  });
  if (error) throw new Error('The re-check failed — try again with signal.');
}

/** The attached stones on a person, for the Portrait's stone block. */
export async function capturesForPerson(individualId: string): Promise<GraveCapture[]> {
  const { data } = await supabase
    .from('grave_captures')
    .select('*')
    .eq('matched_individual_id', individualId)
    .eq('status', 'attached');
  return (data ?? []) as GraveCapture[];
}

/** The Find A Grave search for this stone — the research road-back. */
export function findAGraveUrl(capture: GraveCapture): string {
  const name = capture.divined?.name?.trim() ?? '';
  const tokens = name.split(/\s+/);
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : name;
  const first = tokens.length > 1 ? tokens[0] : '';
  const params = new URLSearchParams();
  if (first) params.set('firstname', first);
  if (last) params.set('lastname', last);
  if (capture.divined?.death_year) params.set('deathyear', String(capture.divined.death_year));
  return `https://www.findagrave.com/memorial/search?${params.toString()}`;
}

/** A compact research brief assembled from what the stone itself says. */
export function leadBrief(capture: GraveCapture): string {
  const d = capture.divined;
  if (!d) return 'The stone could not be read.';
  const bits: string[] = [];
  if (d.death_year) {
    bits.push(
      `Died ${d.death_month ? `${d.death_month}/${d.death_day ?? '?'}/` : ''}${d.death_year}${d.age_years !== null ? `, aged ${d.age_years}` : ''}${d.birth_year_computed !== null && d.birth_year_carved === null ? ` — so born about ${d.birth_year_computed}` : ''}.`,
    );
  }
  for (const phrase of d.relationship_phrases ?? []) bits.push(`The stone says "${phrase}".`);
  if (d.military) bits.push(`Service line: ${d.military}.`);
  if (capture.cemetery) bits.push(`The stone stands at ${capture.cemetery}.`);
  bits.push('Not matched to anyone in your tree yet.');
  return bits.join(' ');
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

  // GEDCOM exports often carry a bare BURI tag — a burial event with no
  // date and no place. The stone fills it in; only a burial that already
  // says something is left alone.
  const { data: existingBurial } = await supabase
    .from('individual_events')
    .select('id, date_year, place_id')
    .eq('individual_id', individualId)
    .eq('event_type', 'burial')
    .limit(1)
    .maybeSingle();
  if (!existingBurial) {
    const { error: eventError } = await supabase.from('individual_events').insert({
      tree_id: capture.tree_id,
      user_id: userId,
      individual_id: individualId,
      event_type: 'burial',
      date_year: capture.divined?.death_year ?? null,
      detail: 'Read from the headstone',
      place_id: placeId,
      sort_order: 900,
    });
    if (eventError) throw new Error(`The burial event failed: ${eventError.message}`);
  } else if (existingBurial.date_year === null && existingBurial.place_id === null) {
    await supabase
      .from('individual_events')
      .update({
        date_year: capture.divined?.death_year ?? null,
        place_id: placeId,
        detail: 'Read from the headstone',
      })
      .eq('id', existingBurial.id);
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

// ——— phase 3: the stone changes the tree, one person at a time ———

/** "MELVINA" as carved → "Melvina" as recorded. */
function titleCase(name: string): string {
  return name.toLowerCase().replace(/(^|[\s'-])\w/g, (ch) => ch.toUpperCase());
}

/**
 * Records a marriage between an anchor and a person: fills the empty
 * slot of an existing single-parent family, or creates one. The slots
 * follow the anchor's recorded sex, falling back to the stone's hint.
 */
async function linkAsSpouse(
  treeId: string,
  userId: string,
  anchorId: string,
  personId: string,
  personSex: 'F' | 'M' | null,
): Promise<void> {
  const { data: anchor } = await supabase
    .from('individuals')
    .select('sex')
    .eq('id', anchorId)
    .single();
  const anchorIsHusband = anchor?.sex === 'M' || (anchor?.sex == null && personSex === 'F');
  const slotAnchor = anchorIsHusband ? 'husband_id' : 'wife_id';
  const slotPerson = anchorIsHusband ? 'wife_id' : 'husband_id';

  const { data: fam } = await supabase
    .from('families')
    .select('id')
    .eq('tree_id', treeId)
    .eq(slotAnchor, anchorId)
    .is(slotPerson, null)
    .limit(1)
    .maybeSingle();
  if (fam) {
    const patch = anchorIsHusband ? { wife_id: personId } : { husband_id: personId };
    const { error } = await supabase.from('families').update(patch).eq('id', fam.id);
    if (error) throw new Error(`Recording the marriage failed: ${error.message}`);
  } else {
    const { error } = await supabase.from('families').insert({
      tree_id: treeId,
      user_id: userId,
      gedcom_xref: `STONE-F-${personId.slice(0, 8)}`,
      husband_id: anchorIsHusband ? anchorId : personId,
      wife_id: anchorIsHusband ? personId : anchorId,
    });
    if (error) throw new Error(`Recording the marriage failed: ${error.message}`);
  }
}

/**
 * Adds the person the stone names to the tree, linked the way the stone
 * says — a new individual as the anchor's spouse or child, then the
 * usual attach (photo as source, burial event). The relationship cache
 * recomputes server-side so the newcomer gets their label and tier.
 */
export async function addPersonFromStone(
  capture: GraveCapture,
  anchor: KinAnchor,
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');
  const d = capture.divined;
  if (!d?.name) throw new Error('The stone gave no name to add.');

  const { data: person, error } = await supabase
    .from('individuals')
    .insert({
      tree_id: capture.tree_id,
      user_id: userId,
      full_name: titleCase(d.name),
      gedcom_xref: `STONE-${capture.id.slice(0, 8)}`,
      sex: d.sex_hint ?? undefined,
      birth_year: d.birth_year_carved ?? d.birth_year_computed ?? null,
      death_year: d.death_year ?? null,
      living: false,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Adding them failed: ${error.message}`);
  const personId = person.id as string;

  if (anchor.role === 'spouse') {
    await linkAsSpouse(capture.tree_id, userId, anchor.individual_id, personId, d.sex_hint ?? null);
  } else {
    // Child of the anchor: join the anchor's first family, or start one.
    const [asHusband, asWife] = await Promise.all([
      supabase.from('families').select('id').eq('husband_id', anchor.individual_id).limit(1).maybeSingle(),
      supabase.from('families').select('id').eq('wife_id', anchor.individual_id).limit(1).maybeSingle(),
    ]);
    let familyId = (asHusband.data?.id ?? asWife.data?.id) as string | undefined;
    if (!familyId) {
      const { data: anchorRow } = await supabase
        .from('individuals')
        .select('sex')
        .eq('id', anchor.individual_id)
        .single();
      const { data: fam, error: famErr } = await supabase
        .from('families')
        .insert({
          tree_id: capture.tree_id,
          user_id: userId,
          gedcom_xref: `STONE-F-${personId.slice(0, 8)}`,
          husband_id: anchorRow?.sex === 'F' ? null : anchor.individual_id,
          wife_id: anchorRow?.sex === 'F' ? anchor.individual_id : null,
        })
        .select('id')
        .single();
      if (famErr) throw new Error(`Starting the family failed: ${famErr.message}`);
      familyId = fam.id as string;
    }
    const { error: childErr } = await supabase.from('family_children').insert({
      family_id: familyId,
      individual_id: personId,
      user_id: userId,
    });
    if (childErr) throw new Error(`Linking the child failed: ${childErr.message}`);
  }

  await attachCapture(capture, personId);
  invalidateRelationshipCache();
  supabase.functions.invoke('compute-relationships', { body: { treeId: capture.tree_id } }).catch(() => {});
  return personId;
}

/**
 * Case B — the person exists but the marriage was never recorded: attach
 * the stone AND record the link the stone asserts.
 */
export async function attachAndRecordMarriage(
  capture: GraveCapture,
  individualId: string,
  anchor: KinAnchor,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');
  await attachCapture(capture, individualId);
  await linkAsSpouse(
    capture.tree_id,
    userId,
    anchor.individual_id,
    individualId,
    capture.divined?.sex_hint ?? null,
  );
  invalidateRelationshipCache();
  supabase.functions.invoke('compute-relationships', { body: { treeId: capture.tree_id } }).catch(() => {});
}

/** Walking directions back to a stone, in the Maps app. */
export function walkBackUrl(capture: GraveCapture): string | null {
  if (capture.latitude == null || capture.longitude == null) return null;
  return `https://maps.apple.com/?daddr=${capture.latitude},${capture.longitude}&dirflg=w`;
}
