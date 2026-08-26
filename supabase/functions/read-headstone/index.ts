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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: { captureId?: string };
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

  const gate = (await checkEntitlement(ctx)) ?? (await checkDailyLimit(ctx));
  if (gate) return gate;

  await ctx.db.from('grave_captures').update({ status: 'reading' }).eq('id', capture.id);
  const fail = async (message: string, code = 502) => {
    await ctx.db.from('grave_captures').update({ status: 'failed' }).eq('id', capture.id);
    return json(code, { error: message });
  };

  // The photos, from the private bucket. Several angles of one stone go
  // into a single vision request — the model reads across them.
  const images: { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }[] = [];
  for (const path of capture.photo_paths.slice(0, MAX_PHOTOS)) {
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
  if (!images.length) return fail('No readable photos for this capture', 422);

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  let reading: Reading;
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

  // ——— the match: name + dates + place ———
  const candidates: Candidate[] = [];
  if (reading.name) {
    const tokens = reading.name.replace(/[^A-Za-z .']/g, ' ').trim().split(/\s+/);
    const surname = tokens[tokens.length - 1] ?? '';
    const given = tokens[0] ?? '';
    if (surname.length >= 3) {
      const { data: people } = await ctx.db
        .from('individuals')
        .select('id, full_name, birth_year, death_year')
        .eq('tree_id', capture.tree_id)
        .ilike('full_name', `%${surname}%`)
        .limit(300);

      // Which candidates have events in the cemetery's town?
      const placeIds = new Set<string>();
      if (geo?.town && people?.length) {
        const { data: ev } = await ctx.db
          .from('individual_events')
          .select('individual_id, places!inner(raw)')
          .in('individual_id', people.map((p) => p.id))
          .ilike('places.raw', `%${geo.town}%`);
        for (const e of ev ?? []) placeIds.add(e.individual_id as string);
      }

      for (const p of people ?? []) {
        const parts = (p.full_name as string).replace(/[^A-Za-z .']/g, ' ').trim().split(/\s+/);
        const pGiven = parts[0]?.toLowerCase() ?? '';
        const g = given.toLowerCase().replace(/\.$/, '');
        let score = 15; // surname present
        const reasons: string[] = ['surname'];
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
          const d = Math.abs(reading.death_year - (p.death_year as number));
          if (d === 0) {
            score += 25;
            reasons.push(`death ${reading.death_year} exact`);
          } else if (d <= 2) {
            score += 12;
            reasons.push(`death within ${d}`);
          } else if (d > 12) score -= 20;
        }
        if (birthComputed !== null && p.birth_year !== null) {
          const d = Math.abs(birthComputed - (p.birth_year as number));
          if (d <= 2) {
            score += 15;
            reasons.push(`birth ~${birthComputed} ≈ ${p.birth_year}`);
          } else if (d <= 5) {
            score += 6;
          } else if (d > 15) score -= 15;
        }
        if (placeIds.has(p.id as string)) {
          score += 15;
          reasons.push(`recorded in ${geo!.town}`);
        }
        if (score >= 30) {
          candidates.push({
            individual_id: p.id as string,
            full_name: p.full_name as string,
            birth_year: p.birth_year as number | null,
            death_year: p.death_year as number | null,
            score,
            reasons,
          });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      candidates.splice(5);
    }
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
