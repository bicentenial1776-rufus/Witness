import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractGedcomText, isZipData, parseGedcom } from '../index.js';

const sample7Path = fileURLToPath(new URL('../../../fixtures/sample7.ged', import.meta.url));
const sample7Text = readFileSync(sample7Path, 'utf-8');

describe('GEDCOM 7.0 (FamilySearch)', () => {
  const parsed = parseGedcom(sample7Text, 'sample7.ged');
  const anna = parsed.individuals.get('I1')!;

  it('detects the version from HEAD.GEDC.VERS and surfaces it', () => {
    expect(parsed.metadata.gedcomVersion).toBe('7.0');
    expect(parsed.metadata.specVersion).toBe('7.0');
  });

  it('resolves SNOTE shared notes alongside inline notes', () => {
    expect(anna.notes).toContain(
      'Emigrated from Rotterdam aboard the Beaver.\nArrived Philadelphia 1738.',
    );
    expect(anna.notes).toContain('She signed her name with a mark.');
  });

  it('keeps the parsed date but adopts the PHRASE as the raw text', () => {
    expect(anna.birth?.date?.year).toBe(1712);
    expect(anna.birth?.date?.raw).toBe('about 1712, per the family bible');
  });

  it('reads TITL under FILE on multimedia records', () => {
    expect(anna.media).toHaveLength(1);
    expect(anna.media[0]).toMatchObject({
      objeId: 'O1',
      file: 'portrait.jpg',
      title: 'Portrait of Anna',
      primary: true,
    });
  });

  it('still extracts Ancestry-style extensions when present', () => {
    expect(anna.uid).toBe('ABC123DEF456');
    const family = parsed.families.get('F1')!;
    expect(family.childRelationships).toEqual([
      { childId: 'I3', fatherRelation: 'adopted', motherRelation: 'natural' },
    ]);
  });

  it('parses the rest of the family normally', () => {
    expect(parsed.metadata.individualCount).toBe(3);
    expect(parsed.families.get('F1')?.marriage?.date?.year).toBe(1735);
  });
});

describe('unknown version fallback', () => {
  it('parses with 5.5.1 rules and warns', () => {
    const text = sample7Text.replace('2 VERS 7.0', '2 VERS 9.9');
    const parsed = parseGedcom(text);
    expect(parsed.metadata.specVersion).toBe('unknown');
    expect(parsed.metadata.parseWarnings.some((w) => w.includes('Unknown GEDCOM version'))).toBe(true);
    expect(parsed.metadata.individualCount).toBe(3);
  });
});

describe('.gdz archives', () => {
  it('detects zip data by magic bytes', () => {
    const zipped = zipSync({ 'tree.ged': strToU8(sample7Text) });
    expect(isZipData(zipped)).toBe(true);
    expect(isZipData(strToU8(sample7Text))).toBe(false);
  });

  it('extracts the .ged entry from a .gdz archive', () => {
    const zipped = zipSync({
      'media/portrait.jpg': strToU8('not really a jpeg'),
      'export/tree.ged': strToU8(sample7Text),
    });
    const text = extractGedcomText(zipped);
    expect(text).toBe(sample7Text);
    expect(parseGedcom(text).metadata.individualCount).toBe(3);
  });

  it('passes plain text straight through', () => {
    expect(extractGedcomText(strToU8(sample7Text))).toBe(sample7Text);
  });

  it('rejects archives with no .ged inside', () => {
    const zipped = zipSync({ 'readme.txt': strToU8('hello') });
    expect(() => extractGedcomText(zipped)).toThrow(/does not contain a \.ged/);
  });
});

describe('Ancestry extensions (real Howe/Field GEDCOM)', () => {
  const realPath = fileURLToPath(new URL('../../../fixtures/Howe_Field Family Tree.ged', import.meta.url));
  const parsed = parseGedcom(readFileSync(realPath, 'utf-8'));
  const people = [...parsed.individuals.values()];

  it('detects 5.5.1', () => {
    expect(parsed.metadata.specVersion).toBe('5.5.1');
  });

  it('extracts UID person identifiers (bare UID in current Ancestry exports)', () => {
    const withUid = people.filter((p) => p.uid);
    expect(withUid.length).toBeGreaterThanOrEqual(4);
    for (const person of withUid) {
      expect(person.uid).toMatch(/^[0-9A-F]{32,40}$/);
    }
  });

  it('parses _MILT military service events', () => {
    const events = people.flatMap((p) => p.military);
    expect(events.length).toBe(58);
    expect(events.some((e) => e.date?.year || e.placeId)).toBe(true);
  });

  it('captures _PRIM primary photo flags on media references', () => {
    const primary = people.flatMap((p) => p.media).filter((m) => m.primary);
    expect(primary.length).toBeGreaterThan(500);
  });

  it('captures _APID record identifiers', () => {
    const withApid = people.filter((p) => p.apid);
    expect(withApid.length).toBeGreaterThan(1000);
    expect(withApid[0]!.apid).toMatch(/^\d+,\d+::/);
  });

  it('captures adopted/step child relationships', () => {
    const relations = [...parsed.families.values()].flatMap((f) => f.childRelationships);
    expect(relations.length).toBeGreaterThanOrEqual(4);
    expect(relations.some((r) => r.fatherRelation === 'adopted' || r.motherRelation === 'adopted')).toBe(true);
  });
});
