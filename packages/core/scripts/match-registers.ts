// Run the historical-record registers over a live tree: exposure, then
// Variant A matching, with the acceptance-harness report the framework
// doc requires. Nothing here decides that an ancestor appears in a
// record — it reports who is worth checking, and why.
//
//   npx tsx scripts/match-registers.ts --tree <treeId>
//     [--register <key>] [--min weak|probable|strong] [--write] [--report]
//
// --write upserts candidate person_register_links as the signed-in tree
// owner. Verdict rows (confirmed / rejected / parsed_from_gedcom) are
// never clobbered — the match-passengers rule — and strong candidates
// are noticed on the findings ledger (edition_key null).
// --report prints the per-register acceptance summary: persons exposed,
// candidates by confidence, existing links, geocoded points.

import { createClient } from '@supabase/supabase-js';
import { WebSocket as NodeWebSocket } from 'ws';

import { fromRegisterCandidate } from '../src/findings/index.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  exposureCandidates,
  fetchActiveRegisters,
  fetchRegisterRecords,
  makeAcadianPlugin,
  matchRegisterRecords,
  scoreExposure,
  type AcadianNameVariants,
  type RegisterMatchCandidate,
  type RegisterMatchConfidence,
  type RegisterMatchPlugin,
  type RegisterPersonFacts,
} from '../src/registers/index.js';
import { loadEnv, requireEnv } from './env.js';

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const treeId = flag('--tree');
const onlyRegister = flag('--register');
const minimum = (flag('--min') ?? 'probable') as RegisterMatchConfidence;
const write = argv.includes('--write');
const report = argv.includes('--report');

if (!treeId) {
  console.error('Give --tree <treeId>.');
  process.exit(1);
}

const RANK: Record<RegisterMatchConfidence, number> = { strong: 0, probable: 1, weak: 2 };

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Per-register code plugins — the framework's escape hatch. Variant
    tables are versioned data files under data/registers/<key>/. */
function pluginFor(registerKey: string): RegisterMatchPlugin {
  if (registerKey === 'acadian-deportation') {
    const variants = JSON.parse(
      readFileSync(join(repoRoot, 'data/registers/acadian-deportation/name-variants.json'), 'utf8'),
    ) as AcadianNameVariants;
    return makeAcadianPlugin(variants);
  }
  return {};
}

