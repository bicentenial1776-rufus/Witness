// Parse the OCR text of John Camden Hotten, *The Original Lists of
// Persons of Quality* (1874, public domain) — the London port registers
// of 1600s emigrants — into per-voyage passenger CSVs.
//
// The registers are certificate blocks: a date, a formula ("THEIS vnder
// written names are to be transported to New-England imbarqued in ye
// Planter…"), then ALL-CAPS name lines with a trailing age. Only lines
// that end in an age are taken as passengers — prose never does — so the
// book's narrative and parish-register sections fall away on their own.
// Ages become derived birth years ("c. 1608") since the matcher weighs
// years, not ages. Given-name abbreviations (JO:, THO:, WM…) expand from
// a table; OCR 'l'-for-'I' inside caps runs is repaired; a ship-name
// alias table absorbs the worst misreadings (Hopewcll, Rabecca).
//
//   npx tsx scripts/parse-hotten.ts <hotten.txt> <outDir>
//
// Emits <outDir>/<voyage-id>.csv, <outDir>/voyages.json (grouped by
// ship + year), and <outDir>/coverage.txt.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  extractEntries,
  formatRegisterDate,
  normalizeDestination,
  parseRegisterDate,
  registerTitleCase as titleCase,
} from '../src/history/ocrParsers.js';

const SOURCE = 'John Camden Hotten, The Original Lists of Persons of Quality (1874)';

// The worst recurring OCR misreadings of ship names in the register
// formulas. Anything not in this table keeps its cleaned reading.
const SHIP_ALIASES: Record<string, string> = {
  hopewcll: 'hopewell', hopcwell: 'hopewell', hopnvell: 'hopewell',
  hopeivcll: 'hopewell', rabecca: 'rebecca', elisabeth: 'elizabeth',
  elizabetli: 'elizabeth', 'eliz': 'elizabeth', encrease: 'increase',
  trulove: 'truelove', faulcon: 'falcon', abigaill: 'abigail',
  abigall: 'abigail', abbigall: 'abigail', tjiomas: 'thomas',
  'mat/iew': 'mathew', matiiew: 'mathew', 'pidc-coivc': 'pied cow',
  "rictc-con'c": 'pied cow', 'pied-cow': 'pied cow',
  merch: 'merchant bonaventure', "merch'": 'merchant bonaventure',
  'susan and ellin': 'susan and ellen', plaine: 'plain joan',
  'ann and eliz': 'ann and elizabeth', 'eliz and ann': 'elizabeth and ann',
  'hopewcll captcn': 'hopewell', 'merch bonavunture': 'merchant bonaventure',
  "merch' bonavunture": 'merchant bonaventure',
  'america wlftm': 'america', 'david jo the minister': 'david',
  'elizabetli and ann wlftm': 'elizabeth and ann', 'plaine joan': 'plain joan',
  'primrose capten': 'primrose', expectacon: 'expectation',
  'peter bonaven': 'peter bonaventure',
};

