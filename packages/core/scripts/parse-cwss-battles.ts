// Engagements for the cw-regiments register from the National Park
// Service's Civil War Soldiers and Sailors System (CWSS) — the unit and
// battle tables, not the 6.3M-name soldier index, which is never
// ingested (docs/witness-civil-war-prompt.md, decision 1).
//
// The NPS shipped its 2011 CWSS "civilwar150th" OData feeds to a
// researcher on request; they sit in a public S3 bucket
// (s3://jrnold-nps-cwss/old/: battle.xml, battleunitlink.xml, units.xml —
// US government work). battle.xml is the 382 CWSAC battles (name, state,
// dates, campaign, result, summary); battleunitlink.xml links 17,887
// (battle, unit) pairs, source DYER; units.xml names 6,944 units. None
// carries coordinates, so this script geocodes each battle through
// Wikidata (battles of the American Civil War with P625) and, for the
// rest, Nominatim on "<name>, <state>", caching every answer in
// battles-coords.json beside the outputs so re-runs cost nothing.
//
// CWSS unit names go through the register's own unit parser
// (makeUnitParser + unit-terms.json) to the US-{STATE}-{BRANCH}-{NUMBER}
// key, and join to Dyer's records.csv on entity_key — so an engagement
// attaches only to a unit Witness already holds.
//
//   npx tsx scripts/parse-cwss-battles.ts <cwssDir> ../../data/registers/cw-regiments [--geocode]
//
// Emits battles.csv (reference) and events.csv (seed-register format,
// replacing the Dyer-OCR sample) plus a coverage report.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseCsv } from '../src/history/passengerImport.js';
import { makeUnitParser, type UnitTerms } from '../src/registers/normalizers/unitDesignation.js';

const UA = 'Witness/0.1 (family history app; witnesslives.com)';

