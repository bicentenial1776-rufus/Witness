// Compares the immigrant-ship dataset against a tree and prints the
// candidates. Reads the tree from a GEDCOM file (no credentials needed)
// or from Supabase (needs .env, like the other live scripts).
//
// Usage:
//   npx tsx scripts/match-passengers.ts --gedcom "fixtures/Howe_Field Family Tree.ged"
//   npx tsx scripts/match-passengers.ts --tree <treeId>
//   ... [--min weak|probable|strong] [--csv out.csv] [--dataset <file>] [--write]
//
// --write requires --tree (candidates are anchored to real individual ids)
// and upserts into passenger_candidates as the signed-in tree owner, so the
// Portrait's Crossing card has something to show. Existing rows keep their
// status (confirmed/dismissed survive a re-run); only pending rows change.
//
// Nothing here decides that an ancestor sailed. It reports which people
// in the tree are worth checking against a passenger list, and why.
import './node-polyfills.js';
import { WebSocket as NodeWebSocket } from 'ws';
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
const writeFlag = argv.includes('--write');

if (!gedcomPath && !treeId) {
  console.error('Give either --gedcom <file> or --tree <treeId>.');
  process.exit(1);
}
if (writeFlag && !treeId) {
  console.error('--write needs --tree — candidates are anchored to real individual ids.');
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

// When reading from Supabase (not a GEDCOM file), the signed-in client and
// user id are kept around for --write — the same authenticated session,
// no separate service-role path.
let liveClient: Awaited<ReturnType<typeof import('../src/supabase/client.js').createWitnessClient>> | null = null;
let liveUserId: string | null = null;

async function loadIndividuals(): Promise<MatchableIndividual[]> {
  if (gedcomPath) {
    const parsed = parseGedcom(readFileSync(gedcomPath, 'utf-8'));
    const spouses = new Map<string, string[]>();
    for (const family of parsed.families.values()) {
      if (!family.husbandId || !family.wifeId) continue;
      spouses.set(family.husbandId, [...(spouses.get(family.husbandId) ?? []), family.wifeId]);
      spouses.set(family.wifeId, [...(spouses.get(family.wifeId) ?? []), family.husbandId]);
    }
    return [...parsed.individuals.values()].map((person) => ({
      id: person.id,
      fullName: person.name.full,
      birthYear: person.birth?.date?.year ?? null,
      deathYear: person.death?.date?.year ?? null,
      spouseIds: spouses.get(person.id),
      sex: person.sex,
    }));
  }
  loadEnv();
  const { createWitnessClient } = await import('../src/supabase/client.js');
  const client = createWitnessClient(
    requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
    requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
    { realtime: { transport: NodeWebSocket as never } },
  );
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
    email: requireEnv('WITNESS_TEST_USER_EMAIL'),
    password: requireEnv('WITNESS_TEST_USER_PASSWORD'),
  });
  if (signInError) {
    console.error('Sign in failed:', signInError.message);
    process.exit(1);
  }
  liveClient = client;
  liveUserId = signInData.user?.id ?? null;
  const PAGE = 1000;
  // Spouses feed the household pass: a wife the list writes under her
  // husband's surname, the tree under her own (or none).
  const spouses = new Map<string, string[]>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('families')
      .select('husband_id, wife_id')
      .eq('tree_id', treeId!)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('Fetching families failed:', error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      if (!row.husband_id || !row.wife_id) continue;
      spouses.set(row.husband_id, [...(spouses.get(row.husband_id) ?? []), row.wife_id]);
      spouses.set(row.wife_id, [...(spouses.get(row.wife_id) ?? []), row.husband_id]);
    }
    if (!data || data.length < PAGE) break;
  }
  const people: MatchableIndividual[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('individuals')
      .select('id, full_name, sex, birth_year, death_year')
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
        spouseIds: spouses.get(row.id),
        sex: row.sex ?? 'U',
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

if (writeFlag) {
  const client = liveClient!;
  const userId = liveUserId!;
  if (!userId) {
    console.error('Could not resolve the signed-in user id — nothing written.');
    process.exit(1);
  }

  // Confirmed/dismissed rows are a human verdict; a re-run must never
  // clobber one, so they are excluded from the upsert payload entirely.
  const { data: resolved, error: resolvedError } = await client
    .from('passenger_candidates')
    .select('individual_id, passenger_id')
    .eq('tree_id', treeId!)
    .neq('status', 'pending');
  if (resolvedError) {
    console.error('Checking existing candidates failed:', resolvedError.message);
    process.exit(1);
  }
  const resolvedKeys = new Set((resolved ?? []).map((r) => `${r.individual_id}:${r.passenger_id}`));

  const rows = candidates
    .filter((c) => !resolvedKeys.has(`${c.individual.id}:${c.passenger.id}`))
    .map((c) => ({
      tree_id: treeId!,
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

  if (rows.length === 0) {
    console.log('Nothing new to write — every candidate is already confirmed or dismissed.');
  } else {
    const { error: writeError } = await client
      .from('passenger_candidates')
      .upsert(rows, { onConflict: 'individual_id,passenger_id' });
    if (writeError) {
      console.error('Writing candidates failed:', writeError.message);
      process.exit(1);
    }
    console.log(`Wrote ${rows.length} candidate${rows.length === 1 ? '' : 's'} to passenger_candidates.`);
  }

  // Findings first (PROJECT_BRIEF.md): every STRONG unresolved candidate
  // is noticed on the findings ledger (edition_key null = noticed, not
  // yet printed), so the edition can print crossings it never derived.
  // Same id format as fromPassengerCandidate in @witness/core/findings.
  const findingRows = new Map<string, Record<string, unknown>>();
  for (const c of candidates) {
    if (c.confidence !== 'strong') continue;
    if (resolvedKeys.has(`${c.individual.id}:${c.passenger.id}`)) continue;
    const findingId = `crossing:passenger:${c.individual.id}:${c.voyage.id}`;
    if (findingRows.has(findingId)) continue;
    findingRows.set(findingId, {
      tree_id: treeId!,
      user_id: userId,
      finding_id: findingId,
      source: 'crossing',
      subject_ids: [c.individual.id],
      sentence: `${c.individual.fullName} may have sailed on the ${c.voyage.ship}, ${c.voyage.arrivalYear} — a shipping list worth checking.`,
    });
  }
  if (findingRows.size > 0) {
    const { error: findingError } = await client
      .from('findings')
      .upsert([...findingRows.values()], {
        onConflict: 'tree_id,finding_id',
        ignoreDuplicates: true,
      });
    if (findingError) {
      console.error('Noticing findings failed (candidates are written):', findingError.message);
    } else {
      console.log(`Noticed ${findingRows.size} strong crossing${findingRows.size === 1 ? '' : 's'} on the findings ledger.`);
    }
  }
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
