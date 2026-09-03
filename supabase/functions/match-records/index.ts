// match-records — the record-matching worker
// (docs/witness-historical-record-registers-package.md, "where compute
// runs": the milestone that makes matching self-serving instead of a
// CLI hand-crank). One pass over a tree runs BOTH engines:
//
//   · the Crossing Library (ship passengers, bundled dataset) →
//     passenger_candidates + strong findings
//   · the record registers (register_records in the database, Variant A)
//     → person_register_links candidates + strong findings
//
// Verdict rows are never clobbered: anything a researcher has decided
// (confirmed / dismissed / rejected / parsed_from_gedcom) is excluded
// from every upsert — the match-passengers rule, enforced server-side.
//
// Two doors, the house pattern:
//   · caller JWT + { treeId } — matches that tree AS the caller, all
//     writes RLS-scoped to their own rows (the post-import hook).
//   · x-cron-secret — service-role sweep over every tree, bounded per
//     tick, writes owned by each tree's owner (the scheduled pass, and
//     how a family member's tree gets matched without their session).

import { authenticate, corsHeaders, json } from '../_shared/enrich.ts';
import { requireCronSecret } from '../_shared/cron.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  matchPassengers,
  matchRegisterRecords,
  scoreExposure,
  type MatchableIndividual,
  type PassengerDataset,
  type RegisterConfig,
  type RegisterMatchPlugin,
  type RegisterPersonFacts,
  type RegisterRecord,
} from '../_shared/records/mod.ts';
import { makeAcadianPlugin, type AcadianNameVariants } from '../_shared/records/acadianNames.ts';

import passengerData from './passengers.json' with { type: 'json' };
import acadianVariants from './acadian-variants.json' with { type: 'json' };

const MAX_TREES_PER_SWEEP = 10;
const PAGE = 1000;

const dataset = passengerData as unknown as PassengerDataset;

/** Per-register code plugins — mirrors the CLI's pluginFor. */
function pluginFor(registerKey: string): RegisterMatchPlugin {
  if (registerKey === 'acadian-deportation') {
    return makeAcadianPlugin(acadianVariants as unknown as AcadianNameVariants);
  }
  return {};
}

// deno-lint-ignore no-explicit-any
type Client = any;

