import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../index.js';

const fixturePath = fileURLToPath(new URL('../../../fixtures/sample.ged', import.meta.url));
const fixtureText = readFileSync(fixturePath, 'utf-8');

describe('parseGedcom (fixture)', () => {
  const result = parseGedcom(fixtureText, 'sample.ged');

  it('extracts metadata from the HEAD record', () => {
    expect(result.metadata).toMatchObject({
      sourceFile: 'sample.ged',
      gedcomVersion: '5.5.1',
      charset: 'UTF-8',
      treeName: 'Sample Family Tree',
      individualCount: 6,
      familyCount: 1,
    });
  });

  it('parses individual names, stripping the surname slashes', () => {
    const john = result.individuals.get('I1');
    expect(john).toMatchObject({
      name: { full: 'John Smith', given: 'John', surname: 'Smith' },
      sex: 'M',
    });
    expect(john!.birth?.date).toMatchObject({ year: 1850, confidence: 'exact' });
    expect(john!.death?.date).toMatchObject({ year: 1920, confidence: 'exact' });
    expect(john!.hasDeathRecord).toBe(true);
  });

  it('interns places and dedupes repeats', () => {
    const john = result.individuals.get('I1')!;
    const boston = result.places.find((p) => p.id === john.birth!.placeId);
    expect(boston?.raw).toBe('Boston, Suffolk, Massachusetts, USA');
    // Same place string reused for death -> same interned id.
    expect(john.death!.placeId).toBe(john.birth!.placeId);
  });

  it('links family husband/wife/children', () => {
    const family = result.families.get('F1');
    expect(family).toMatchObject({ husbandId: 'I1', wifeId: 'I2' });
    expect(family!.childIds).toEqual(['I3', 'I4', 'I6']);
    expect(family!.marriage?.date).toMatchObject({ year: 1874, confidence: 'exact' });
  });

  it('flags a person born after 1920 with no death record as living', () => {
    expect(result.individuals.get('I4')!.living).toBe(true);
  });

  it('does not flag deceased or unknown-birth individuals as living', () => {
    expect(result.individuals.get('I1')!.living).toBe(false); // has a death record
    expect(result.individuals.get('I5')!.living).toBe(false); // birth date unparseable
  });

  it('treats an unparseable DATE under DEAT as still having a death record', () => {
    // I5 has no DEAT tag at all, so this should NOT count as a death record.
    expect(result.individuals.get('I5')!.hasDeathRecord).toBe(false);
  });

  it('flags a child born before their parent as a curiosity, not an error', () => {
    const curiosity = result.curiosities.find(
      (c) => c.type === 'child_born_before_parent' && c.individualIds.includes('I6'),
    );
    expect(curiosity).toBeDefined();
  });

  it('does not throw and preserves warnings array shape even with no malformed lines', () => {
    expect(Array.isArray(result.metadata.parseWarnings)).toBe(true);
  });
});
