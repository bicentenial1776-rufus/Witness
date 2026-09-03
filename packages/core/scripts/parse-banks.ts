// Parse the OCR text of Charles Edward Banks, *The Planters of the
// Commonwealth* (1930) — public domain — into per-voyage passenger CSVs
// plus voyage metadata, ready for import-passenger-list.ts.
//
// The OCR flattens the book's columns, so origin/settlement fragments
// often drift away from their names. Names are extracted only from lines
// that BEGIN with a title-case name; whatever follows on the same line
// (an origin, an occupation, a settlement) rides along in notes, and
// dislocated fragments on their own lines are dropped rather than
// guessed at. Banks gives no birth or death years — matches against
// these rows lean on name + alive-window, which is the honest weight
// for this source.
//
//   npx tsx scripts/parse-banks.ts <banks.txt> <outDir> [--skip id,id,...]
//
// Emits: <outDir>/voyages.json, <outDir>/<voyage-id>.csv, and
// <outDir>/rejected.txt (a sample of skipped lines for eyeballing).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readName } from '../src/history/ocrParsers.js';

const SOURCE = 'Charles Edward Banks, The Planters of the Commonwealth (1930)';

interface VoyageOut {
  id: string;
  ship: string;
  arrivalYear: number;
  notes: string;
  source: string;
}
interface Row {
  given: string;
  surname: string;
  notes: string;
  source: string;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function titleCase(caps: string): string {
  return caps
    .toLowerCase()
    .replace(/(^|[\s-])[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bOf\b/g, 'of');
}

function main() {
  const [input, outDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const skipArg = process.argv.find((a) => a.startsWith('--skip'));
  const skipIds = new Set((skipArg?.split('=')[1] ?? '').split(',').filter(Boolean));
  if (!input || !outDir) {
    console.error('usage: parse-banks.ts <banks.txt> <outDir> [--skip=id,id]');
    process.exit(1);
  }

  let text = readFileSync(input, 'utf8');
  // Rejoin OCR hyphenation: "follow¬\n\ning" and in-line "Ches- ter".
  text = text.replace(/¬\s*\n+\s*/g, '').replace(/([a-z])-\s+([a-z])/g, '$1$2');
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());

  // Part II starts at the second "PART II" heading; stop at the appendix.
  const partStarts = lines.flatMap((l, i) => (l === 'PART II' ? [i] : []));
  const start = partStarts[partStarts.length - 1] ?? 0;
  const end = lines.findIndex((l, i) => i > start && l === 'APPENDIX');

  const voyages: VoyageOut[] = [];
  const rowsByVoyage = new Map<string, Row[]>();
  const usedIds = new Set<string>(skipIds);
  const rejected: string[] = [];

  let year = 1620;
  let current: VoyageOut | null = null;
  let skipping = false;

  for (let i = start; i < (end === -1 ? lines.length : end); i += 1) {
    const line = lines[i];
    if (!line) continue;

    // Year group headers stand alone between ships. The OCR sometimes
    // reads the leading 1 as i/l/! ("i635"), so normalize before testing.
    const yearMatch = /^[1iIl!](6[1-4][0-9])$/.exec(line);
    if (yearMatch) {
      year = Number(`1${yearMatch[1]}`);
      continue;
    }

    // The Winthrop Fleet section aggregates eleven ships we already carry
    // as a curated voyage — skip until the next confirmed heading.
    if (/^THE WINTHROP FLEET/.test(line)) {
      skipping = true;
      current = null;
      continue;
    }

    // Ship heading: an all-caps name opening the line, confirmed by
    // voyage prose in the heading sentence (this line or the next three)
    // — some ships are announced without a named Master ("SWAN. A small
    // vessel bringing seven passengers…").
    const heading = /^([A-Z][A-Z'’&\- ]{2,40}?)([,.]| of )\s*(.*)$/.exec(line);
    if (heading && /[A-Z]{3}/.test(heading[1]!)) {
      const lookahead = [line, lines[i + 1], lines[i + 2], lines[i + 3]].join(' ');
      if (/\b(Master|vessel|ships?|tons|passengers|arrived|sailed|consort|brought)\b/.test(lookahead)) {
        const ship = titleCase(heading[1]!.trim());
        let id = `${slug(ship)}-${year}`;
        if (skipIds.has(id)) {
          skipping = true;
          current = null;
          continue;
        }
        for (let n = 2; usedIds.has(id); n += 1) id = `${slug(ship)}-${year}-${n}`;
        usedIds.add(id);
        const notes = [line, lines[i + 1], lines[i + 2]]
          .join(' ')
          .replace(/\s+/g, ' ')
          .slice(0, 300);
        current = { id, ship, arrivalYear: year, notes, source: SOURCE };
        voyages.push(current);
        rowsByVoyage.set(id, []);
        skipping = false;
        continue;
      }
    }

    if (skipping || !current) continue;

    const name = readName(line);
    if (name) {
      rowsByVoyage.get(current.id)!.push({
        given: name.given,
        surname: name.surname,
        notes: name.rest,
        source: `${SOURCE}, ${current.ship} (${current.arrivalYear})`,
      });
    } else if (/^[A-Za-z]/.test(line) && rejected.length < 400) {
      rejected.push(`[${current.id}] ${line}`);
    }
  }

  mkdirSync(outDir, { recursive: true });
  const kept = voyages.filter((v) => (rowsByVoyage.get(v.id)?.length ?? 0) > 0);
  for (const v of kept) {
    const rows = rowsByVoyage.get(v.id)!;
    const csv = ['given,surname,notes,source']
      .concat(
        rows.map((r) =>
          [r.given, r.surname, r.notes, r.source]
            .map((f) => (/[",]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
            .join(','),
        ),
      )
      .join('\n');
    writeFileSync(join(outDir, `${v.id}.csv`), csv + '\n');
  }
  writeFileSync(join(outDir, 'voyages.json'), JSON.stringify(kept, null, 2) + '\n');
  writeFileSync(join(outDir, 'rejected.txt'), rejected.join('\n') + '\n');

  const total = kept.reduce((n, v) => n + rowsByVoyage.get(v.id)!.length, 0);
  console.log(`${kept.length} voyages, ${total} passengers.`);
  for (const v of kept) {
    console.log(`  ${v.id}: ${rowsByVoyage.get(v.id)!.length}`);
  }
  console.log(`Rejected-line sample: ${join(outDir, 'rejected.txt')}`);
}

if (process.argv[1]?.endsWith('parse-banks.ts')) main();