async function loadPeople(client: Client, treeId: string): Promise<RegisterPersonFacts[]> {
  const people = new Map<string, RegisterPersonFacts>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('individuals')
      .select('id, full_name, sex, birth_year, death_year, living')
      .eq('tree_id', treeId)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`individuals: ${error.message}`);
    for (const row of data ?? []) {
      if (row.living) continue; // the living stay out of record candidates
      people.set(row.id, {
        id: row.id,
        fullName: row.full_name ?? '',
        sex: row.sex ?? 'U',
        birthYear: row.birth_year,
        deathYear: row.death_year,
        events: [],
      });
    }
    if (!data || data.length < PAGE) break;
  }
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('individual_events')
      .select('individual_id, event_type, date_year, places (parts)')
      .eq('tree_id', treeId)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`events: ${error.message}`);
    for (const row of data ?? []) {
      const person = people.get(row.individual_id);
      if (!person) continue;
      (person.events as unknown[]).push({
        type: row.event_type,
        year: row.date_year ?? null,
        placeParts: row.places?.parts ?? null,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return [...people.values()];
}

interface TreeResult {
  treeId: string;
  crossingCandidates: number;
  registerLinks: number;
  findings: number;
}

async function matchTree(client: Client, treeId: string, userId: string): Promise<TreeResult> {
  const people = await loadPeople(client, treeId);
  const findingRows = new Map<string, Record<string, unknown>>();
  let crossingCandidates = 0;
  let registerLinks = 0;

  // ── The Crossing Library ─────────────────────────────────────────
  const individuals: MatchableIndividual[] = people.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
  }));
  const crossing = matchPassengers(dataset, individuals, { minimumConfidence: 'weak' });

  const { data: resolvedCrossing } = await client
    .from('passenger_candidates')
    .select('individual_id, passenger_id')
    .eq('tree_id', treeId)
    .neq('status', 'pending');
  const resolvedCrossingKeys = new Set(
    (resolvedCrossing ?? []).map((r: { individual_id: string; passenger_id: string }) =>
      `${r.individual_id}:${r.passenger_id}`,
    ),
  );
  const crossingRows = crossing
    .filter((c) => !resolvedCrossingKeys.has(`${c.individual.id}:${c.passenger.id}`))
    .map((c) => ({
      tree_id: treeId,
      user_id: userId,
      individual_id: c.individual.id,
      voyage_id: c.voyage.id,
      passenger_id: c.passenger.id,
      ship: c.voyage.ship,
      arrival_year: c.voyage.arrivalYear,
      departure_port: c.voyage.departurePort ?? null,
      arrival_place: c.voyage.arrivalPlace ?? null,
      passenger_name: c.passenger.fullName,
      passenger_birth_year: c.passenger.birthYear,
      passenger_death_year: c.passenger.deathYear,
      source: c.passenger.source,
      confidence: c.confidence,
      reasons: c.reasons,
    }));
  for (let i = 0; i < crossingRows.length; i += 500) {
    const { error } = await client
      .from('passenger_candidates')
      .upsert(crossingRows.slice(i, i + 500), { onConflict: 'individual_id,passenger_id' });
    if (error) throw new Error(`passenger upsert: ${error.message}`);
  }
  crossingCandidates = crossingRows.length;
  for (const c of crossing) {
    if (c.confidence !== 'strong') continue;
    if (resolvedCrossingKeys.has(`${c.individual.id}:${c.passenger.id}`)) continue;
    // Same id format and sentence as @witness/core/findings
    // fromPassengerCandidate — keep in sync.
    const id = `crossing:passenger:${c.individual.id}:${c.voyage.id}`;
    if (findingRows.has(id)) continue;
    findingRows.set(id, {
      tree_id: treeId,
      user_id: userId,
      finding_id: id,
      source: 'crossing',
      subject_ids: [c.individual.id],
      sentence: `${c.individual.fullName} may have sailed on the ${c.voyage.ship}, ${c.voyage.arrivalYear} — a shipping list worth checking.`,
    });
  }

  // ── The record registers (Variant A) ─────────────────────────────
  const { data: registers, error: regError } = await client
    .from('registers')
    .select('register_key, display_name, variant, config')
    .eq('status', 'active');
  if (regError) throw new Error(`registers: ${regError.message}`);

  for (const register of registers ?? []) {
    if (register.variant !== 'A') continue;
    const config = (register.config ?? {}) as RegisterConfig;
    const exposed = config.exposure
      ? people.filter((p) => scoreExposure(p, config.exposure!).exposed)
      : people;
    if (exposed.length === 0) continue;

    const records: RegisterRecord[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from('register_records')
        .select('id, register_key, record_kind, name_as_recorded, surname_normalized, given_normalized, entity_key, attributes, source_citation, finding_aid_url')
        .eq('register_key', register.register_key)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`register_records: ${error.message}`);
      for (const row of data ?? []) {
        records.push({
          id: row.id,
          registerKey: row.register_key,
          recordKind: row.record_kind,
          nameAsRecorded: row.name_as_recorded,
          surnameNormalized: row.surname_normalized,
          givenNormalized: row.given_normalized,
          entityKey: row.entity_key,
          attributes: row.attributes ?? {},
          sourceCitation: row.source_citation,
          findingAidUrl: row.finding_aid_url,
        });
      }
      if (!data || data.length < PAGE) break;
    }

    const candidates = matchRegisterRecords(
      records,
      exposed,
      config.match,
      pluginFor(register.register_key),
    );
    if (candidates.length === 0) continue;

    const { data: resolved } = await client
      .from('person_register_links')
      .select('individual_id, record_id')
      .eq('tree_id', treeId)
      .eq('register_key', register.register_key)
      .neq('status', 'candidate');
    const resolvedKeys = new Set(
      (resolved ?? []).map((r: { individual_id: string; record_id: string | null }) =>
        `${r.individual_id}:${r.record_id}`,
      ),
    );
    const rows = candidates
      .filter((c) => !resolvedKeys.has(`${c.person.id}:${c.record.id}`))
      .map((c) => ({
        tree_id: treeId,
        user_id: userId,
        individual_id: c.person.id,
        register_key: register.register_key,
        record_id: c.record.id,
        match_reasons: c.reasons,
        record_name: c.record.nameAsRecorded,
        record_summary: c.record.sourceCitation,
        source_citation: c.record.sourceCitation,
        finding_aid_url: c.record.findingAidUrl,
      }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await client
        .from('person_register_links')
        .upsert(rows.slice(i, i + 500), { onConflict: 'individual_id,register_key,record_id' });
      if (error) throw new Error(`link upsert: ${error.message}`);
    }
    registerLinks += rows.length;

    for (const c of candidates) {
      if (c.confidence !== 'strong') continue;
      if (resolvedKeys.has(`${c.person.id}:${c.record.id}`)) continue;
      // Same id format and sentence as fromRegisterCandidate — keep in sync.
      const id = `register:${register.register_key}:${c.person.id}:${c.record.id}`;
      if (findingRows.has(id)) continue;
      findingRows.set(id, {
        tree_id: treeId,
        user_id: userId,
        finding_id: id,
        source: 'register',
        subject_ids: [c.person.id],
        sentence: `${c.person.fullName} may appear in ${register.display_name} — ${c.record.nameAsRecorded} is a record worth checking.`,
      });
    }
  }

  if (findingRows.size > 0) {
    const { error } = await client.from('findings').upsert([...findingRows.values()], {
      onConflict: 'tree_id,finding_id',
      ignoreDuplicates: true,
    });
    if (error) console.error('findings upsert failed (candidates written):', error.message);
  }

  return { treeId, crossingCandidates, registerLinks, findings: findingRows.size };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  // The sweep door: cron secret, service role, every tree, bounded.
  if (req.headers.get('x-cron-secret')) {
    const gate = requireCronSecret(req);
    if (gate) return gate;
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: trees, error } = await admin
      .from('trees')
      .select('id, user_id')
      .order('imported_at', { ascending: false })
      .limit(MAX_TREES_PER_SWEEP);
    if (error) return json(500, { error: error.message });
    // Respond 202 and finish in the background — pg_net aborts its HTTP
    // call at ~55s and a full sweep can outlive that; the story-arc
    // warming cron proved the 202+waitUntil shape (release-gate review).
    const sweep = (async () => {
      const results: TreeResult[] = [];
      for (const tree of trees ?? []) {
        try {
          results.push(await matchTree(admin, tree.id, tree.user_id));
        } catch (err) {
          console.error(`match-records sweep failed for ${tree.id}:`, err);
        }
      }
      console.log('match-records sweep done:', JSON.stringify(results));
    })();
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(sweep);
    return json(202, { mode: 'sweep', trees: (trees ?? []).length });
  }

  // The per-tree door: the caller matches a tree they OWN — a family
  // member can read a shared tree, but candidate rows belong to the
  // owner, and a member-triggered run would write rows the owner's
  // verdicts can't touch (release-gate review).
  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;
  let treeId: unknown;
  try {
    ({ treeId } = await req.json());
  } catch {
    return json(400, { error: 'Body must be JSON with a treeId' });
  }
  if (typeof treeId !== 'string') return json(400, { error: 'treeId required' });
  const { data: tree } = await ctx.db
    .from('trees')
    .select('id, user_id')
    .eq('id', treeId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (!tree) return json(404, { error: 'No such tree, or no access.' });
  try {
    const result = await matchTree(ctx.db, treeId, ctx.userId);
    return json(200, { mode: 'tree', ...result });
  } catch (err) {
    console.error('match-records failed:', err);
    return json(500, { error: 'Matching failed. Try again shortly.' });
  }
});
