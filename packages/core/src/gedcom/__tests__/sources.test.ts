import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildImportPayload } from '../../supabase/transform.js';
import { parseGedcom } from '../index.js';

const SYNTHETIC = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL The Pioneers of Massachu
2 CONC setts (1620-1650)
1 AUTH Charles Henry Pope
1 PUBL Boston: Charles H. Pope, 1900.
1 _APID 1,3824::0
0 @S2@ SOUR
1 TITL Massachusetts Town Marriage Records
0 @I1@ INDI
1 NAME John /Smith/
2 SOUR @S1@
3 PAGE p. 412
3 _APID 1,3824::99
1 SEX M
1 BIRT
2 DATE 12 JUN 1620
2 SOUR @S1@
3 DATA
4 TEXT Birth date: 12 Jun 1620
4 CONT Birth place: Boston
3 SOUR inline citation text, no pointer
1 RESI
2 DATE 1650
2 SOUR @S9@
3 PAGE cites a source record that does not exist
1 SOUR @S2@
2 DATA
3 WWW https://example.com/record/1
0 @I2@ INDI
1 NAME Mary /Field/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1644
2 SOUR @S2@
3 PAGE Marriage of John Smith and Mary Field, 1644
0 TRLR
`;

describe('source records and citations (synthetic)', () => {
  const parsed = parseGedcom(SYNTHETIC);

  it('parses source records, joining CONC continuations', () => {
    expect(parsed.sources.size).toBe(2);
    expect(parsed.sources.get('S1')).toEqual({
      id: 'S1',
      title: 'The Pioneers of Massachusetts (1620-1650)',
      author: 'Charles Henry Pope',
      publisher: 'Boston: Charles H. Pope, 1900.',
      apid: '1,3824::0',
    });
    expect(parsed.sources.get('S2')?.author).toBeUndefined();
  });

  it('collects person- and fact-level citations with their evidence', () => {
    const john = parsed.individuals.get('I1')!;
    expect(john.citations).toEqual([
      { sourceId: 'S1', fact: 'name', page: 'p. 412', text: undefined, url: undefined, apid: '1,3824::99' },
      { sourceId: 'S1', fact: 'birth', page: undefined, text: 'Birth date: 12 Jun 1620\nBirth place: Boston', url: undefined, apid: undefined },
      { sourceId: 'S9', fact: 'residence', page: 'cites a source record that does not exist', text: undefined, url: undefined, apid: undefined },
      { sourceId: 'S2', fact: 'person', page: undefined, text: undefined, url: 'https://example.com/record/1', apid: undefined },
    ]);
    // The inline (non-pointer) SOUR payload cites nothing citable.
    expect(john.citations.filter((c) => c.fact === 'birth')).toHaveLength(1);
    expect(parsed.individuals.get('I2')!.citations).toEqual([]);
  });

  it('collects marriage citations on the family', () => {
    expect(parsed.families.get('F1')!.citations).toEqual([
      { sourceId: 'S2', fact: 'marriage', page: 'Marriage of John Smith and Mary Field, 1644', text: undefined, url: undefined, apid: undefined },
    ]);
  });

  it('transforms into rows, dropping citations of undefined sources', () => {
    let next = 0;
    const payload = buildImportPayload(parsed, { userId: 'u', generateId: () => `x${next++}` });

    expect(payload.sources).toHaveLength(2);
    const s1 = payload.sources.find((s) => s.gedcom_xref === 'S1')!;
    expect(s1).toMatchObject({ title: 'The Pioneers of Massachusetts (1620-1650)', ancestry_apid: '1,3824::0' });

    // S9 never resolves — its citation must not become a dangling FK.
    expect(payload.citations).toHaveLength(4);
    const johnId = payload.individuals.find((i) => i.gedcom_xref === 'I1')!.id;
    const familyId = payload.families.find((f) => f.gedcom_xref === 'F1')!.id;
    const facts = payload.citations.map((c) => c.fact).sort();
    expect(facts).toEqual(['birth', 'marriage', 'name', 'person']);
    for (const citation of payload.citations) {
      if (citation.fact === 'marriage') {
        expect(citation.family_id).toBe(familyId);
        expect(citation.individual_id).toBeUndefined();
      } else {
        expect(citation.individual_id).toBe(johnId);
      }
      expect(payload.sources.some((s) => s.id === citation.source_id)).toBe(true);
    }
  });
});

const realPath = fileURLToPath(new URL('../../../fixtures/Howe_Field Family Tree.ged', import.meta.url));

describe.skipIf(!existsSync(realPath))('source records and citations (real Howe/Field GEDCOM)', () => {
  it('captures the full source library and citation volume', () => {
    const parsed = parseGedcom(readFileSync(realPath, 'utf-8'));

    expect(parsed.sources.size).toBe(980);
    const titled = [...parsed.sources.values()].filter((s) => s.title);
    expect(titled.length).toBeGreaterThan(950);

    const personCitations = [...parsed.individuals.values()].flatMap((i) => i.citations);
    const familyCitations = [...parsed.families.values()].flatMap((f) => f.citations);
    expect(personCitations.length).toBeGreaterThan(35000);
    expect(familyCitations.length).toBeGreaterThan(900);

    // Every pointer must resolve into the source library — Ancestry
    // exports are internally consistent, and the transform relies on it.
    const dangling = [...personCitations, ...familyCitations].filter(
      (c) => !parsed.sources.has(c.sourceId),
    );
    expect(dangling).toEqual([]);

    // The evidence fields all occur in volume.
    expect(personCitations.filter((c) => c.page).length).toBeGreaterThan(10000);
    expect(personCitations.filter((c) => c.text).length).toBeGreaterThan(3000);
    expect(personCitations.filter((c) => c.url).length).toBeGreaterThan(1000);
    expect(personCitations.filter((c) => c.apid).length).toBeGreaterThan(20000);

    const facts = new Set(personCitations.map((c) => c.fact));
    for (const expected of ['person', 'name', 'birth', 'death', 'residence', 'burial']) {
      expect(facts).toContain(expected);
    }
  });
});
