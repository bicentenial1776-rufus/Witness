// The pure text-extraction halves of the passenger-list OCR parsers —
// shared by scripts/parse-banks.ts and scripts/parse-hotten.ts (which own
// the file walking, ship detection, and CSV emission) and unit-tested in
// __tests__/passengerParsers.test.ts.

// ---------------------------------------------------------------------
// Banks, *Planters of the Commonwealth* (1930): title-case name lines.

// Whole words that mark a line as narrative prose, not a passenger.
const PROSE_WORDS =
  /\b(Master|tons?|sailed|arrived|passengers?|ordnance|brought|vessel|ships?|fleet|colonists?|Gravesend|Southampton|Weymouth|Bristol|cattle|voyage|records?|probably|supra|ibid)\b/i;

// A leading token that starts a sentence, a month, or page furniture —
// never a given name in these lists.
const BAD_FIRST = new Set([
  'The', 'She', 'He', 'They', 'It', 'In', 'On', 'At', 'Of', 'And', 'But',
  'His', 'Her', 'Among', 'About', 'After', 'Before', 'When', 'With', 'This',
  'These', 'There', 'Left', 'Arrived', 'Sailed', 'See', 'Note', 'Captain',
  'New', 'Cape', 'Point', 'Lists', 'List', 'Part', 'Passengers', 'January',
  'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'Bound', 'Per', 'Via', 'From', 'For',
  'Saint', 'St',
]);

