// Dry run of the va-burials register against a live tree — the acceptance
// harness for the va-enrich worker, run from a laptop with no writes:
//
//   npx tsx scripts/va-burials-dry-run.ts [--limit 40] [--name "Charles Howe"]
//
// Signs in as the test user (packages/core/.env), takes the tree's dead
// with a death year the locator can cover and a United States place,
// asks data.va.gov for rows with the same surname and first given name,
// and prints what the worker would offer, reasons and all. Reads only.

import './node-polyfills.js';
import { createWitnessClient } from '../src/supabase/client.js';
import {
  matchVaRows,
  usStatesFromPlaceParts,
  vaSoqlWhere,
  type VaGraveRow,
  type VaPersonFacts,
} from '../src/registers/vaBurials.js';
import { loadEnv, requireEnv } from './env.js';

loadEnv();

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const limit = Number(flag('--limit') ?? 40);
const onlyName = flag('--name');

const client = createWitnessClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
);
const { error: signInError } = await client.auth.signInWithPassword({
  email: requireEnv('WITNESS_TEST_USER_EMAIL'),
  password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
});
if (signInError) throw signInError;

let query = client
  .from('individuals')
  .select('id, tree_id, full_name, given_name, surname, birth_year, death_year, living')
  .eq('living', false)
  .not('death_year', 'is', null)
  .gte('death_year', 1860)
  .order('death_year', { ascending: false })
  .limit(limit);
if (onlyName) query = query.ilike('full_name', `%${onlyName}%`);
const { data: people, error } = await query;
if (error) throw error;
if (!people || people.length === 0) throw new Error('No eligible people found.');

const ids = people.map((p) => p.id);
const { data: events } = await client
  .from('individual_events')
  .select('individual_id, places (parts)')
  .in('individual_id', ids);
const partsByPerson = new Map<string, (string[] | null)[]>();
for (const row of events ?? []) {
  const list = partsByPerson.get(row.individual_id) ?? [];
  list.push((row.places as { parts: string[] } | null)?.parts ?? null);
  partsByPerson.set(row.individual_id, list);
}
const { data: families } = await client
  .from('families')
  .select('husband_id, wife_id, husband:individuals!families_husband_id_fkey(full_name), wife:individuals!families_wife_id_fkey(full_name)')
  .or(`husband_id.in.(${ids.join(',')}),wife_id.in.(${ids.join(',')})`);
const spouses = new Map<string, string[]>();
for (const row of (families ?? []) as unknown as {
  husband_id: string | null;
  wife_id: string | null;
  husband: { full_name: string } | null;
  wife: { full_name: string } | null;
}[]) {
  if (row.husband_id && row.wife) spouses.set(row.husband_id, [...(spouses.get(row.husband_id) ?? []), row.wife.full_name]);
  if (row.wife_id && row.husband) spouses.set(row.wife_id, [...(spouses.get(row.wife_id) ?? []), row.husband.full_name]);
}

let asked = 0;
let offered = 0;
let strong = 0;
for (const p of people) {
  const parts = partsByPerson.get(p.id) ?? [];
  const person: VaPersonFacts = {
    id: p.id,
    fullName: p.full_name,
    givenName: p.given_name,
    surname: p.surname,
    birthYear: p.birth_year,
    deathYear: p.death_year,
    usStates: usStatesFromPlaceParts(parts),
    spouseNames: spouses.get(p.id) ?? [],
  };
  const hasUs =
    person.usStates.length > 0 ||
    parts.some((pp) => (pp ?? []).some((s) => /united states|^usa$|^u\.s\.a?\.?$/i.test(s.trim())));
  const where = vaSoqlWhere(person);
  if (!where || !hasUs) {
    console.log(`— ${p.full_name} (${p.birth_year ?? '?'}–${p.death_year}): skipped (${!where ? 'no usable name' : 'no US place'})`);
    continue;
  }
  const url = new URL('https://www.data.va.gov/resource/3u66-fxug.json');
  url.searchParams.set('$where', where);
  url.searchParams.set('$limit', '25');
  asked++;
  const res = await fetch(url, { headers: { 'User-Agent': 'Witness dry run (witnesslives.com)' } });
  if (!res.ok) {
    console.log(`— ${p.full_name}: HTTP ${res.status}`);
    continue;
  }
  const rows = (await res.json()) as VaGraveRow[];
  const matches = matchVaRows(person, rows);
  console.log(`— ${p.full_name} (${p.birth_year ?? '?'}–${p.death_year}) [${person.usStates.join(',') || 'US'}]: ${rows.length} same-name rows → ${matches.length} offered`);
  for (const m of matches) {
    offered++;
    if (m.confidence === 'strong') strong++;
    console.log(`    ${m.confidence.toUpperCase()} ${m.score}  ${m.recordName}`);
    console.log(`      ${m.recordSummary}`);
    for (const r of m.reasons) console.log(`      · ${r}`);
  }
  await new Promise((r) => setTimeout(r, 250));
}
console.log(`\n${people.length} people, ${asked} asked, ${offered} candidates (${strong} strong).`);
