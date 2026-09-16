// Carry the certificate date and destination from a fresh parse-hotten
// run onto the Hotten rows already in the dataset — without re-importing.
// Re-import replaces a voyage's rows wholesale, and Hotten ships that
// also appear in Banks were merged into one voyage (data/immigrant-ships/
// README.md), so a replace would drop the Banks half. This matches each
// parsed row to its existing dataset row by voyage, name, and birth year
// and sets only registerDate and boundFor; ids, names, and order are
// untouched, so nothing downstream is disturbed.
//
//   npx tsx scripts/parse-hotten.ts ../../hotten.txt /tmp/hotten-out
//   npx tsx scripts/annotate-hotten-registers.ts /tmp/hotten-out
//
// Then copy passengers.json to supabase/functions/match-records/ (the
// library-hygiene test holds the two copies equal).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { parseCsv, parseYear } from '../src/history/passengerImport.js';
import type { PassengerDataset } from '../src/history/passengers.js';

const repoRoot = resolve(import.meta.dirname ?? '.', '../../..');
const DATASET = join(repoRoot, 'data/immigrant-ships/passengers.json');

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function identity(given: string, surname: string, birth: number | null): string {
  return `${given.toLowerCase()}|${surname.toLowerCase()}|${birth ?? ''}`;
}

function main() {
  const [csvDir] = process.argv.slice(2);
  if (!csvDir) {
    console.error('usage: annotate-hotten-registers.ts <parse-hotten outDir>');
    process.exit(1);
  }

  // Parsed rows, by voyage key then identity, in file order.
  const parsed = new Map<string, Map<string, { date: string; destination: string }[]>>();
  for (const file of readdirSync(csvDir).filter((f) => f.endsWith('.csv'))) {
    const rows = parseCsv(readFileSync(join(csvDir, file), 'utf8'));
    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const byIdentity = new Map<string, { date: string; destination: string }[]>();
    for (const row of rows.slice(1)) {
      const key = identity(row[col('given')] ?? '', row[col('surname')] ?? '', parseYear(row[col('birth')] ?? ''));
      const list = byIdentity.get(key) ?? [];
      list.push({ date: row[col('date')] ?? '', destination: row[col('destination')] ?? '' });
      byIdentity.set(key, list);
    }
    parsed.set(basename(file, '.csv'), byIdentity);
  }

  const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as PassengerDataset;
  let hotten = 0;
  let annotated = 0;
  let unmatched = 0;
  for (const passenger of dataset.passengers) {
    const register = /Hotten.*— (.+) \((\d{4})\) register/.exec(passenger.source);
    if (!register) continue;
    hotten += 1;
    const voyageKey = `${slug(register[1]!)}-${register[2]}`;
    const match = parsed.get(voyageKey)?.get(identity(passenger.givenNames, passenger.surname, passenger.birthYear))?.shift();
    if (!match) {
      unmatched += 1;
      continue;
    }
    if (match.date) passenger.registerDate = match.date;
    if (match.destination) passenger.boundFor = match.destination;
    if (match.date || match.destination) annotated += 1;
  }

  writeFileSync(DATASET, JSON.stringify(dataset, null, 2) + '\n');
  console.log(`${hotten} Hotten rows: ${annotated} annotated, ${unmatched} unmatched.`);
}

main();
