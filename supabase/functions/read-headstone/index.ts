// read-headstone: the "reading" step of At the Stone (design artifact
// 2026-08-25). Takes a queued grave capture, transcribes the inscription
// from its photos (verbatim — the transcription is the record), derives
// the structured facts (Æ-age arithmetic → a computed birth window, the
// relationship phrases carved on the stone), names the cemetery from the
// capture's coordinates, and scores match candidates against the tree on
// three legs: name, dates, place.
//
// POST { captureId: string } → { capture: <updated row> }
// Auth: the caller's own JWT; the capture row is theirs by RLS.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';

import {
  authenticate,
  checkDailyLimit,
  checkEntitlement,
  corsHeaders,
  json,
} from '../_shared/enrich.ts';

const MODEL = 'claude-sonnet-4-6';
const UA = 'WitnessLives/1.0 (hello@witnesslives.com)';
const MAX_PHOTOS = 3;
const MAX_IMAGE_BYTES = 4_500_000;

const READING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['transcription', 'legibility', 'name', 'relationship_phrases'],
  properties: {
    transcription: {
      type: 'string',
      description: 'The inscription verbatim, line breaks as " · ". Only what is carved; illegible runs as […].',
    },
    legibility: { type: 'string', enum: ['clear', 'partial', 'poor'] },
    name: { type: ['string', 'null'], description: 'The deceased name as carved, or null' },
    death_year: { type: ['integer', 'null'] },
    death_month: { type: ['integer', 'null'] },
    death_day: { type: ['integer', 'null'] },
    birth_year_carved: { type: ['integer', 'null'], description: 'Only if a birth year is carved' },
    age_years: { type: ['integer', 'null'], description: 'From Æ/AE/aged, if carved' },
    age_months: { type: ['integer', 'null'] },
    relationship_phrases: {
      type: 'array',
      items: { type: 'string' },
      description: 'Carved kinship phrases, verbatim: "wife of Mr. Asa Haskell", "dau. of Israel & Polly Bray"',
    },
    military: { type: ['string', 'null'], description: 'Regiment/service line if carved' },
    epitaph: { type: ['string', 'null'] },
  },
} as const;

interface Reading {
  transcription: string;
  legibility: 'clear' | 'partial' | 'poor';
  name: string | null;
  death_year: number | null;
  death_month: number | null;
  death_day: number | null;
  birth_year_carved: number | null;
  age_years: number | null;
  age_months: number | null;
  relationship_phrases: string[];
  military: string | null;
  epitaph: string | null;
}

async function reverseGeocode(lat: number, lng: number): Promise<{ label: string; town: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as {
      name?: string;
      address?: Record<string, string>;
    };
    const a = d.address ?? {};
    const town = a.hamlet ?? a.village ?? a.town ?? a.city ?? '';
    const spot = d.name || a.amenity || a.road || '';
    const label = [spot, town, [a.county, a.state].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(' · ');
    return { label: label || 'Unknown cemetery', town };
  } catch {
    return null;
  }
}

interface Candidate {
  individual_id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  score: number;
  reasons: string[];
}

// ——— the plot graph's scoring leg: the stone's own kinship phrases ———

// The lookahead makes the honorific a whole word: without it, the
// optional dot and whitespace let "Dea" eat the front of "Dean" and
// "Gen" the front of "Genevieve".
const HONORIFICS = /\b(mr|mrs|miss|dr|rev|capt|col|gen|hon|dea|esq)\.?(?=\s|$)\s*/gi;

