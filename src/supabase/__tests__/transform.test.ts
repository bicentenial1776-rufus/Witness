import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../gedcom/index.js';
import { buildImportPayload } from '../transform.js';

const fixturePath = new URL('../../../fixtures/sample.ged', import.meta.url);
const fixtureText = readFileSync(fixturePath, 'utf-8');
const parsed = parseGedcom(fixtureText, 'sample.ged');

const USER_ID = '00000000-0000-0000-0000-000000000001';

function sequentialIdGenerator() {
  let n = 0;
  return () => `id-${n++}`;
}

describe('buildImportPayload', () => {
  it('produces one row per parsed entity, all scoped to the generated tree', () => {
    const payload = buildImportPayload(parsed, { userId: USER_ID, generateId: sequentialIdGenerator() });

    expect(payload.individuals).toHaveLength(parsed.individuals.size);
    expect(payload.families).toHaveLength(parsed.families.size);
    expect(payload.places).toHaveLength(parsed.places.length);

    for (const row of [...payload.individuals, ...payload.families, ...payload.places]) {
      expect(row.tree_id).toBe(payload.tree.id);
      expect(row.user_id).toBe(USER_ID);
    }
  });

  it('wires individual_events to real individual and place row ids, not the local gedcom ids', () => {
    const payload = buildImportPayload(parsed, { userId: USER_ID });
    const johnRow = payload.individuals.find((i) => i.gedcom_xref === 'I1')!;
    const johnBirthEvent = payload.individualEvents.find(
      (e) => e.individual_id === johnRow.id && e.event_type === 'birth',
    )!;

    expect(johnBirthEvent).toBeDefined();
    expect(johnBirthEvent.date_year).toBe(1850);
    // The place row id should be a generated uuid/id, not the parser's local "P1" style id.
    const placeRow = payload.places.find((p) => p.id === johnBirthEvent.place_id);
    expect(placeRow?.raw).toBe('Boston, Suffolk, Massachusetts, USA');
  });

  it('emits one residence event per residence, in order, via sort_order', () => {
    const payload = buildImportPayload(parsed, { userId: USER_ID });
    const robertRow = payload.individuals.find((i) => i.gedcom_xref === 'I3')!;
    const residenceEvents = payload.individualEvents.filter(
      (e) => e.individual_id === robertRow.id && e.event_type === 'residence',
    );
    expect(residenceEvents).toHaveLength(1);
    expect(residenceEvents[0]).toMatchObject({ sort_order: 0, date_year: 1900 });
  });

  it('links family husband/wife/children to real individual row ids', () => {
    const payload = buildImportPayload(parsed, { userId: USER_ID });
    const john = payload.individuals.find((i) => i.gedcom_xref === 'I1')!;
    const jane = payload.individuals.find((i) => i.gedcom_xref === 'I2')!;
    const family = payload.families[0]!;

    expect(family.husband_id).toBe(john.id);
    expect(family.wife_id).toBe(jane.id);

    const childRows = payload.familyChildren.filter((fc) => fc.family_id === family.id);
    expect(childRows).toHaveLength(3);
    expect(childRows.map((c) => c.birth_order)).toEqual([0, 1, 2]);
  });

  it('carries marriage date range bounds, not just the midpoint year', () => {
    // Fixture's marriage is an exact date, so add a synthetic BET/AND case via
    // the parser's own date normalizer to prove the mapping isn't lossy.
    const rangeText = fixtureText.replace('2 DATE 20 Jun 1874', '2 DATE BET 1873 AND 1875');
    const rangeParsed = parseGedcom(rangeText, 'sample.ged');
    const payload = buildImportPayload(rangeParsed, { userId: USER_ID });
    const family = payload.families[0]!;

    expect(family.marriage_date_range_start_year).toBe(1873);
    expect(family.marriage_date_range_end_year).toBe(1875);
  });

  it('links curiosities to real individual and family row ids', () => {
    const payload = buildImportPayload(parsed, { userId: USER_ID });
    const impossibleChild = payload.individuals.find((i) => i.gedcom_xref === 'I6')!;
    const curiosity = payload.curiosities.find((c) => c.type === 'child_born_before_parent')!;
    expect(curiosity).toBeDefined();

    const links = payload.curiosityIndividuals.filter((ci) => ci.curiosity_id === curiosity.id);
    expect(links.some((l) => l.individual_id === impossibleChild.id)).toBe(true);
  });

  it('skips a CHIL pointer to an xref that has no INDI record instead of inserting a dangling FK', () => {
    const brokenText = fixtureText.replace('1 CHIL @I4@', '1 CHIL @I999@');
    const brokenParsed = parseGedcom(brokenText, 'sample.ged');
    const payload = buildImportPayload(brokenParsed, { userId: USER_ID });
    const family = payload.families[0]!;
    const childRows = payload.familyChildren.filter((fc) => fc.family_id === family.id);
    // 3 CHIL lines in the fixture family, one now points nowhere -> 2 valid links.
    expect(childRows).toHaveLength(2);
  });
});