interface Row {
  given: string;
  surname: string;
  birth: string;
  /** The certificate's date, partial ISO; '' when its line did not survive. */
  date: string;
  /** Where the formula says the ship was bound; '' when it names no place. */
  destination: string;
  notes: string;
  source: string;
}
interface VoyageOut { id: string; ship: string; arrivalYear: number; notes: string; source: string }

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function main() {
  const [input, outDir] = process.argv.slice(2);
  if (!input || !outDir) {
    console.error('usage: parse-hotten.ts <hotten.txt> <outDir>');
    process.exit(1);
  }

  let text = readFileSync(input, 'utf8');
  text = text
    .replace(/¬\s*\n+\s*/g, '')
    .replace(/([A-Za-z])-\s*\n+\s*(?=[A-Za-z])/g, '$1') // rejoin split names
    .replace(/[£]/g, '&');
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());

  const rowsByVoyage = new Map<string, Row[]>();
  const voyageMeta = new Map<string, { ship: string; year: number; dests: Set<string> }>();
  let year = 1634;
  let currentKey: string | null = null;
  let inBlock = false;
  let staleLines = 0;
  let consumed = 0;
  let skippedSample: string[] = [];
  let lastSurname = '';
  // The certificate date precedes its formula; it holds until the next
  // date line. A formula that arrives without a fresh date has lost its
  // line to the OCR, and its rows carry no date rather than the last one.
  let currentDate = '';
  let dateSeenSinceBlock = false;
  let currentDestination = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;

    // Running year from any date-ish token, tolerating OCR 1→i/l/[' noise.
    const ym = /(?:^|[\s'\[])[1iIl!']?(6[0-4][0-9])(?:$|[\s\].,])/.exec(line);
    if (ym && !/&/.test(line)) {
      const y = Number(`1${ym[1]}`);
      if (y >= 1607 && y <= 1660) year = y;
    }

    const registerDate = parseRegisterDate(line);
    if (registerDate) {
      currentDate = formatRegisterDate({ ...registerDate, year: registerDate.year ?? year });
      dateSeenSinceBlock = true;
    }

    // A register formula opens a block and names the ship.
    if (/imbarqu/i.test(line) || /imbarqu/i.test(lines[i + 1] ?? '')) {
      // In the formulas the OCR reads '&' between ship-name words as a
      // bare 'f' ("Ann f Elizabeth"); repair before extracting.
      const window = [lines[i - 1], line, lines[i + 1], lines[i + 2]]
        .filter(Boolean)
        .join(' ')
        .replace(/\s[f£]\s/g, ' and ')
        .replace(/\s&\s/g, ' and ')
        .replace(/\bEliz:\s*/g, 'Eliz ');
      // "imbarqued in the said Shipp" continues the previous register.
      if (/imbarqued?\s+in\s+(?:ye|the)\s+said\b/i.test(window) && currentKey) {
        inBlock = true;
        staleLines = 0;
        continue;
      }
      // No /i flag: under it [A-Z]{2} would match any two letters and clip
      // "Susan and Ellin" to "Susan". Case variants are spelled out, and
      // the master-name terminators tolerate OCR'd caps (NlC°:, Jo:).
      const shipMatch =
        /[Ii]mbarqued?\s+[Ii]n\s+(?:[Yy]e|y[e'’=]|[Tt]he|\^?)\s*([A-Za-z&'’ \-]{3,30}?)(?=\s+(?:de\s|of\s|[A-Z]{2}|[A-Z][l!1][A-Z]|[A-Z][a-z]*[:°]|Mr\b|M[1l']\b|Capt?\b|bound|prd|now|ryding|aforesaid|,|\.|:|$))/.exec(
          window,
        );
      if (!shipMatch && /imbarqu/i.test(line)) {
        // A formula whose ship we cannot read must still END the previous
        // block, or its passengers pile into the wrong ship.
        inBlock = false;
        currentKey = null;
        continue;
      }
      if (shipMatch) {
        let ship = shipMatch[1]!.trim().toLowerCase().replace(/\s+/g, ' ');
        ship = SHIP_ALIASES[ship] ?? ship;
        const destMatch = /transported\s+to\s+([A-Za-z£&' \-]{3,25}?)(?=\s*[,.:]|\s+imbarqu|$)/i.exec(window);
        const dest = destMatch ? destMatch[1]!.trim() : '';
        const key = `${slug(ship)}-${year}`;
        currentKey = key;
        inBlock = true;
        staleLines = 0;
        lastSurname = '';
        if (!dateSeenSinceBlock) currentDate = '';
        dateSeenSinceBlock = false;
        currentDestination = normalizeDestination(dest);
        if (!voyageMeta.has(key)) {
          voyageMeta.set(key, { ship: titleCase(ship), year, dests: new Set() });
          rowsByVoyage.set(key, []);
        }
        if (dest) voyageMeta.get(key)!.dests.add(titleCase(dest));
        continue;
      }
    }

    if (!inBlock || !currentKey) continue;

    // Page furniture and tallies end nothing but are never passengers.
    if (/\b(psons|PASSINGER|PASSED FROM|Certificate|Minister|Justices|Attestacon|oath|Subsedy)\b/i.test(line)) continue;
    if (/^[\[\]*†\d]/.test(line)) continue;

    // A passenger line ends in an age. Multi-person lines join with '&'.
    const extracted = extractEntries(line, year, lastSurname);
    lastSurname = extracted.lastSurname;
    let matchedAny = extracted.entries.length > 0;
    for (const e of extracted.entries) {
      rowsByVoyage.get(currentKey)!.push({
        ...e,
        date: currentDate,
        destination: currentDestination,
        source: `${SOURCE} — ${voyageMeta.get(currentKey)!.ship} (${year}) register`,
      });
      consumed += 1;
    }
    if (matchedAny) {
      staleLines = 0;
    } else {
      if (/[A-Z]{3}/.test(line) && skippedSample.length < 300) {
        skippedSample.push(`[${currentKey}] ${line}`);
      }
      // A register is a dense run of name+age lines; a long dry spell
      // means the block ended and narrative (or another kind of list —
      // Barbados tickets-of-leave, parish registers) has begun.
      staleLines += 1;
      if (staleLines > 25) {
        inBlock = false;
        currentKey = null;
      }
    }
  }

  mkdirSync(outDir, { recursive: true });
  const voyages: VoyageOut[] = [];
  for (const [id, meta] of voyageMeta) {
    const rows = rowsByVoyage.get(id)!;
    if (rows.length === 0) continue;
    voyages.push({
      id,
      ship: meta.ship,
      arrivalYear: meta.year,
      notes: `London port register certificates${meta.dests.size ? `, bound for ${[...meta.dests].join(' / ')}` : ''}. Ages as sworn at embarkation; birth years derived from them.`,
      source: SOURCE,
    });
    const csv = ['given,surname,birth,date,destination,notes,source']
      .concat(
        rows.map((r) =>
          [r.given, r.surname, r.birth, r.date, r.destination, r.notes, r.source]
            .map((f) => (/[",]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
            .join(','),
        ),
      )
      .join('\n');
    writeFileSync(join(outDir, `${id}.csv`), csv + '\n');
  }
  voyages.sort((a, b) => a.arrivalYear - b.arrivalYear || a.id.localeCompare(b.id));
  writeFileSync(join(outDir, 'voyages.json'), JSON.stringify(voyages, null, 2) + '\n');
  writeFileSync(join(outDir, 'coverage.txt'), skippedSample.join('\n') + '\n');

  console.log(`${voyages.length} voyages, ${consumed} passengers.`);
  for (const v of voyages) console.log(`  ${v.id}: ${rowsByVoyage.get(v.id)!.length}`);
}

if (process.argv[1]?.endsWith('parse-hotten.ts')) main();
