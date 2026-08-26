// Compares the immigrant-ship dataset against a tree and prints the
// candidates. Reads the tree from a GEDCOM file (no credentials needed)
// or from Supabase (needs .env, like the other live scripts).
//
// Usage:
//   npx tsx scripts/match-passengers.ts --gedcom "fixtures/Howe_Field Family Tree.ged"
//   npx tsx scripts/match-passengers.ts --tree <treeId>
//   ... [--min weak|probable|strong] [--csv out.csv] [--dataset <file>]
//
// Nothing here decides that an ancestor sailed. It reports which people
// in the tree are worth checking against a passenger list, and why.
import './node-polyfills.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGedcom } from '../src/gedcom/index.js';
import {
  matchPassengers,
  type MatchConfidence,
  type MatchableIndividual,
  type PassengerDataset,
} from '../src/history/passengers.js';
import { loadEnv, requireEnv } from './env.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DATASET = join(repoRoot, 'data/immigrant-ships/passengers.json');

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

const gedcomPath = flag('--gedcom');
const treeId = flag('--tree');
const minimumConfidence = (flag('--min') ?? 'probable') as MatchConfidence;
const csvOut = flag('--csv');
const datasetPath = flag('--dataset') ?? DATASET;

if (!gedcomPath && !treeId) {
  console.error('Give either --gedcom <file> or --tree <treeId>.');
  process.exit(1);
}

let dataset: PassengerDataset;
try {
  dataset = JSON.parse(readFileSync(datasetPath, 'utf-8'));
} catch {
  console.error(`No dataset at ${datasetPath}.`);
  console.error('Import a transcribed list first — see data/immigrant-ships/README.md.');
  process.exit(1);
}
if (!dataset.passengers.length) {
  console.error('The dataset holds no passengers yet — see data/immigrant-ships/README.md.');
  process.exit(1);
}

async function loadIndividuals(): Promise<MatchableIndividual[]> {
  if (gedcomPath) {
    const parsed = parseGedcom(readFileSync(gedcomPath, 'utf-8'));
    return [...parsed.individuals.values()].map((person) => ({
      id: person.id,
      fullName: person.name.full,
      birthYear: person.birth?.date?.year ?? null,
      deathYear: person.death?.date?.year ?? null,
    }));
  }
  loadEnv();
  const { createWitnessClient } = await import('../src/supabase/client.js');
  const client = createWitnessClient(
    requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
    requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  );
  const { error: signInError } = await client.auth.signInWithPassword({
    email: requireEnv('WITNESS_TEST_USER_EMAIL'),
    password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
  });
  if (signInError) {
    console.error('Sign in failed:', signInError.message);
    process.exit(1);
  }
  const people: MatchableIndividual[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('individuals')
      .select('id, full_name, birth_year, death_year')
      .eq('tree_id', treeId!)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('Fetching individuals failed:', error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      people.push({
        id: row.id,
        fullName: row.full_name,
        birthYear: row.birth_year,
        deathYear: row.death_year,
      });
    }
    if (!data || data.length < PAGE) return people;
  }
}

const individuals = await loadIndividuals();
const candidates = matchPassengers(dataset, individuals, { minimumConfidence });

console.log(
  `${individuals.length.toLocaleString()} people in the tree · ` +
    `${dataset.passengers.length.toLocaleString()} passengers across ${dataset.voyages.length} voyages`,
);
console.log(`${candidates.length} candidate${candidates.length === 1 ? '' : 's'} at ${minimumConfidence} or better\n`);

const byVoyage = new Map<string, typeof candidates>();
for (const candidate of candidates) {
  const list = byVoyage.get(candidate.voyage.id) ?? [];
  list.push(candidate);
  byVoyage.set(candidate.voyage.id, list);
}
for (const [voyageId, list] of byVoyage) {
  const { ship, arrivalYear } = list[0]!.voyage;
  console.log(`── ${ship}, ${arrivalYear} (${voyageId}) — ${list.length}`);
  for (const c of list) {
    const years = [c.individual.birthYear, c.individual.deathYear].map((y) => y ?? '?').join('–');
    console.log(`   [${c.confidence.padEnd(8)}] ${c.passenger.fullName}  ↔  ${c.individual.fullName} (${years})`);
    for (const reason of c.reasons) console.log(`              · ${reason}`);
  }
  console.log('');
}

if (csvOut) {
  const rows = [
    ['confidence', 'ship', 'arrival_year', 'passenger', 'passenger_birth', 'passenger_death', 'individual', 'individual_id', 'individual_birth', 'individual_death', 'reasons'],
    ...candidates.map((c) => [
      c.confidence,
      c.voyage.ship,
      String(c.voyage.arrivalYear),
      c.passenger.fullName,
      c.passenger.birthYear ?? '',
      c.passenger.deathYear ?? '',
      c.individual.fullName,
      c.individual.id,
      c.individual.birthYear ?? '',
      c.individual.deathYear ?? '',
      c.reasons.join('; '),
    ]),
  ];
  const escape = (cell: string | number) =>
    /[",\n]/.test(String(cell)) ? `"${String(cell).replace(/"/g, '""')}"` : String(cell);
  writeFileSync(csvOut, `${rows.map((r) => r.map(escape).join(',')).join('\n')}\n`);
  console.log(`Written to ${csvOut}`);
}
