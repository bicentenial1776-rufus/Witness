// Parse the OCR text of the Sieur de la Roque's 1752 journal and census
// of Île Royale and Île Saint-Jean — the English translation printed in
// the Report Concerning Canadian Archives for 1905 (public domain) — into
// rows for the acadian-deportation register. These are the populations
// the 1758 deportations emptied (the Duke William sailed from Île
// Saint-Jean), so the census is the record that places a family in the
// deportation's path.
//
// Entry grammar the translation uses, OCR-noise tolerated:
//   "Charles Douaron, ploughman, native of la Cadie, aged 33 years. …
//    Married to Marie Madeleine Tibouday, native of Port Royal, aged 35
//    years. They have four sons and three daughters :— Baptiste, aged 10
//    years ; …"
// Heads and wives carry their own surnames; children inherit the head's.
// Ages become derived birth years (1752 − age). Settlement context comes
// from the journal's "Census of the settlers at <place>" headers.
//
//   npx tsx scripts/parse-laroque.ts <report.txt> <out.csv>
//
// Emits CSV rows WITH EXPLICIT IDS (laroque-<n>) so they can never
// collide with the Winslow roll's slug ids in the same register.

import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE =
  'Journal and census of the Sieur de la Roque, Île Royale and Île Saint-Jean, 1752 ' +
  '(English translation, Report Concerning Canadian Archives for 1905, vol. II — public domain)';
const AID = 'https://archive.org/details/reportconcerning21publ';

function normalizeAge(raw: string): number | null {
  const cleaned = raw
    .replace(/[lI!]/g, '1')
    .replace(/G/g, '6')
    .replace(/S/g, '8')
    .replace(/[Oo]/g, '0')
    .replace(/[^0-9]/g, '');
  const n = Number(cleaned.slice(0, 2));
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

function cleanName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\bd it\b/g, 'dit')
    .trim()
    .replace(/[,.;:]+$/, '');
}

function surnameOf(name: string): string {
  const stop = name.split(/\s+dit\s+/)[0]!.trim();
  return stop.split(/\s+/).pop() ?? '';
}

