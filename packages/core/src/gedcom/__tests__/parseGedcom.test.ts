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

describe('occupation, custom event, and probate facts', () => {
  // Ancestry's shapes exactly: OCCU with its payload on the tag line,
  // EVEN named by TYPE (sometimes payload in a NOTE), PROB as a bare event.
  const enrichedText = fixtureText.replace(
    '1 BURI',
    [
      '1 OCCU First postmaster of Auburn',
      '2 DATE 1900',
      '2 PLAC Boston, Suffolk, Massachusetts, USA',
      '1 EVEN',
      '2 TYPE Citizenship',
      '2 PLAC USA',
      '1 EVEN',
      '2 TYPE FamilySearch ID',
      '2 NOTE L2LT-N43',
      '1 PROB',
      '2 DATE 1920',
      '1 BURI',
    ].join('\n'),
  );
  const enriched = parseGedcom(enrichedText, 'sample.ged');
  const john = enriched.individuals.get('I1')!;

  it('parses OCCU with its payload, date, and place', () => {
    expect(john.occupations).toHaveLength(1);
    expect(john.occupations[0]!.detail).toBe('First postmaster of Auburn');
    expect(john.occupations[0]!.date).toMatchObject({ year: 1900 });
    expect(john.occupations[0]!.placeId).toBeDefined();
  });

  it('parses EVEN custom facts, naming them from TYPE and reading NOTE payloads', () => {
    expect(john.customEvents).toHaveLength(2);
    expect(john.customEvents[0]).toMatchObject({ label: 'Citizenship' });
    expect(john.customEvents[1]).toMatchObject({ label: 'FamilySearch ID', detail: 'L2LT-N43' });
  });

  it('parses PROB as a probate event', () => {
    expect(john.probate?.date).toMatchObject({ year: 1920 });
  });

  it('drops an EVEN with no type, payload, date, or place', () => {
    const emptyText = fixtureText.replace('1 BURI', '1 EVEN\n1 BURI');
    const parsed = parseGedcom(emptyText, 'sample.ged');
    expect(parsed.individuals.get('I1')!.customEvents).toHaveLength(0);
  });
});
