// Parse the OCR text of Frederick H. Dyer, *A Compendium of the War of
// the Rebellion* (1908, public domain) into the cw-regiments register:
// one entity record per Union unit (record_kind = entity), the service
// narrative kept verbatim, and — where the OCR supports it — dated
// engagement events. Dyer is Union-only; the register's coverage caveat
// says so (docs/witness-civil-war-prompt.md, decision 6).
//
// The scan is noisy ("Sklrmlah", "18*4"); this parser is deliberately
// defensive: a heading must parse to a canonical unit key or the entry
// is skipped and counted; a date must be unambiguous or the sentence
// stays in the narrative only. Coverage is reported, never assumed.
//
//   npx tsx scripts/parse-dyer.ts <dyer.txt> <outDir> [--events-for key,key,...]
//
// Emits records.csv (+ events.csv for the sampled units) in
// seed-register format, and a coverage report.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { makeUnitParser, type UnitTerms } from '../src/registers/normalizers/unitDesignation.js';

const STATE_NAMES = [
  'ALABAMA', 'ARKANSAS', 'CALIFORNIA', 'COLORADO', 'CONNECTICUT', 'DAKOTA',
  'DELAWARE', 'FLORIDA', 'GEORGIA', 'ILLINOIS', 'INDIANA', 'IOWA', 'KANSAS',
  'KENTUCKY', 'LOUISIANA', 'MAINE', 'MARYLAND', 'MASSACHUSETTS', 'MICHIGAN',
  'MINNESOTA', 'MISSISSIPPI', 'MISSOURI', 'NEBRASKA', 'NEVADA',
  'NEW HAMPSHIRE', 'NEW JERSEY', 'NEW MEXICO', 'NEW YORK', 'NORTH CAROLINA',
  'OHIO', 'OREGON', 'PENNSYLVANIA', 'RHODE ISLAND', 'TENNESSEE', 'TEXAS',
  'VERMONT', 'VIRGINIA', 'WEST VIRGINIA', 'WISCONSIN',
  'UNITED STATES COLORED TROOPS',
];

const MONTHS =
  '(January|February|March|April|May|June|July|August|September|October|November|December)';