async function loadPeople(
  client: ReturnType<typeof createClient>,
): Promise<RegisterPersonFacts[]> {
  const PAGE = 1000;
  const people = new Map<string, RegisterPersonFacts>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('individuals')
      .select('id, full_name, sex, birth_year, death_year, living')
      .eq('tree_id', treeId!)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('Loading individuals failed:', error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      // The living stay out of record candidates entirely, the house rule.
      if (row.living) continue;
      people.set(row.id as string, {
        id: row.id as string,
        fullName: (row.full_name as string) ?? '',
        sex: (row.sex as 'M' | 'F' | 'U') ?? 'U',
        birthYear: (row.birth_year as number | null) ?? null,
        deathYear: (row.death_year as number | null) ?? null,
        events: [],
      });
    }
    if (!data || data.length < PAGE) break;
  }
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('individual_events')
      .select('individual_id, event_type, date_year, places (parts)')
      .eq('tree_id', treeId!)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('Loading events failed:', error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      const person = people.get(row.individual_id as string);
      if (!person) continue;
      const place = row.places as { parts: string[] | null } | null;
      (person.events as { type: string; year: number | null; placeParts: readonly string[] | null }[]).push({
        type: row.event_type as string,
        year: (row.date_year as number | null) ?? null,
        placeParts: place?.parts ?? null,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return [...people.values()];
}

async function main() {
  loadEnv();
  const client = createClient(
    requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
    requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
    { realtime: { transport: NodeWebSocket as never } },
  );
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
    email: requireEnv('WITNESS_TEST_USER_EMAIL'),
    password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
  });
  if (signInError) {
    console.error('Sign in failed:', signInError.message);
    process.exit(1);
  }
  const userId = signIn.user?.id;

  const registers = await fetchActiveRegisters(client as never);
  const people = await loadPeople(client);
  console.log(`${people.length} people loaded; ${registers.size} active register(s).\n`);

  for (const register of registers.values()) {
    if (onlyRegister && register.registerKey !== onlyRegister) continue;
    const exposure = register.config.exposure;
    const exposed = exposure
      ? people.filter((p) => scoreExposure(p, exposure).exposed)
      : people;

    let candidates: RegisterMatchCandidate[] = [];
    // Variant B: exposure is the candidate (no roll to match). One row per
    // exposed person with no link of any status yet; no findings — a
    // plausibility, not a record, does not belong on the ledger.
    if (register.variant === 'B') {
      const exposed = exposureCandidates(register.config, people);
      const { data: held } = await client
        .from('person_register_links')
        .select('individual_id')
        .eq('tree_id', treeId!)
        .eq('register_key', register.registerKey);
      const heldIds = new Set((held ?? []).map((r) => r.individual_id as string));
      const fresh = exposed.filter((c) => !heldIds.has(c.person.id));
      console.log(
        `── ${register.displayName} (${register.registerKey}, Variant B)\n` +
          `   exposed: ${exposed.length} of ${people.length} · already held: ${exposed.length - fresh.length} · new: ${fresh.length}\n`,
      );
      if (!report) {
        for (const c of fresh.slice(0, 40)) console.log(`   [${String(c.score).padStart(2)}] ${c.person.fullName} · ${c.reasons.join(' · ')}`);
      }
      if (write && fresh.length > 0 && userId) {
        const rows = fresh.map((c) => ({
          tree_id: treeId!,
          user_id: userId,
          individual_id: c.person.id,
          register_key: register.registerKey,
          record_id: null,
          status: 'candidate',
          match_score: c.score,
          match_reasons: c.reasons as never,
          record_name: null,
          record_summary: 'No record attached yet — search the index, and add his regiment when you find him.',
          source_citation: null,
          finding_aid_url: c.deepLink,
        }));
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await client.from('person_register_links').insert(rows.slice(i, i + 500));
          if (error) {
            console.error('Writing exposure links failed:', error.message);
            process.exit(1);
          }
        }
        console.log(`   wrote ${rows.length} exposure candidate(s).`);
      }
      continue;
    }
    if (register.variant === 'A') {
      const records = await fetchRegisterRecords(client as never, register.registerKey);
      candidates = matchRegisterRecords(
        records,
        exposed,
        register.config.match,
        pluginFor(register.registerKey),
      ).filter(
        (c) => RANK[c.confidence] <= RANK[minimum],
      );
    }

    const byConfidence = { strong: 0, probable: 0, weak: 0 };
    for (const c of candidates) byConfidence[c.confidence] += 1;

    if (report) {
      const { count: linkCount } = await client
        .from('person_register_links')
        .select('id', { count: 'exact', head: true })
        .eq('tree_id', treeId!)
        .eq('register_key', register.registerKey);
      console.log(
        `── ${register.displayName} (${register.registerKey}, Variant ${register.variant})\n` +
          `   exposed: ${exposed.length} of ${people.length}\n` +
          `   candidates: ${candidates.length} (strong ${byConfidence.strong} · probable ${byConfidence.probable} · weak ${byConfidence.weak})\n` +
          `   links held: ${linkCount ?? 0}\n`,
      );
    } else {
      for (const c of candidates) {
        console.log(
          `   [${c.confidence.padEnd(8)}] ${c.record.nameAsRecorded}  ↔  ${c.person.fullName}` +
            `\n              · ${c.reasons.join('\n              · ')}`,
        );
      }
    }

    if (write && candidates.length > 0 && userId) {
      const { data: resolved } = await client
        .from('person_register_links')
        .select('individual_id, record_id')
        .eq('tree_id', treeId!)
        .eq('register_key', register.registerKey)
        .neq('status', 'candidate');
      const resolvedKeys = new Set(
        (resolved ?? []).map((r) => `${r.individual_id}:${r.record_id}`),
      );
      const rows = candidates
        .filter((c) => !resolvedKeys.has(`${c.person.id}:${c.record.id}`))
        .map((c) => ({
          tree_id: treeId!,
          user_id: userId,
          individual_id: c.person.id,
          register_key: register.registerKey,
          record_id: c.record.id,
          status: 'candidate',
          match_reasons: c.reasons as never,
          record_name: c.record.nameAsRecorded,
          record_summary: c.record.sourceCitation,
          source_citation: c.record.sourceCitation,
          finding_aid_url: c.record.findingAidUrl,
        }));
      if (rows.length > 0) {
        const { error } = await client
          .from('person_register_links')
          .upsert(rows, { onConflict: 'individual_id,register_key,record_id' });
        if (error) {
          console.error('Writing links failed:', error.message);
          process.exit(1);
        }
        console.log(`   wrote ${rows.length} candidate link(s).`);
      }

      const findings = new Map<string, ReturnType<typeof fromRegisterCandidate>>();
      for (const c of candidates) {
        if (c.confidence !== 'strong') continue;
        if (resolvedKeys.has(`${c.person.id}:${c.record.id}`)) continue;
        const finding = fromRegisterCandidate({
          registerKey: register.registerKey,
          individualId: c.person.id,
          recordId: c.record.id,
          individualName: c.person.fullName,
          recordName: c.record.nameAsRecorded,
          displayName: register.displayName,
        });
        findings.set(finding.id, finding);
      }
      if (findings.size > 0) {
        const { error } = await client.from('findings').upsert(
          [...findings.values()].map((f) => ({
            tree_id: treeId!,
            user_id: userId,
            finding_id: f.id,
            source: f.source,
            subject_ids: f.subjectIds,
            sentence: f.sentence,
          })),
          { onConflict: 'tree_id,finding_id', ignoreDuplicates: true },
        );
        if (error) console.error('Noticing findings failed (links are written):', error.message);
        else console.log(`   noticed ${findings.size} strong candidate(s) on the ledger.`);
      }
    }
  }
}

void main();
