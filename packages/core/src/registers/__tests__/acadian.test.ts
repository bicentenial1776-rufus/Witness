import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseCsv } from '../../history/passengerImport.js';
import { scoreExposure } from '../exposure.js';
import { matchRegisterRecords } from '../match.js';
import { makeAcadianPlugin, type AcadianNameVariants } from '../normalizers/acadianNames.js';
import type { ExposureConfig, RegisterPersonFacts, RegisterRecord } from '../types.js';

const DATA_DIR = join(__dirname, '../../../../../data/registers/acadian-deportation');
const variants = JSON.parse(
  readFileSync(join(DATA_DIR, 'name-variants.json'), 'utf8'),
) as AcadianNameVariants;
const registerJson = JSON.parse(readFileSync(join(DATA_DIR, 'register.json'), 'utf8')) as {
  config: { exposure: ExposureConfig };
};
const plugin = makeAcadianPlugin(variants);

const record = (over: Partial<RegisterRecord> = {}): RegisterRecord => ({
  id: 'acadian-deportation:leblanc-charle',
  registerKey: 'acadian-deportation',
  recordKind: 'person',
  nameAsRecorded: 'Charle LEBLANC',
  surnameNormalized: 'Leblanc',
  givenNormalized: 'Charle',
  entityKey: null,
  attributes: { event_year: 1755 },
  sourceCitation: 'Winslow roll (test)',
  findingAidUrl: null,
  ...over,
});

const person = (over: Partial<RegisterPersonFacts> = {}): RegisterPersonFacts => ({
  id: 'p1',
  fullName: 'Charles LeBlanc',
  sex: 'M',
  birthYear: 1720,
  deathYear: 1790,
  events: [{ type: 'birth', year: 1720, placeParts: ['Grand Pré', 'Acadia'] }],
  ...over,
});

describe('acadianNames normalizer', () => {
  it('folds French/English given equivalents both ways', () => {
    expect(plugin.normalizeGiven!('Peter')).toBe('pierre');
    expect(plugin.normalizeGiven!('Pierre')).toBe('pierre');
    expect(plugin.normalizeGiven!('John Baptiste')).toBe('jean baptiste');
  });

  it('folds period surname variants to a canonical form', () => {
    expect(plugin.normalizeSurname!('BOUDRO'.toLowerCase())).toBe('boudrot');
    expect(plugin.normalizeSurname!('Boudreaux')).toBe('boudrot');
    expect(plugin.normalizeSurname!('Theriault')).toBe('terriot');
    expect(plugin.normalizeSurname!('Trahane')).toBe('trahan');
  });

  it('leaves unknown names untouched', () => {
    expect(plugin.normalizeSurname!('Whipple')).toBe('Whipple');
  });
});

describe('acadian matching with the plugin', () => {
  it('matches a variant spelling and promotes on an Acadian place', () => {
    const boudro = record({
      id: 'acadian-deportation:boudro-michel',
      nameAsRecorded: 'Michel BOUDRO',
      surnameNormalized: 'Boudro',
      givenNormalized: 'Michel',
    });
    const descendant = person({
      fullName: 'Michael Boudreaux',
      events: [{ type: 'death', year: 1790, placeParts: ['Attakapas', 'Louisiana'] }],
      birthYear: 1735,
      deathYear: 1790,
    });
    const [candidate] = matchRegisterRecords([boudro], [descendant], {}, plugin);
    expect(candidate).toBeDefined();
    // Exact after folding (michel/michael → michel? michael folds to michel)
    expect(candidate!.reasons.join(' ')).toContain('exile destination');
    expect(candidate!.confidence).toBe('strong');
  });

  it('grades a bare name-only pairing weak without consistency signals', () => {
    const somebody = person({
      fullName: 'Charles LeBlanc',
      birthYear: null,
      deathYear: null,
      events: [{ type: 'residence', year: 1800, placeParts: ['Boston', 'Massachusetts'] }],
    });
    const [candidate] = matchRegisterRecords([record()], [somebody], {}, plugin);
    expect(candidate).toBeDefined();
    expect(candidate!.confidence).toBe('weak');
  });
});

describe('acadian exposure config', () => {
  const exposure = registerJson.config.exposure;

  it('two signals expose; one alone does not', () => {
    const acadian = person(); // Grand-Pré place (3) + pre-1756 window (1) + coincidence (1)
    expect(scoreExposure(acadian, exposure).exposed).toBe(true);

    const planter = person({
      fullName: 'Ezra Whitfield',
      birthYear: 1770,
      deathYear: 1840,
      events: [{ type: 'birth', year: 1770, placeParts: ['Cornwallis', 'Nova Scotia'] }],
    });
    // Nova Scotia alone (2) stays below threshold — the planter problem.
    expect(scoreExposure(planter, exposure).exposed).toBe(false);
  });

  it('roster surname plus exile place exposes without an Acadian birthplace', () => {
    const exile = person({
      fullName: 'Joseph Hebert',
      birthYear: 1740,
      deathYear: 1800,
      events: [{ type: 'death', year: 1800, placeParts: ['Opelousas', 'Louisiana'] }],
    });
    const result = scoreExposure(exile, exposure);
    expect(result.exposed).toBe(true);
    expect(result.reasons.join(' ')).toContain('Acadian censuses');
  });
});

describe('seed data validation', () => {
  it('every row carries a name, a citation, and a finding aid', () => {
    const raw = parseCsv(readFileSync(join(DATA_DIR, 'records.csv'), 'utf8'));
    const header = raw[0]!;
    const rows = raw.slice(1).filter((r) => r.some((f) => f.trim()));
    expect(rows.length).toBeGreaterThan(300);
    const col = (name: string) => header.indexOf(name);
    for (const row of rows) {
      expect(row[col('given')]!.trim()).not.toBe('');
      expect(row[col('surname')]!.trim()).not.toBe('');
      expect(row[col('source')]).toContain('Winslow');
      expect(row[col('finding_aid_url')]).toMatch(/^https:\/\//);
    }
  });
});