function csvField(f: string): string {
  return /[",\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f;
}

function main() {
  const [input, outDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const eventsArg = process.argv.find((a) => a.startsWith('--events-for'));
  const eventsList = eventsArg?.split('=')[1] ?? '';
  const eventsForAll = eventsList === 'all';
  const eventKeys = new Set(eventsList.split(',').filter(Boolean));
  if (!input || !outDir) {
    console.error('usage: parse-dyer.ts <dyer.txt> <outDir> [--events-for=key,...]');
    process.exit(1);
  }

  const terms = JSON.parse(
    readFileSync(join(outDir, 'unit-terms.json'), 'utf8'),
  ) as UnitTerms;
  const parseUnit = makeUnitParser(terms);

  const raw = readFileSync(input, 'utf8');
  const lines = raw.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());

  // Heading: "12th REGIMENT INFANTRY.— Org..." / "1st BATTERY LIGHT
  // ARTILLERY" — an ordinal opener plus an org-word in caps-ish text.
  const HEADING =
    /^"?(\d{1,3})\s*(?:st|nd|rd|th|d|»t|.t)?\s+(REGIMENT|BATTERY|BATTALION|INDEPENDENT)\b(.{0,60})/;

  interface Unit {
    key: string;
    state: string;
    branch: string | null;
    number: number;
    displayName: string;
    kind: string;
    text: string[];
  }

  let state: string | null = null;
  let staleLines = 0;
  let current: Unit | null = null;
  const units: Unit[] = [];
  let skippedHeadings = 0;
  const skippedSample: string[] = [];

  for (const line of lines) {
    if (!line) continue;

    // State section headers: a lone caps state name (dash-tolerant).
    const stateLine = line.replace(/[—\-–.]+$/, '').trim();
    if (STATE_NAMES.includes(stateLine)) {
      state = stateLine;
      staleLines = 0;
      current = null;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading && state) {
      let branchText = repairBranch((heading[3] ?? '').split(/[—.]/)[0] ?? '');
      // Under the Colored Troops a bare "Nth REGIMENT" is infantry —
      // Dyer names the USCT cavalry and artillery units as such.
      if (!branchText.trim() && state === 'UNITED STATES COLORED TROOPS' && heading[2] === 'REGIMENT') branchText = 'INFANTRY';
      const designation = `${heading[1]} ${state} ${heading[2]} ${branchText}`;
      const parsed = parseUnit(designation);
      staleLines = 0;
      if (parsed) {
        current = {
          key: parsed.unitKey,
          state: parsed.state,
          branch: parsed.branch,
          number: parsed.number,
          displayName: `${heading[1]}${ordSuffix(Number(heading[1]))} ${titleCase(state)} ${titleCase(
            (branchText.split(/[—.]/)[0] ?? '').trim() || heading[2]!.toLowerCase(),
          )}`.replace(/\s+/g, ' '),
          kind: heading[2]!.toLowerCase(),
          text: [line],
        };
        units.push(current);
      } else {
        skippedHeadings += 1;
        if (skippedSample.length < 30) skippedSample.push(`[${state}] ${line.slice(0, 80)}`);
        current = null;
      }
      continue;
    }

    if (current) {
      // Page furniture ends nothing; long text accumulates on the unit.
      if (/COMPENDIUM OF THE WAR|Digitized by|^Google$/i.test(line)) continue;
      current.text.push(line);
      if (current.text.length > 400) current = null; // runaway guard
    } else if (state) {
      // A state header only governs a run of unit entries. Long stretches
      // with no heading mean another part of the book (the battle index) —
      // without this, the last alphabetical state absorbs everything after.
      staleLines += 1;
      if (staleLines > 400) state = null;
    }
  }

  // The same unit appears in Part 1 (brief) and Part 3 (full history):
  // keep the longer text.
  const byKey = new Map<string, Unit>();
  for (const unit of units) {
    const existing = byKey.get(unit.key);
    if (!existing || unit.text.join(' ').length > existing.text.join(' ').length) {
      byKey.set(unit.key, unit);
    }
  }

  const records: string[] = ['id,name,entity_key,record_kind,source,finding_aid_url,organized,mustered_out,history_excerpt'];
  const events: string[] = ['record_id,event_type,event_year,place_text,source'];
  let eventCount = 0;

  for (const unit of byKey.values()) {
    const text = repairOcr(unit.text.join(' ').replace(/\s+/g, ' '));
    // Dyer writes "Org. at Worcester and mustered in June 12, 1861" far
    // more often than "Organized at".
    const organized = /(?:Organi[sz]ed|Org\.)\s+(?:at |in )?([^.]{3,80})\./i.exec(text)?.[1]?.trim() ?? '';
    const mustered = /Mustered out ([^.]{3,60})\./i.exec(text)?.[1]?.trim() ?? '';
    const id = `cw-regiments:${unit.key.toLowerCase()}`;
    records.push(
      [
        id,
        unit.displayName,
        unit.key,
        'entity',
        "Frederick H. Dyer, A Compendium of the War of the Rebellion (1908), Part 3",
        'https://www.nps.gov/subjects/civilwar/search-battle-units.htm',
        organized,
        mustered,
        text.slice(0, 1200),
      ]
        .map(csvField)
        .join(','),
    );

    if (eventsForAll || eventKeys.has(unit.key)) {
      // Engagement extraction, defensively: sentences whose tail is an
      // unambiguous "Month D(-D)(, YYYY)" — year tracked forward through
      // the narrative; anything murkier stays prose.
      let year: number | null = null;
      const service = text.split(/SERVICE\.?[—-]/i)[1] ?? text;
      for (const sentence of service.split(/(?<=[a-z0-9])\.\s+/)) {
        const yearHit = /\b(18[56][0-9])\b/.exec(sentence);
        if (yearHit) year = Number(yearHit[1]);
        // Tails Dyer actually writes: "October 3-4", "May 30- June 12",
        // "September 13-November 20", "April 6-7, 1862".
        const m = new RegExp(
          `^(.{4,90}?)[,.]?\\s${MONTHS}\\s+\\d{1,2}` +
            `(?:\\s*[-–]\\s*(?:${MONTHS}\\s+)?\\d{1,2})?` +
            `(?:,\\s*(18[56][0-9]))?\\s*$`,
        ).exec(sentence.trim());
        if (!m) continue;
        const trailingYear = m[4] ?? m[3];
        const eventYear = trailingYear ? Number(trailingYear) : year;
        if (!eventYear) continue;
        const what = m[1]!.trim();
        const engagementish =
          /battle|siege|skirmish|action|engagement|assault|capture|expedition|occupation|surrender|affair|raid|operations/i.test(
            what,
          );
        if (what.length < 4 || !engagementish) continue;
        events.push(
          [`cw-regiments:${unit.key.toLowerCase()}`, 'engagement', String(eventYear), what.slice(0, 120),
           "Dyer's Compendium (1908), Part 3"].map(csvField).join(','),
        );
        eventCount += 1;
      }
    }
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'records.csv'), records.join('\n') + '\n');
  if (eventCount > 0) writeFileSync(join(outDir, 'events.csv'), events.join('\n') + '\n');

  console.log(
    `${byKey.size} unique units (${units.length} entries incl. Part 1/3 duplicates); ` +
      `${skippedHeadings} headings unparsed; ${eventCount} engagement events for ${eventKeys.size} sampled units.`,
  );
  const byState = new Map<string, number>();
  for (const u of byKey.values()) byState.set(u.state, (byState.get(u.state) ?? 0) + 1);
  console.log([...byState.entries()].sort().map(([s, n]) => `${s}:${n}`).join(' '));
  if (skippedSample.length) console.log('\nUnparsed heading sample:\n  ' + skippedSample.slice(0, 12).join('\n  '));
}