const TITLES = /^(Mr|Mrs|Rev|Sir|Dr|Capt|Lady|Widow|Goodman|Goodwife)\.?$/;
const NAME_TOKEN = /^[A-Z][A-Za-z'’-]+[,.]?$/;
const SUFFIX = /^(Jr|Sr|I{1,3}|IV)\.?,?$/;

/** Leading title-case name tokens of a line, or null when it isn't a name line. */
export function readName(line: string): { given: string; surname: string; rest: string } | null {
  if (!/^[A-Z]/.test(line)) return null;
  if (line === line.toUpperCase()) return null; // headings / furniture
  if (PROSE_WORDS.test(line)) return null;
  const tokens = line.split(/\s+/);
  let i = 0;
  const name: string[] = [];
  if (TITLES.test(tokens[0] ?? '')) i += 1;
  while (i < tokens.length && name.length < 4) {
    const raw = tokens[i] ?? '';
    if (!NAME_TOKEN.test(raw)) break;
    const bare = raw.replace(/[,.]$/, '');
    if (name.length === 0 && BAD_FIRST.has(bare)) return null;
    // A genitive first token ("Olave's Southwark") is a displaced parish
    // fragment ("St. Olave's, Southwark"), never a given name.
    if (name.length === 0 && /[’']s$/.test(bare)) return null;
    name.push(bare);
    const stop = raw.endsWith(',') || raw.endsWith('.');
    i += 1;
    if (stop) break;
  }
  // A suffix directly after the name (Jr., Sr.) belongs to it, not the notes.
  const after = tokens[i];
  if (after !== undefined && SUFFIX.test(after)) {
    name.push(after.replace(/[,.]$/, ''));
    i += 1;
  }
  if (name.length < 2) return null;
  const suffixes: string[] = [];
  while (name.length > 2 && SUFFIX.test(name[name.length - 1] ?? '')) suffixes.push(name.pop()!);
  const surname = name.pop()!;
  const given = name.join(' ');
  const restParts = tokens.slice(i).join(' ');
  const rest = [suffixes.join(' '), restParts].filter(Boolean).join('; ');
  return { given, surname, rest };
}

// ---------------------------------------------------------------------
// Hotten, *The Original Lists* (1874): ALL-CAPS register lines with ages.

const GIVEN_ABBREV: Record<string, string> = {
  jo: 'John', tho: 'Thomas', wm: 'William', geo: 'George', rich: 'Richard',
  ric: 'Richard', sam: 'Samuel', nic: 'Nicholas', nica: 'Nicholas',
  rob: 'Robert', robt: 'Robert', edw: 'Edward', fra: 'Francis',
  franc: 'Francis', mich: 'Michael', dan: 'Daniel', nath: 'Nathaniel',
  benj: 'Benjamin', anth: 'Anthony', chr: 'Christopher', hen: 'Henry',
  eliz: 'Elizabeth', eliza: 'Elizabeth', marg: 'Margaret', margt: 'Margaret',
  kath: 'Katherine', math: 'Matthew', mat: 'Matthew', abra: 'Abraham',
  tim: 'Timothy', walt: 'Walter', phil: 'Philip', ste: 'Stephen',
  steph: 'Stephen', gab: 'Gabriel', lawr: 'Lawrence', arth: 'Arthur',
  jon: 'Jonathan', jos: 'Joseph', humph: 'Humphrey', barth: 'Bartholomew',
  theo: 'Theophilus', zach: 'Zachary', jeff: 'Jeffrey', greg: 'Gregory',
  wittm: 'William', wlftm: 'William', wiftm: 'William', wllm: 'William',
  anto: 'Anthony', antho: 'Anthony',
};

/** Repair 'l' misread for 'I' inside an uppercase run (WlLCOCK → WILCOCK). */
export function fixCapsL(s: string): string {
  let out = s;
  for (let pass = 0; pass < 3; pass += 1) {
    out = out.replace(/([A-Z])l(?=[A-Z])/g, '$1I').replace(/(^|\s)l([A-Z])/g, '$1I$2');
  }
  // A glued footnote mark after a caps run: "HEFORDf" — never a real
  // lowercase ending in these all-caps registers.
  return out.replace(/([A-Z]{3,})[ft*]\b/g, '$1');
}

export function registerTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bAnd\b/g, 'and');
}

export function expandGiven(token: string): string {
  const key = token.toLowerCase().replace(/[:.°'’]+$/, '');
  return GIVEN_ABBREV[key] ?? registerTitleCase(token.replace(/[:.°]+$/, ''));
}

export function normalizeAge(raw: string): number | null {
  const cleaned = raw.replace(/[Oo]/g, '0').replace(/[lI!]/g, '1').replace(/S/g, '5');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

export interface RegisterEntry {
  given: string;
  surname: string;
  birth: string;
  notes: string;
}

/**
 * Passenger entries on one register line. A line may hold several people
 * joined by '&' ("EDMOND WEAVER 28 yers & his wife MARGRETT aged 30");
 * a lone given name inherits the surname of the person before it, and an
 * age becomes a derived birth year ("c. 1607").
 */
export function extractEntries(
  line: string,
  year: number,
  lastSurname: string,
): { entries: RegisterEntry[]; lastSurname: string } {
  const entries: RegisterEntry[] = [];
  const segments = line.split(/\s+&\s+/);
  for (const seg of segments) {
    const m =
      /([A-Z][A-Za-z:.'’°\[\]\- ]{1,40}?)[\s.…_\-•'’,*]*([0-9OoIl!Si]{1,2})[.,]?\s*(?:yeres|yers|yeeres|yeres\.)?\.?\s*$/.exec(
        seg.trim().replace(/[*†|]/g, ''),
      );
    if (!m) continue;
    const age = normalizeAge(m[2]!);
    if (age === null) continue;
    // Strip leading occupation prose: keep from the last run of 2+ caps-ish
    // name tokens. Bracketed corrections win over the misreading.
    const namePart = fixCapsL(m[1]!)
      .replace(/[A-Za-z'’]+\s*\[\s*(?:or\s+)?([A-Za-z'’]+)\s*\]/g, '$1')
      .replace(/[.…_]+/g, ' ')
      .trim();
    const tokens = namePart.split(/\s+/).filter((t) => /^[A-Za-z:'’°-]+$/.test(t));
    // Name tokens are (mostly) upper-case in the registers; occupation
    // prefixes are not. Walk from the end collecting caps-run tokens.
    const nameTokens: string[] = [];
    for (let t = tokens.length - 1; t >= 0 && nameTokens.length < 4; t -= 1) {
      const tok = tokens[t]!;
      const letters = tok.replace(/[^A-Za-z]/g, '');
      const upper = letters.replace(/[^A-Z]/g, '').length;
      // "Jo:"/"NlC°:" — an abbreviated given name is a name token even
      // though its caps ratio is low.
      const abbreviated = /^[A-Z][A-Za-z]{0,5}[:°]$/.test(tok);
      if (abbreviated || (letters.length >= 2 && upper / letters.length >= 0.6)) {
        nameTokens.unshift(tok);
      } else if (nameTokens.length > 0) break;
    }
    if (nameTokens.length === 0) continue;
    const prefix = tokens.slice(0, tokens.length - nameTokens.length).join(' ');
    let given: string;
    let surname: string;
    if (nameTokens.length === 1) {
      // "his wife MARGRETT aged 30" — a lone name inherits the surname.
      given = expandGiven(nameTokens[0]!);
      surname = lastSurname;
      if (!surname) continue;
    } else {
      surname = registerTitleCase(
        fixCapsL(nameTokens[nameTokens.length - 1]!).replace(/[:.°'’]+$/, ''),
      );
      given = nameTokens.slice(0, -1).map(expandGiven).join(' ');
      lastSurname = surname;
    }
    const notes = [prefix && /^[A-Za-z]/.test(prefix) ? prefix : '', `aged ${age} in ${year}`]
      .filter(Boolean)
      .join('; ');
    entries.push({ given, surname, birth: `c. ${year - age}`, notes });
  }
  return { entries, lastSurname };
}
