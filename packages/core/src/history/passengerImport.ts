/**
 * Reading a transcribed passenger list into the dataset shape. Kept out
 * of the CLI so the parsing is testable on its own — the shapes these
 * lists arrive in are the fiddly part, not the file handling.
 */

import { splitName, type Passenger } from './passengers.js';

/** RFC4180-ish: quoted fields, doubled quotes, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** "c. 1584", "abt 1584", "1584?" all mean 1584; anything else means nothing. */
export function parseYear(raw: string): number | null {
  const match = /(\d{3,4})/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1400 && year <= 1900 ? year : null;
}

function pick(header: string[], row: string[], ...names: string[]): string {
  for (const name of names) {
    const index = header.indexOf(name);
    if (index !== -1 && row[index]?.trim()) return row[index]!.trim();
  }
  return '';
}

function slug(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const PARTIAL_ISO = /^\d{4}(-\d{2}){0,2}$/;

/** What a port register adds beyond the name — when it recorded the person
    and where the ship was bound. Reconstructions carry neither. */
function registerFields(header: string[], row: string[]): Pick<Passenger, 'registerDate' | 'boundFor'> {
  const date = pick(header, row, 'date', 'register_date', 'registered');
  const boundFor = pick(header, row, 'destination', 'bound_for');
  return {
    ...(PARTIAL_ISO.test(date) ? { registerDate: date } : {}),
    ...(boundFor ? { boundFor } : {}),
  };
}

/**
 * Rows to passengers. The header names the columns (see
 * data/immigrant-ships/README.md); anything unrecognized is ignored
 * rather than guessed at.
 */
export function rowsToPassengers(
  rows: string[][],
  voyageId: string,
  fallbackSource: string,
): Passenger[] {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const seen = new Map<string, number>();
  const passengers: Passenger[] = [];
  for (const row of rows.slice(1)) {
    const given = pick(header, row, 'given', 'given_names', 'first_name', 'forename');
    const surname = pick(header, row, 'surname', 'last_name', 'family_name');
    const whole = pick(header, row, 'name', 'full_name', 'passenger');
    const parts = given || surname ? { givenNames: given, surname } : splitName(whole);
    if (!parts.surname && !parts.givenNames) continue;
    const fullName = whole || `${parts.givenNames} ${parts.surname}`.trim();
    // Lists that give ages rather than dates: "38", not "1584".
    const ageRaw = pick(header, row, 'age');
    const age = /^\d{1,3}$/.test(ageRaw) ? Number(ageRaw) : null;

    // Two John Cookes on one list are two rows, not one.
    const base = `${voyageId}:${slug(parts.surname)}-${slug(parts.givenNames)}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);

    passengers.push({
      id: count === 1 ? base : `${base}-${count}`,
      voyageId,
      fullName,
      givenNames: parts.givenNames,
      surname: parts.surname,
      birthYear: parseYear(pick(header, row, 'birth', 'birth_year', 'born')),
      deathYear: parseYear(pick(header, row, 'death', 'death_year', 'died')),
      ageAtVoyage: age,
      ...(pick(header, row, 'notes') ? { notes: pick(header, row, 'notes') } : {}),
      ...registerFields(header, row),
      source: pick(header, row, 'source') || fallbackSource,
    });
  }
  return passengers;
}
