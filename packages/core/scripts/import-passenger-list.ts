// Converts a transcribed passenger list (CSV) into the dataset the
// matcher reads. Sources and their columns are documented in
// data/immigrant-ships/README.md — nothing here invents a passenger.
//
// Usage:
//   npx tsx scripts/import-passenger-list.ts <list.csv> <voyageId> [--out <file>] [--allow-contradictions]
//
// Every import is audited before it is written (src/history/passengerAudit.ts).
// A contradiction — born after the ship arrived, dead before it sailed, an
// age that cannot square with the birth year — stops the import unless
// --allow-contradictions says a person has looked. Looks only print.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, rowsToPassengers } from '../src/history/passengerImport.js';
import { auditPassengers, formatAudit } from '../src/history/passengerAudit.js';
import type { PassengerDataset } from '../src/history/passengers.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_OUT = join(repoRoot, 'data/immigrant-ships/passengers.json');
const VOYAGES = join(repoRoot, 'data/immigrant-ships/voyages.json');

const [csvPath, voyageId, ...rest] = process.argv.slice(2);
if (!csvPath || !voyageId) {
  console.error('Usage: import-passenger-list.ts <list.csv> <voyageId> [--out <file>]');
  process.exit(1);
}
const outIndex = rest.indexOf('--out');
const outPath = outIndex === -1 ? DEFAULT_OUT : rest[outIndex + 1]!;
const allowContradictions = rest.includes('--allow-contradictions');

const voyages: PassengerDataset['voyages'] = JSON.parse(readFileSync(VOYAGES, 'utf-8'));
const voyage = voyages.find((v) => v.id === voyageId);
if (!voyage) {
  console.error(`No voyage "${voyageId}" in data/immigrant-ships/voyages.json. Add it first.`);
  process.exit(1);
}

const dataset: PassengerDataset = existsSync(outPath)
  ? JSON.parse(readFileSync(outPath, 'utf-8'))
  : { voyages: [], passengers: [] };

const imported = rowsToPassengers(parseCsv(readFileSync(csvPath, 'utf-8')), voyageId, voyage.source);
// Re-importing a source replaces its rows rather than doubling them.
dataset.passengers = dataset.passengers.filter((p) => p.voyageId !== voyageId).concat(imported);
dataset.voyages = dataset.voyages.filter((v) => v.id !== voyageId).concat(voyage);
dataset.voyages.sort((a, b) => a.arrivalYear - b.arrivalYear || a.ship.localeCompare(b.ship));
dataset.passengers.sort((a, b) => a.voyageId.localeCompare(b.voyageId) || a.id.localeCompare(b.id));

// Audit the whole dataset (a shared Wikidata item can span voyages), but
// report only what touches the rows just imported.
const importedIds = new Set(imported.map((p) => p.id));
const flags = auditPassengers(dataset).filter((f) => importedIds.has(f.id));
if (flags.length > 0) console.log(`${formatAudit(flags)}\n`);
const contradictions = flags.filter((f) => f.tier === 'contradiction');
if (contradictions.length > 0 && !allowContradictions) {
  console.error(
    `Not written: ${contradictions.length} row${contradictions.length === 1 ? ' is' : 's are'} impossible on ` +
      'their face. Fix the transcription, or re-run with --allow-contradictions after looking.',
  );
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(dataset, null, 2)}\n`);

const dated = imported.filter((p) => p.birthYear !== null || p.deathYear !== null).length;
console.log(`${imported.length} passengers imported for ${voyage.ship} (${voyage.arrivalYear}).`);
console.log(`${dated} carry a birth or death year; ${imported.length - dated} carry neither.`);
console.log(`Dataset now holds ${dataset.passengers.length} passengers across ${dataset.voyages.length} voyages.`);
console.log(`Written to ${outPath}`);