function csvField(f: string | number | null | undefined): string {
  const s = f === null || f === undefined ? '' : String(f);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The OData Atom feeds are not well-formed XML (bare bytes in summaries); read them leniently. */
function entries(path: string): Record<string, string | null>[] {
  const text = readFileSync(path, 'utf8');
  const out: Record<string, string | null>[] = [];
  for (const block of text.matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/g)) {
    const d: Record<string, string | null> = {};
    for (const m of block[1]!.matchAll(/<d:(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/d:\1>|<d:(\w+)\s[^>]*m:null="true"\s*\/>/g)) {
      if (m[1]) d[m[1]] = decode(m[2]!.trim());
      else d[m[3]!] = null;
    }
    out.push(d);
  }
  return out;
}

function decode(s: string): string {
  return s
    .replace(/&#xD;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\uFFFD/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^(first |second |third |1st |2nd |3rd )?(battle|siege|engagement|action|skirmish|capture|bombardment|raid|expedition|fall) (of|on|at) /, '')
    .replace(/\s+(i|ii|iii|iv)$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

interface Coord {
  lat: number;
  lng: number;
  source: string;
}

async function wikidataBattles(): Promise<Map<string, Coord>> {
  const q = `SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
    { ?item wdt:P607 wd:Q8676 . } UNION { ?item wdt:P361 wd:Q8676 . }
    ?item wdt:P625 ?coord .
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`;
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  const body = (await res.json()) as { results: { bindings: { item: { value: string }; itemLabel: { value: string }; coord: { value: string } }[] } };
  const out = new Map<string, Coord>();
  for (const row of body.results.bindings) {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord.value);
    if (!m) continue;
    const key = norm(row.itemLabel.value);
    if (!key || out.has(key)) continue;
    out.set(key, { lng: Number(m[1]), lat: Number(m[2]), source: `Wikidata ${row.item.value.split('/').pop()}` });
  }
  return out;
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AR: 'Arkansas', CO: 'Colorado', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  ID: 'Idaho', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', MD: 'Maryland', MN: 'Minnesota',
  MO: 'Missouri', MS: 'Mississippi', NC: 'North Carolina', ND: 'North Dakota', NM: 'New Mexico', OH: 'Ohio',
  OK: 'Oklahoma', PA: 'Pennsylvania', SC: 'South Carolina', TN: 'Tennessee', TX: 'Texas', VA: 'Virginia',
  WV: 'West Virginia', AZ: 'Arizona', CA: 'California', MT: 'Montana', NE: 'Nebraska', WY: 'Wyoming', UT: 'Utah',
  NV: 'Nevada', OR: 'Oregon', WA: 'Washington', IA: 'Iowa', IL: 'Illinois', MI: 'Michigan', WI: 'Wisconsin',
  NY: 'New York', NJ: 'New Jersey', DE: 'Delaware', CT: 'Connecticut', MA: 'Massachusetts', VT: 'Vermont',
  NH: 'New Hampshire', ME: 'Maine', RI: 'Rhode Island',
};

/**
 * A town-scale fallback. The answer must sit in the battle's own state
 * — a bare name like "Liberty" or "Wilderness" exists in forty states
 * and Nominatim will happily hand back the wrong one.
 */
async function nominatim(name: string, stateCode: string): Promise<Coord | null> {
  const stateName = STATE_NAMES[stateCode];
  if (!stateName) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=us&q=${encodeURIComponent(`${name}, ${stateName}`)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  const hit = rows.find((r) => r.display_name.includes(stateName));
  if (!hit) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon), source: `OpenStreetMap: ${hit.display_name}` };
}

async function main() {
  const args = process.argv.slice(2);
  const geocode = args.includes('--geocode');
  const [cwssDir, outDir] = args.filter((a) => !a.startsWith('--'));
  if (!cwssDir || !outDir) {
    console.error('usage: parse-cwss-battles.ts <cwssDir> <outDir> [--geocode]');
    process.exit(1);
  }

  const battles = entries(join(cwssDir, 'battle.xml'));
  const links = entries(join(cwssDir, 'battleunitlink.xml'));
  const units = entries(join(cwssDir, 'units.xml'));
  console.log(`CWSS: ${battles.length} battles, ${units.length} units, ${links.length} battle–unit links`);

  // ── Coordinates: cache → Wikidata → Nominatim ────────────────────────
  const cachePath = join(outDir, 'battles-coords.json');
  const cache: Record<string, Coord> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  let wd: Map<string, Coord> | null = null;
  let fromCache = 0, fromWikidata = 0, fromOsm = 0, unplaced = 0;
  for (const b of battles) {
    const code = b['BattlefieldCode']!;
    if (cache[code]) {
      fromCache++;
      continue;
    }
    wd ??= await wikidataBattles();
    const names = [b['BattleName'] ?? '', ...((b['SecondaryName'] ?? '').split(/[;,/]/))].map((n) => norm(n)).filter(Boolean);
    const hit = names.map((n) => wd!.get(n)).find(Boolean);
    if (hit) {
      cache[code] = hit;
      fromWikidata++;
      continue;
    }
    if (geocode && b['BattleName'] && b['State']) {
      const place = b['BattleName'].replace(/\s+(I|II|III|IV)$/, '');
      const osm = await nominatim(place, b['State']);
      await new Promise((r) => setTimeout(r, 1100)); // Nominatim: one request a second
      if (osm) {
        cache[code] = osm;
        fromOsm++;
        continue;
      }
    }
    unplaced++;
  }
  writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
  console.log(`coordinates: ${fromCache} cached, ${fromWikidata} Wikidata, ${fromOsm} OpenStreetMap, ${unplaced} unplaced`);

  // ── Units: CWSS name → unit key → Dyer record ─────────────────────────
  const terms = JSON.parse(readFileSync(join(outDir, 'unit-terms.json'), 'utf8')) as UnitTerms;
  const parseUnit = makeUnitParser(terms);
  const records = parseCsv(readFileSync(join(outDir, 'records.csv'), 'utf8'));
  const header = records[0]!.map((h) => h.trim());
  const idCol = header.indexOf('id');
  const keyCol = header.indexOf('entity_key');
  const dyerByKey = new Map<string, string>();
  for (const row of records.slice(1)) {
    const key = row[keyCol]?.trim();
    if (key) dyerByKey.set(key, row[idCol]!.trim());
  }
  const dyerByUnitCode = new Map<string, string>();
  let unionUnits = 0, parsed = 0, joined = 0;
  for (const u of units) {
    const code = u['UnitCode'] ?? '';
    const name = u['UnitName'] ?? '';
    if (!code.startsWith('U')) continue; // Dyer is Union-only; Confederate links wait on Confederate records
    unionUnits++;
    const p = parseUnit(name);
    if (!p || p.confidence !== 'high') continue;
    parsed++;
    const dyerId = dyerByKey.get(p.unitKey);
    if (!dyerId) continue;
    joined++;
    dyerByUnitCode.set(code, dyerId);
  }
  console.log(`units: ${unionUnits} Union in CWSS, ${parsed} parsed to a key, ${joined} joined to a Dyer record (of ${dyerByKey.size})`);

  // ── Events ───────────────────────────────────────────────────────────
  const battleByCode = new Map(battles.map((b) => [b['BattlefieldCode']!.toLowerCase(), b]));
  const eventRows: string[][] = [];
  const seen = new Set<string>();
  let linkedUnits = new Set<string>();
  for (const l of links) {
    const dyerId = dyerByUnitCode.get(l['UnitCode'] ?? '');
    const b = battleByCode.get((l['BattlefieldCode'] ?? '').toLowerCase());
    if (!dyerId || !b) continue;
    const dedupe = `${dyerId}|${b['BattlefieldCode']}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    linkedUnits.add(dyerId);
    const begin = b['BeginDate'] ?? '';
    const end = b['EndDate'] ?? '';
    const year = /(\d{4})$/.exec(begin)?.[1] ?? '';
    const endYear = /(\d{4})$/.exec(end)?.[1] ?? '';
    const coord = cache[b['BattlefieldCode']!];
    const kind = (b['BattleType'] && b['BattleType'] !== 'No Data' ? b['BattleType'] : 'Engagement').toLowerCase();
    eventRows.push([
      dyerId,
      'engagement',
      year,
      endYear && endYear !== year ? endYear : '',
      `${b['BattleName']}${b['SecondaryName'] ? ` (${b['SecondaryName']})` : ''}, ${b['State']} — ${kind}${begin ? `, ${begin}` : ''}`,
      coord ? String(coord.lat) : '',
      coord ? String(coord.lng) : '',
      b['BattlefieldCode']!,
      'NPS Civil War Soldiers and Sailors System, battle–unit links (from Dyer) and CWSAC battle summaries; coordinates ' + (coord ? coord.source.split(':')[0] : 'unplaced'),
    ]);
  }
  eventRows.sort((a, b) => a[0]!.localeCompare(b[0]!) || Number(a[2]) - Number(b[2]) || a[4]!.localeCompare(b[4]!));
  const placed = eventRows.filter((r) => r[5]).length;
  writeFileSync(
    join(outDir, 'events.csv'),
    ['record_id,event_type,event_year,event_end_year,place_text,latitude,longitude,linked_event_ref,source', ...eventRows.map((r) => r.map(csvField).join(','))].join('\n') + '\n',
  );
  console.log(`events: ${eventRows.length} engagements across ${linkedUnits.size} Dyer units, ${placed} with coordinates`);

  // ── Battles reference ────────────────────────────────────────────────
  const battleRows = battles.map((b) => {
    const coord = cache[b['BattlefieldCode']!];
    return [
      b['BattlefieldCode'], b['BattleName'], b['SecondaryName'], b['State'], b['BeginDate'], b['EndDate'],
      b['CampaignName'], b['Result'], coord ? coord.lat : '', coord ? coord.lng : '', coord ? coord.source : '',
      (b['ShortSummary'] ?? '').slice(0, 600),
    ].map(csvField).join(',');
  });
  writeFileSync(
    join(outDir, 'battles.csv'),
    ['code,name,secondary_name,state,begin_date,end_date,campaign,result,latitude,longitude,coord_source,summary', ...battleRows].join('\n') + '\n',
  );
  console.log(`battles.csv: ${battleRows.length} rows`);
}

void main();