/**
 * The scan's habitual misreads of a war that ran 1861–1866: "1802" for
 * 1862, "1R63", "18*4", "Mav", "Julv", "Oet", "Doc". Years are repaired
 * only inside the war's decade — a genuine 1802 never appears in a
 * regimental service narrative — and month words only when the misread
 * is unambiguous. Dyer's own abbreviations ("Jany", "Feby") stay.
 */
function repairOcr(text: string): string {
  return text
    .replace(/\b1[8R][0*?8]([1-6])\b/g, '186$1')
    .replace(/\b1R6([0-6])\b/g, '186$1')
    .replace(/\b18[*?]([0-6])\b/g, '186$1')
    .replace(/\b18[0-6][lI]\b/g, (m) => m.replace(/[lI]$/, '1'))
    .replace(/\bMav\b/g, 'May')
    .replace(/\bJulv\b/g, 'July')
    .replace(/\bOet\b/g, 'Oct')
    .replace(/\bMareh\b/g, 'March')
    .replace(/\bAnril\b/g, 'April')
    .replace(/\bXov\b/g, 'Nov')
    .replace(/\bDoc\.(?=\s+\d)/g, 'Dec.')
    .replace(/\bREGIMENT\s+(?:IN\s*FANTR\s*Y|TN PANTRY|DSFANTRY|I N FA NT It Y|IN KAN Tit V)/g, 'REGIMENT INFANTRY');
}

/** The scan shreds caps words ("IN FAN TRY", "1 X FAXTR V") — collapse
    and pattern-repair the branch word before the parser sees it. */
function repairBranch(text: string): string {
  const collapsed = text.toUpperCase().replace(/[^A-Z]/g, '');
  if (/N?F[A-Z]?[NK]TR|FANTRY|KANTRY|PANTRY|FAXTR|FANRRY|PASTRY|INFANTKY|DSFANTRY|^INF$|^I$|^INY$/.test(collapsed)) return 'INFANTRY';
  if (/CAV[AN]LR|AVALRY|CAVLY|CAV$|CAYALHY|CAVATJAY|CAVAIRV|CAVAIJTY|DRAOOONS|DRAGOONS|^COT$|^OO$/.test(collapsed)) return 'CAVALRY';
  if (/AKTILLERY/.test(collapsed)) return 'HEAVY ARTILLERY';
  if (/EXGIVEERS|ENGIVEERS/.test(collapsed)) return 'ENGINEERS';
  if (/HEAVYART|HVYART/.test(collapsed)) return 'HEAVY ARTILLERY';
  if (/LI?[GT]HTART|LTART/.test(collapsed)) return 'LIGHT ARTILLERY';
  if (/RTILLER|ARTY/.test(collapsed)) return 'ARTILLERY';
  if (/ENGINEER/.test(collapsed)) return 'ENGINEERS';
  if (/SHARPSHOOTER/.test(collapsed)) return 'SHARPSHOOTERS';
  return text;
}

function ordSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10]!;
}
function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])[a-z]/g, (c) => c.toUpperCase());
}

main();