function main() {
  const [input, out] = process.argv.slice(2);
  if (!input || !out) {
    console.error('usage: parse-laroque.ts <report.txt> <out.csv>');
    process.exit(1);
  }
  const raw = readFileSync(input, 'utf8');
  // Rejoin hyphen wraps, collapse the OCR's double-spacing.
  const text = raw.replace(/-\s*\n\s*/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // The census proper ends where the printed index begins.
  const indexStart = text.search(/[A-Z][a-z]+,\s+[A-Z][a-z]+,\s+[A-Za-z. ]+,\s+p\.\s*\d/);
  const body = indexStart > 0 ? text.slice(0, indexStart) : text;

  interface Row {
    id: string;
    name: string;
    given: string;
    surname: string;
    birth: number | null;
    role: string;
    settlement: string;
    origin: string;
  }
  const rows: Row[] = [];
  let counter = 0;
  const push = (
    name: string,
    surname: string,
    age: number | null,
    role: string,
    settlement: string,
    origin: string,
  ) => {
    const cleaned = cleanName(name);
    if (!cleaned || cleaned.split(' ').length > 5) return;
    counter += 1;
    const given = cleaned.split(/\s+dit\s+/)[0]!.split(/\s+/).slice(0, -1).join(' ') || cleaned;
    rows.push({
      id: `acadian-deportation:laroque-${counter}`,
      name: cleaned,
      given:
        role === 'child' && cleaned.split(' ').length >= 2
          ? cleaned.split(' ').slice(0, -1).join(' ')
          : role === 'child'
            ? cleaned
            : given,
      surname,
      birth: age !== null ? 1752 - age : null,
      role,
      settlement,
      origin,
    });
  };

  // Settlement headers ride the journal prose.
  const segments = body.split(/(?=Census of the settlers (?:at|of|on) )/);
  let settlement = '';

  const HEAD =
    /([A-Z][A-Za-zé' ]{2,40}?),\s+(?:widow of [^,]+,\s+)?([a-z][a-zé ]{2,25}?),\s+native of ([A-Za-zé'.’ ]{2,30}?),\s+aged ([0-9lIGSO]{1,3})\s+years/g;
  const WIFE =
    /Married(?: in second wedlock)? to ([A-Z][A-Za-zé' ]{2,40}?),\s+native of ([A-Za-zé'.’ ]{2,30}?),\s+aged ([0-9lIGSO]{1,3})\s+years/g;
  const CHILD = /([A-Z][A-Za-zé' ]{2,30}?),\s+aged ([0-9lIGSO]{1,3})\s+(?:years|months)/g;

  for (const segment of segments) {
    const header = /Census of the settlers (?:at|of|on) ([A-Za-zé'. ’-]{3,40})/.exec(segment);
    if (header) settlement = cleanName(header[1]!.split(/[,.]/)[0] ?? '');

    // Walk household by household: each head match owns the text until
    // the next head, and the wife/children inside it inherit context.
    const heads = [...segment.matchAll(HEAD)];
    for (let i = 0; i < heads.length; i += 1) {
      const head = heads[i]!;
      const householdEnd = i + 1 < heads.length ? heads[i + 1]!.index! : segment.length;
      const household = segment.slice(head.index!, householdEnd);
      const headName = cleanName(head[1]!);
      const surname = surnameOf(headName);
      // Guard: prose fragments ("They", "The", month names) are not heads.
      if (/^(They|The|She|He|His|Her|In|On|At|We|It)\b/.test(headName)) continue;
      // "NAME, his wife, native of…" is a spouse the WIFE grammar missed,
      // not a household head.
      const occupation = head[2]!.trim();
      const spouse = /wife|husband/.test(occupation);
      push(
        headName,
        surname,
        normalizeAge(head[4]!),
        spouse ? 'wife' : `head — ${occupation}`,
        settlement,
        head[3]!.trim(),
      );
      if (spouse) continue;

      const wife = WIFE.exec(household);
      WIFE.lastIndex = 0;
      if (wife) {
        const wifeName = cleanName(wife[1]!);
        push(wifeName, surnameOf(wifeName), normalizeAge(wife[3]!), 'wife', settlement, wife[2]!.trim());
      }

      // Children: only inside the "sons and daughters" run, to keep prose out.
      const kidsStart = household.search(/sons? and .{0,20}daughters?|daughters? and .{0,20}sons?|have .{0,12}(sons?|daughters?|child)/);
      if (kidsStart >= 0) {
        const kidZone = household.slice(kidsStart, kidsStart + 1200);
        for (const kid of kidZone.matchAll(CHILD)) {
          const kidName = cleanName(kid[1]!);
          if (/^(They|Married|Native|Aged)\b/i.test(kidName)) continue;
          if (kidName.split(' ').length > 3) continue;
          // A child with a full name of their own (a niece, a lodger)
          // keeps their own surname; bare given names inherit the head's.
          const kidWords = kidName.split(' ');
          const kidSurname = kidWords.length >= 2 ? kidWords[kidWords.length - 1]! : surname;
          push(kidName, kidSurname, normalizeAge(kid[2]!), 'child', settlement, '');
        }
      }
    }
  }

  const seen = new Set<string>();
  const csv = ['id,name,given,surname,birth_year,event_year,notes,source,finding_aid_url'];
  for (const row of rows) {
    const dedupe = `${row.name}|${row.surname}|${row.birth}|${row.settlement}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const notes = [
      `${row.role} in the 1752 census`,
      row.settlement ? `at ${row.settlement}` : '',
      row.origin ? `native of ${row.origin}` : '',
    ]
      .filter(Boolean)
      .join('; ');
    const fields = [
      row.id,
      row.name,
      row.given,
      row.surname,
      row.birth !== null ? `c. ${row.birth}` : '',
      '1752',
      notes,
      SOURCE,
      AID,
    ].map((f) => (/[",]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f));
    csv.push(fields.join(','));
  }
  writeFileSync(out, csv.join('\n') + '\n');
  const headsN = rows.filter((r) => r.role.startsWith('head')).length;
  const wives = rows.filter((r) => r.role === 'wife').length;
  const children = rows.filter((r) => r.role === 'child').length;
  console.log(
    `${csv.length - 1} rows (${headsN} heads, ${wives} wives, ${children} children) across the census.`,
  );
}

main();
