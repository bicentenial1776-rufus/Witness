/**
 * Overlay: give a tree that came through Family Tree Maker its Ancestry
 * identity, from one Ancestry export, without re-importing anything.
 *
 * FTM is the only door to the family's media, but its GEDCOM renumbers
 * people and drops Ancestry's tree id, person ids, record ids (_APID) and
 * record links — so the Portrait's "Ancestry ›" button and the Sources
 * tab's record links died with the FTM import. This matches the Ancestry
 * file's people onto the existing tree by name and years (personMatch.ts,
 * the photo overlay's matcher: strict to loose, never a guess between two
 * Johns), then its citations onto the tree's citations by person + source
 * title + fact (+ page when both sides have one), and writes:
 *
 *   trees.ancestry_tree_id          from the header's SOUR._TREE.RIN
 *   individuals.ancestry_person_id  the @I<digits>@ xref of the match
 *   citations.url / ancestry_apid   where the tree's citation had none
 *
 * Idempotent; re-running rewrites the same values. Later FTM refreshes
 * carry all of it forward by xref (carry_ancestry_identity), so the
 * Ancestry export is a one-time chore.
 *
 *   npx tsx scripts/overlay-ancestry-ids.ts <ancestry.ged> --tree-id <tree> [--write] [--report <path>]
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import './node-polyfills.js';
import { parseGedcom } from '../src/gedcom/index.js';
import { matchPeople, normalizeName, type PersonKey } from '../src/gedcom/personMatch.js';
import { buildImportPayload } from '../src/supabase/transform.js';
import { createWitnessClient } from '../src/supabase/client.js';
import { loadEnv, requireEnv } from './env.js';

function usage(): never {
  console.error(
    'Usage: npx tsx scripts/overlay-ancestry-ids.ts <ancestry.ged> --tree-id <existing tree> [--write] [--report <path>]\n' +
      'Without --write this only reports how the two exports line up.',
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  if (at < 0) return false;
  args.splice(at, 1);
  return true;
};
const valued = (name: string) => {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const v = args[at + 1];
  args.splice(at, 2);
  return v;
};
const write = flag('--write');
const treeId = valued('--tree-id');
const reportPath = valued('--report');
const gedcomPath = args[0] ? resolve(args[0]) : undefined;
if (!gedcomPath || !treeId || args.length !== 1) usage();
if (!existsSync(gedcomPath)) throw new Error(`GEDCOM file not found: ${gedcomPath}`);

loadEnv();
const client = createWitnessClient(requireEnv('EXPO_PUBLIC_SUPABASE_URL'), requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'));
const { data: auth, error: authError } = await client.auth.signInWithPassword({
  email: requireEnv('WITNESS_TEST_USER_EMAIL'),
  password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
});
if (authError || !auth.user) throw new Error(`Sign in failed: ${authError?.message ?? 'no user returned'}`);

// ---- the Ancestry side -----------------------------------------------------

console.log(`Parsing ${gedcomPath}`);
const parsed = parseGedcom(readFileSync(gedcomPath, 'utf8'), basename(gedcomPath));
const ancestryTreeId = parsed.metadata.ancestryTreeId ?? null;
if (!ancestryTreeId) throw new Error('This file carries no Ancestry tree id (SOUR._TREE.RIN) — is it an Ancestry export?');
const payload = buildImportPayload(parsed, { userId: auth.user.id, generateId: randomUUID });
console.log(`Ancestry tree ${ancestryTreeId}: ${payload.individuals.length} people, ${payload.citations.length} citations`);

const sourcePeople: PersonKey[] = payload.individuals.map((row) => ({
  id: row.id!,
  fullName: row.full_name,
  birthYear: row.birth_year ?? null,
  deathYear: row.death_year ?? null,
  sex: row.sex,
}));
const ancestryPersonIdOf = new Map<string, string>();
for (const row of payload.individuals) {
  const digits = /^I(\d+)$/.exec(row.gedcom_xref)?.[1];
  if (digits) ancestryPersonIdOf.set(row.id!, digits);
}

// ---- the Witness side ------------------------------------------------------

const { data: tree, error: treeError } = await client
  .from('trees')
  .select('id, name, individual_count, user_id, ancestry_tree_id')
  .eq('id', treeId)
  .single();
if (treeError || !tree) throw new Error(`Tree ${treeId} not readable: ${treeError?.message}`);
if (tree.user_id !== auth.user.id) throw new Error('Only the tree owner can overlay identity onto it.');
console.log(`Target tree: "${tree.name}" (${tree.individual_count} people, ancestry_tree_id ${tree.ancestry_tree_id ?? 'none'})`);

const targetPeople: PersonKey[] = [];
for (let offset = 0; ; offset += 1000) {
  const { data: page, error } = await client
    .from('individuals')
    .select('id, full_name, birth_year, death_year, sex')
    .eq('tree_id', treeId)
    .order('id')
    .range(offset, offset + 999);
  if (error) throw new Error(`Could not read people: ${error.message}`);
  for (const row of page ?? []) targetPeople.push({ id: row.id, fullName: row.full_name, birthYear: row.birth_year, deathYear: row.death_year, sex: row.sex });
  if (!page || page.length < 1000) break;
}

interface TargetCitation {
  id: string;
  individual_id: string | null;
  fact: string;
  page: string | null;
  url: string | null;
  ancestry_apid: string | null;
  sources: { title: string | null } | null;
}
const targetCitations: TargetCitation[] = [];
for (let offset = 0; ; offset += 1000) {
  const { data: page, error } = await client
    .from('citations')
    .select('id, individual_id, fact, page, url, ancestry_apid, sources(title)')
    .eq('tree_id', treeId)
    .not('individual_id', 'is', null)
    .order('id')
    .range(offset, offset + 999)
    .returns<TargetCitation[]>();
  if (error) throw new Error(`Could not read citations: ${error.message}`);
  targetCitations.push(...(page ?? []));
  if (!page || page.length < 1000) break;
}

// ---- people ----------------------------------------------------------------

const report = matchPeople(sourcePeople, targetPeople);
const targetBySource = new Map(report.matches.map((m) => [m.sourceId, m.targetId]));
console.log(`People: ${sourcePeople.length} in Ancestry, ${targetPeople.length} in Witness`);
console.log(`Matched: ${report.matches.length}`, report.byTier);
console.log(`Unmatched: ${report.unmatchedSource.length} Ancestry people, ${report.unmatchedTarget.length} Witness people`);

const peopleRows = report.matches
  .map((m) => ({ id: m.targetId, ancestry_person_id: ancestryPersonIdOf.get(m.sourceId) ?? null }))
  .filter((r): r is { id: string; ancestry_person_id: string } => r.ancestry_person_id !== null);

// ---- citations -------------------------------------------------------------

const sourceTitleById = new Map(payload.sources.map((s) => [s.id!, s.title ?? '']));
const normTitle = (t: string | null | undefined) => normalizeName(t ?? '');
const normPage = (p: string | null | undefined) => normalizeName(p ?? '');

interface SourceCite {
  targetPersonId: string;
  title: string;
  fact: string;
  page: string;
  url: string | null;
  apid: string | null;
}
const sourceCites: SourceCite[] = [];
for (const c of payload.citations) {
  if (!c.individual_id || (!c.url && !c.ancestry_apid)) continue;
  const targetPersonId = targetBySource.get(c.individual_id);
  if (!targetPersonId) continue;
  sourceCites.push({
    targetPersonId,
    title: normTitle(sourceTitleById.get(c.source_id)),
    fact: c.fact,
    page: normPage(c.page),
    url: c.url ?? null,
    apid: c.ancestry_apid ?? null,
  });
}

// Two tiers: person + title + fact + page, then person + title + fact when
// that leaves exactly one candidate on each side. Never a guess between two.
function uniqueBy<T>(rows: T[], key: (r: T) => string): Map<string, T> {
  const seen = new Map<string, T | null>();
  for (const r of rows) seen.set(key(r), seen.has(key(r)) ? null : r);
  const out = new Map<string, T>();
  for (const [k, v] of seen) if (v) out.set(k, v);
  return out;
}
const openTargets = targetCitations.filter((c) => c.individual_id && (!c.url || !c.ancestry_apid));
const citationRows: { id: string; url: string | null; ancestry_apid: string | null }[] = [];
let matchedWithPage = 0;
let matchedWithoutPage = 0;
{
  const takenT = new Set<string>();
  const takenS = new Set<SourceCite>();
  const withPage = (r: { targetPersonId?: string; individual_id?: string | null; title?: string; sources?: { title: string | null } | null; fact: string; page: string | null }) =>
    `${'targetPersonId' in r ? r.targetPersonId : r.individual_id}|${'title' in r && typeof r.title === 'string' ? r.title : normTitle(r.sources?.title)}|${r.fact}|${normPage(r.page)}`;
  const withoutPage = (r: { targetPersonId?: string; individual_id?: string | null; title?: string; sources?: { title: string | null } | null; fact: string }) =>
    `${'targetPersonId' in r ? r.targetPersonId : r.individual_id}|${'title' in r && typeof r.title === 'string' ? r.title : normTitle(r.sources?.title)}|${r.fact}`;
  for (const [tier, keyOf] of [['page', withPage], ['nopage', withoutPage]] as const) {
    const tIndex = uniqueBy(openTargets.filter((t) => !takenT.has(t.id)), keyOf);
    const sIndex = uniqueBy(sourceCites.filter((s) => !takenS.has(s)), keyOf);
    for (const [k, s] of sIndex) {
      const t = tIndex.get(k);
      if (!t) continue;
      takenT.add(t.id);
      takenS.add(s);
      citationRows.push({ id: t.id, url: s.url, ancestry_apid: s.apid });
      if (tier === 'page') matchedWithPage++;
      else matchedWithoutPage++;
    }
  }
}
console.log(
  `Citations: ${sourceCites.length} Ancestry citations with a link or record id on matched people; ` +
    `${openTargets.length} Witness citations without one; ${citationRows.length} matched ` +
    `(${matchedWithPage} on page, ${matchedWithoutPage} without).`,
);

if (reportPath) {
  const nameOf = new Map(sourcePeople.map((p) => [p.id, p]));
  const lines = ['# Ancestry people with no match in Witness', ''];
  for (const id of report.unmatchedSource) {
    const p = nameOf.get(id)!;
    lines.push(`${p.fullName}  ${p.birthYear ?? '?'}–${p.deathYear ?? '?'}`);
  }
  const tNameOf = new Map(targetPeople.map((p) => [p.id, p]));
  lines.push('', '# Witness people with no match in Ancestry', '');
  for (const id of report.unmatchedTarget) {
    const p = tNameOf.get(id)!;
    lines.push(`${p.fullName}  ${p.birthYear ?? '?'}–${p.deathYear ?? '?'}`);
  }
  writeFileSync(resolve(reportPath), lines.join('\n') + '\n');
  console.log(`Unmatched report written to ${resolve(reportPath)}`);
}

if (!write) {
  console.log('Dry run only. Add --write to store the tree id, the person ids, and the citation links.');
  process.exit(0);
}

// ---- writing ---------------------------------------------------------------

let people = 0;
let citations = 0;
const CHUNK = 2000;
for (let i = 0; i < Math.max(peopleRows.length, citationRows.length, 1); i += CHUNK) {
  const { data, error } = await client.rpc('apply_ancestry_identity', {
    p_tree_id: treeId,
    p_ancestry_tree_id: i === 0 ? ancestryTreeId : null,
    p_people: peopleRows.slice(i, i + CHUNK) as never,
    p_citations: citationRows.slice(i, i + CHUNK) as never,
  });
  if (error) throw new Error(`apply_ancestry_identity failed: ${error.message}`);
  const counts = data as { people?: number; citations?: number } | null;
  people += counts?.people ?? 0;
  citations += counts?.citations ?? 0;
}
console.log(`Wrote: tree id ${ancestryTreeId}, ${people} person ids, ${citations} citation links.`);