function cleanName(raw: string): string {
  return raw
    .replace(HONORIFICS, '')
    .replace(/[^A-Za-z .'&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "wife of Mr. Asa Haskell" / "dau. of Israel & Polly Bray" → who the
    stone says this person belongs to. Names missing a surname inherit
    the last one in the phrase ("Israel & Polly Bray" → Israel Bray). */
function parseKinHints(phrases: string[]): {
  spouses: string[];
  parents: string[];
  sexHint: 'F' | 'M' | null;
} {
  const spouses: string[] = [];
  const parents: string[] = [];
  let sexHint: 'F' | 'M' | null = null;
  for (const phrase of phrases) {
    const spouse = /\b(wife|husband)\s+of\s+(.+)/i.exec(phrase);
    if (spouse) {
      sexHint = spouse[1].toLowerCase() === 'wife' ? 'F' : 'M';
      spouses.push(cleanName(spouse[2]));
      continue;
    }
    // Leading \b so "Grandson of…"/"Granddaughter of…" never parse as a
    // parent claim — inside "grandson" there is no boundary before
    // "son", so grand-kin phrases fall through as plain record facts
    // instead of writing the wrong generation.
    const child = /\b(dau(?:ghter)?|son|child)\.?\s+of\s+(.+)/i.exec(phrase);
    if (child) {
      const kind = child[1].toLowerCase();
      if (kind.startsWith('dau')) sexHint = sexHint ?? 'F';
      if (kind === 'son') sexHint = sexHint ?? 'M';
      const names = cleanName(child[2]).split(/\s*(?:&|and)\s*/i).filter(Boolean);
      const lastTokens = names[names.length - 1]?.split(' ') ?? [];
      const surname = lastTokens.length > 1 ? lastTokens[lastTokens.length - 1] : '';
      for (const n of names) {
        parents.push(n.includes(' ') || !surname ? n : `${n} ${surname}`);
      }
    }
  }
  return { spouses, parents, sexHint };
}

/** Token-boundary person-name match: every hint token must match a
    whole token of the tree name (equal, or a truncation like "Will" for
    "William"). Substrings across boundaries don't count — "Alvin" must
    never match "Calvin". */
function namesAgree(hint: string, treeName: string): boolean {
  const h = hint.toLowerCase().replace(/\./g, '').split(/\s+/).filter((t) => t.length > 1);
  const t = treeName.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!h.length) return false;
  return h.every((token) => t.some((tt) => tt === token || tt.startsWith(token)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: { captureId?: string; rescoreOnly?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  if (!body.captureId) return json(400, { error: 'captureId is required' });

  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  const { data: capture } = await ctx.db
    .from('grave_captures')
    .select('*')
    .eq('id', body.captureId)
    .maybeSingle();
  if (!capture) return json(404, { error: 'Capture not found' });
  if (!capture.photo_paths?.length) return json(422, { error: 'Capture has no photos' });
  if (!['queued', 'failed', 'read'].includes(capture.status)) {
    return json(409, { error: `Capture is ${capture.status}` });
  }

  // Rescore: reuse the stored reading and re-run only the matching —
  // free (no vision call), used when the scoring learns new tricks.
  const rescore = Boolean(body.rescoreOnly) && capture.divined && capture.transcription;

  if (!rescore) {
    const gate = (await checkEntitlement(ctx)) ?? (await checkDailyLimit(ctx));
    if (gate) return gate;
    await ctx.db.from('grave_captures').update({ status: 'reading' }).eq('id', capture.id);
  }
  const fail = async (message: string, code = 502) => {
    await ctx.db.from('grave_captures').update({ status: 'failed' }).eq('id', capture.id);
    return json(code, { error: message });
  };

  // The photos, from the private bucket. Several angles of one stone go
  // into a single vision request — the model reads across them.
  const images: { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }[] = [];
  for (const path of rescore ? [] : capture.photo_paths.slice(0, MAX_PHOTOS)) {
    // photo_paths is client-writable; the service role would read ANY
    // folder in the bucket, so only paths under the caller's own folder
    // are honored — the per-folder storage RLS, re-stated here.
    if (!path.startsWith(`${ctx.userId}/`)) continue;
    const { data: blob, error } = await ctx.admin.storage.from('grave-photos').download(path);
    if (error || !blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) continue;
    let binary = '';
    const CHUNK = 32768;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    images.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: btoa(binary) },
    });
  }
  if (!rescore && !images.length) return fail('No readable photos for this capture', 422);

  let reading: Reading;
  if (rescore) {
    const d = capture.divined as Record<string, unknown>;
    reading = {
      transcription: capture.transcription as string,
      legibility: (d.legibility as Reading['legibility']) ?? 'partial',
      name: (d.name as string | null) ?? null,
      death_year: (d.death_year as number | null) ?? null,
      death_month: (d.death_month as number | null) ?? null,
      death_day: (d.death_day as number | null) ?? null,
      birth_year_carved: (d.birth_year_carved as number | null) ?? null,
      age_years: (d.age_years as number | null) ?? null,
      age_months: (d.age_months as number | null) ?? null,
      relationship_phrases: (d.relationship_phrases as string[]) ?? [],
      military: (d.military as string | null) ?? null,
      epitaph: (d.epitaph as string | null) ?? null,
    };
  } else {
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      output_config: { format: { type: 'json_schema', schema: READING_SCHEMA } },
      system: [
        'You read headstone inscriptions for Witness, a family history app.',
        'Transcribe ONLY what is carved on the stone — verbatim, in carved order, line breaks as " · ".',
        'Photos are often taken at a raking angle to raise the relief; read across all provided angles of the same stone.',
        'Illegible runs become […]; never guess a letter you cannot see. A field you cannot read from the stone is null.',
        'Keep kinship phrases exactly as carved ("wife of Mr. Asa Haskell", "dau. of Israel & Polly Bray") — they are record facts.',
        'Æ / AE / "aged" lines carry age at death: put the numbers in age_years/age_months, do not compute a birth year yourself.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: [
            ...images,
            { type: 'text', text: 'Read this headstone.' },
          ],
        },
      ],
    });
    const block = response.content.find((b) => b.type === 'text');
    if (response.stop_reason === 'refusal' || !block) return fail('The reading was declined.');
    reading = JSON.parse(block.text);
  } catch (error) {
    console.error('Vision reading failed:', error);
    return fail('The stone could not be read just now. Please try again.');
  }
  }

  // Derived, never carved: the Æ arithmetic. Marked computed in the app.
  const birthComputed =
    reading.birth_year_carved ??
    (reading.death_year !== null && reading.age_years !== null
      ? reading.death_year - reading.age_years - (reading.death_month && reading.age_months && reading.death_month <= reading.age_months ? 1 : 0)
      : null);

  const geo =
    capture.latitude != null && capture.longitude != null
      ? await reverseGeocode(capture.latitude, capture.longitude)
      : null;

  // ——— the match ———
  // Two pools: people whose names resemble the stone's, and — the plot
  // graph — people the stone's kinship phrases point at through the
  // tree's own links (the spouse of your Asa Haskell is a candidate for
  // "wife of Mr. Asa Haskell" even when the tree spells her Jemenice
  // and the stone says Jemima).
  const candidates: Candidate[] = [];
  let stoneAnchors: { hint: string; role: 'spouse' | 'parent'; individual_id: string; full_name: string }[] = [];
  const hints = parseKinHints(reading.relationship_phrases ?? []);
  if (reading.name) {
    const tokens = reading.name.replace(/[^A-Za-z .']/g, ' ').trim().split(/\s+/);
    const surname = tokens[tokens.length - 1] ?? '';
    const given = tokens[0] ?? '';

    interface PoolPerson {
      id: string;
      full_name: string;
      birth_year: number | null;
      death_year: number | null;
      viaKin: string | null;
    }
    const pool = new Map<string, PoolPerson>();

    if (surname.length >= 3) {
      const { data: people } = await ctx.db
        .from('individuals')
        .select('id, full_name, birth_year, death_year')
        .eq('tree_id', capture.tree_id)
        .ilike('full_name', `%${surname}%`)
        .limit(300);
      for (const p of people ?? []) {
        pool.set(p.id as string, { ...(p as Omit<PoolPerson, 'viaKin'>), viaKin: null });
      }
    }

    // Kin-first pooling: resolve each hinted name to tree people, then
    // pull their spouses (for "wife/husband of") or children (for
    // "dau./son of") into the pool.
    const hintPeople = async (hint: string) => {
      const last = hint.split(' ').pop() ?? '';
      if (last.length < 3) return [];
      // Thread every hint token into the pattern so a common surname
      // can't crowd the right person out of the page.
      const pattern = `%${hint.replace(/\./g, '').trim().replace(/\s+/g, '%')}%`;
      const { data } = await ctx.db
        .from('individuals')
        .select('id, full_name')
        .eq('tree_id', capture.tree_id)
        .ilike('full_name', pattern)
        .limit(50);
      return (data ?? []).filter((p) => namesAgree(hint, p.full_name as string)).slice(0, 3);
    };
    const addToPool = async (ids: string[], via: string) => {
      const fresh = ids.filter((id) => !pool.has(id) || pool.get(id)!.viaKin === null);
      if (!fresh.length) return;
      const { data } = await ctx.db
        .from('individuals')
        .select('id, full_name, birth_year, death_year')
        .in('id', fresh.slice(0, 20));
      for (const p of data ?? []) {
        pool.set(p.id as string, { ...(p as Omit<PoolPerson, 'viaKin'>), viaKin: via });
      }
    };
    const anchors: { hint: string; role: 'spouse' | 'parent'; individual_id: string; full_name: string }[] = [];
    for (const hint of hints.spouses) {
      for (const person of await hintPeople(hint)) {
        anchors.push({ hint, role: 'spouse', individual_id: person.id as string, full_name: person.full_name as string });
        const [h, w] = await Promise.all([
          ctx.db.from('families').select('wife_id').eq('husband_id', person.id),
          ctx.db.from('families').select('husband_id').eq('wife_id', person.id),
        ]);
        const partners = [
          ...(h.data ?? []).map((f) => f.wife_id as string | null),
          ...(w.data ?? []).map((f) => f.husband_id as string | null),
        ].filter((id): id is string => Boolean(id));
        await addToPool(partners, `pointed at by "${hint}"`);
      }
    }
    for (const hint of hints.parents) {
      for (const person of await hintPeople(hint)) {
        anchors.push({ hint, role: 'parent', individual_id: person.id as string, full_name: person.full_name as string });
        const [h, w] = await Promise.all([
          ctx.db.from('families').select('id').eq('husband_id', person.id),
          ctx.db.from('families').select('id').eq('wife_id', person.id),
        ]);
        const famIds = [...(h.data ?? []), ...(w.data ?? [])].map((f) => f.id as string);
        if (!famIds.length) continue;
        const { data: kids } = await ctx.db
          .from('family_children')
          .select('individual_id')
          .in('family_id', famIds);
        await addToPool(
          (kids ?? []).map((k) => k.individual_id as string),
          `a child of ${hint}`,
        );
      }
    }

    // Which pool members have events in the cemetery's town?
    const poolIds = [...pool.keys()];
    const placeIds = new Set<string>();
    if (geo?.town && poolIds.length) {
      const { data: ev } = await ctx.db
        .from('individual_events')
        .select('individual_id, places!inner(raw)')
        .in('individual_id', poolIds)
        .ilike('places.raw', `%${geo.town}%`);
      for (const e of ev ?? []) placeIds.add(e.individual_id as string);
    }

    for (const p of pool.values()) {
      const parts = p.full_name.replace(/[^A-Za-z .']/g, ' ').trim().split(/\s+/);
      const pGiven = parts[0]?.toLowerCase() ?? '';
      const g = given.toLowerCase().replace(/\.$/, '');
      let score = 0;
      const reasons: string[] = [];
      if (surname && p.full_name.toLowerCase().includes(surname.toLowerCase())) {
        score += 15;
        reasons.push('surname');
      }
      if (p.viaKin) {
        score += 12;
        reasons.push(p.viaKin);
      }
      if (pGiven === g && g) {
        score += 20;
        reasons.push('given name exact');
      } else if (g && parts.some((t) => t.toLowerCase().startsWith(g))) {
        score += 12;
        reasons.push(`"${given}" reads as a called name`);
      } else if (g && pGiven.startsWith(g[0])) {
        score += 5;
        reasons.push('initial');
      }
      if (reading.death_year !== null && p.death_year !== null) {
        const d = Math.abs(reading.death_year - p.death_year);
        if (d === 0) {
          score += 25;
          reasons.push(`death ${reading.death_year} exact`);
        } else if (d <= 2) {
          score += 12;
          reasons.push(`death within ${d}`);
        } else if (d > 12) score -= 20;
      }
      if (birthComputed !== null && p.birth_year !== null) {
        const d = Math.abs(birthComputed - p.birth_year);
        if (d <= 2) {
          score += 15;
          reasons.push(`birth ~${birthComputed} ≈ ${p.birth_year}`);
        } else if (d <= 5) {
          score += 6;
        } else if (d > 15) score -= 15;
      }
      if (placeIds.has(p.id)) {
        score += 15;
        reasons.push(`recorded in ${geo!.town}`);
      }
      if (score >= 20) {
        candidates.push({
          individual_id: p.id,
          full_name: p.full_name,
          birth_year: p.birth_year,
          death_year: p.death_year,
          score,
          reasons,
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    candidates.splice(12);

    // Verify the phrases against each candidate's own recorded kin —
    // the strongest single signal a stone can give.
    if ((hints.spouses.length || hints.parents.length) && candidates.length) {
      const ids = candidates.map((c) => c.individual_id);
      const [famH, famW, fc] = await Promise.all([
        ctx.db.from('families').select('husband_id, wife_id').in('husband_id', ids),
        ctx.db.from('families').select('husband_id, wife_id').in('wife_id', ids),
        ctx.db.from('family_children').select('individual_id, family_id').in('individual_id', ids),
      ]);
      const spousesOf = new Map<string, string[]>();
      for (const f of famH.data ?? []) {
        if (f.wife_id) spousesOf.set(f.husband_id, [...(spousesOf.get(f.husband_id) ?? []), f.wife_id]);
      }
      for (const f of famW.data ?? []) {
        if (f.husband_id) spousesOf.set(f.wife_id, [...(spousesOf.get(f.wife_id) ?? []), f.husband_id]);
      }
      const famIds = [...new Set((fc.data ?? []).map((r) => r.family_id as string))];
      const parentFams = famIds.length
        ? ((await ctx.db.from('families').select('id, husband_id, wife_id').in('id', famIds)).data ?? [])
        : [];
      const famById = new Map(parentFams.map((f) => [f.id as string, f]));
      const parentsOf = new Map<string, string[]>();
      for (const r of fc.data ?? []) {
        const fam = famById.get(r.family_id as string);
        if (!fam) continue;
        const list = parentsOf.get(r.individual_id as string) ?? [];
        if (fam.husband_id) list.push(fam.husband_id as string);
        if (fam.wife_id) list.push(fam.wife_id as string);
        parentsOf.set(r.individual_id as string, list);
      }
      const kinIds = [...new Set([...spousesOf.values(), ...parentsOf.values()].flat())];
      const kinNames = new Map<string, string>(
        kinIds.length
          ? ((await ctx.db.from('individuals').select('id, full_name').in('id', kinIds)).data ?? []).map(
              (p) => [p.id as string, p.full_name as string],
            )
          : [],
      );
      for (const cand of candidates) {
        for (const hint of hints.spouses) {
          const match = (spousesOf.get(cand.individual_id) ?? [])
            .map((id) => kinNames.get(id) ?? '')
            .find((n) => namesAgree(hint, n));
          if (match) {
            cand.score += 28;
            cand.reasons.push(`the stone says "${hint}" — ${match} is their spouse in your tree`);
            break;
          }
        }
        let parentHits = 0;
        for (const hint of hints.parents) {
          const match = (parentsOf.get(cand.individual_id) ?? [])
            .map((id) => kinNames.get(id) ?? '')
            .find((n) => namesAgree(hint, n));
          if (match && parentHits < 2) {
            parentHits += 1;
            cand.reasons.push(`the stone names ${hint} — ${match} is their parent in your tree`);
          }
        }
        cand.score += parentHits * 14;
      }
      candidates.sort((a, b) => b.score - a.score);
    }

    // Below 30 even after kin checks is noise, not a candidate.
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (candidates[i].score < 30) candidates.splice(i, 1);
    }
    candidates.splice(5);
    stoneAnchors = anchors.slice(0, 6);
  }

  const divined = {
    name: reading.name,
    death_year: reading.death_year,
    death_month: reading.death_month,
    death_day: reading.death_day,
    birth_year_carved: reading.birth_year_carved,
    birth_year_computed: birthComputed,
    age_years: reading.age_years,
    age_months: reading.age_months,
    relationship_phrases: reading.relationship_phrases,
    military: reading.military,
    epitaph: reading.epitaph,
    legibility: reading.legibility,
    sex_hint: hints.sexHint,
    // Tree people the stone's phrases point at — the handles for adding
    // or linking the person the stone names (phase 3).
    anchors: stoneAnchors,
  };

  const { data: updated, error: upErr } = await ctx.db
    .from('grave_captures')
    .update({
      status: 'read',
      transcription: reading.transcription,
      divined,
      candidates,
      cemetery: geo?.label ?? capture.cemetery,
    })
    .eq('id', capture.id)
    .select()
    .maybeSingle();
  if (upErr) return fail(`Saving the reading failed: ${upErr.message}`, 500);

  return json(200, { capture: updated });
});
