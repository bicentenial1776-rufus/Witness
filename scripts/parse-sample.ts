import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseGedcom } from '../src/gedcom/index.js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npm run parse:sample -- <path-to-gedcom-file>');
  process.exit(1);
}

const text = readFileSync(filePath, 'utf-8');
const result = parseGedcom(text, basename(filePath));

console.log('--- metadata ---');
console.log(result.metadata);

console.log('\n--- confidence breakdown (birth dates) ---');
const confidenceCounts: Record<string, number> = {};
for (const individual of result.individuals.values()) {
  const confidence = individual.birth?.date?.confidence ?? 'no-birth-record';
  confidenceCounts[confidence] = (confidenceCounts[confidence] ?? 0) + 1;
}
console.log(confidenceCounts);

const livingCount = [...result.individuals.values()].filter((i) => i.living).length;
console.log(`\nliving individuals flagged: ${livingCount}`);

console.log(`\ncuriosities found: ${result.curiosities.length}`);
const curiosityCounts: Record<string, number> = {};
for (const c of result.curiosities) {
  curiosityCounts[c.type] = (curiosityCounts[c.type] ?? 0) + 1;
}
console.log(curiosityCounts);
console.log('\nsample curiosities:');
for (const c of result.curiosities.slice(0, 8)) {
  console.log(`  [${c.type}] ${c.message}`);
}

console.log(`\nparse warnings: ${result.metadata.parseWarnings.length}`);
for (const w of result.metadata.parseWarnings.slice(0, 8)) {
  console.log(`  ${w}`);
}

console.log('\n--- sample individual ---');
const sample = [...result.individuals.values()][1];
console.log(JSON.stringify(sample, null, 2));
