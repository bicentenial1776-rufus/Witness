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
  it('emits occupation, custom, and probate event rows with label and detail', () => {
    const enrichedText = fixtureText.replace(
      '1 BURI',
      [
        '1 OCCU Farmer',
        '1 EVEN',
        '2 TYPE Citizenship',
        '2 PLAC USA',
        '1 PROB',
        '2 DATE 1920',
        '1 BURI',
      ].join('\n'),
    );
    const payload = buildImportPayload(parseGedcom(enrichedText, 'sample.ged'), { userId: USER_ID });
    const john = payload.individuals.find((i) => i.gedcom_xref === 'I1')!;
    const johnEvents = payload.individualEvents.filter((e) => e.individual_id === john.id);

    expect(johnEvents.find((e) => e.event_type === 'occupation')).toMatchObject({
      detail: 'Farmer',
      label: null,
    });
    expect(johnEvents.find((e) => e.event_type === 'custom')).toMatchObject({
      label: 'Citizenship',
    });
    expect(johnEvents.find((e) => e.event_type === 'probate')).toMatchObject({
      date_year: 1920,
    });
  });

  it('drops Family Tree Maker’s literal "(null)" from citation text, page, and url', () => {
    const ftmText = [
      '0 HEAD',
      '1 SOUR FTM',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME Shirley /Howe/',
      '1 BIRT',
      '2 DATE 1917',
      '2 SOUR @S1@',
      '3 PAGE (null)',
      '3 DATA',
      '4 TEXT (null)',
      '2 SOUR @S2@',
      '3 PAGE Year: 1950; Sheet 4',
      '3 DATA',
      '4 TEXT Birth date: 1917',
      '0 @S1@ SOUR',
      '1 TITL Ancestry Family Trees',
      '0 @S2@ SOUR',
      '1 TITL 1950 United States Federal Census',
      '0 TRLR',
    ].join('\n');
    const payload = buildImportPayload(parseGedcom(ftmText, 'ftm.ged'), {
      userId: USER_ID,
      generateId: sequentialIdGenerator(),
    });
    const byTitle = (title: string) =>
      payload.citations.find((c) => payload.sources.find((s) => s.id === c.source_id)?.title === title)!;
    expect(byTitle('Ancestry Family Trees')).toMatchObject({ text_excerpt: null, page: null });
    expect(byTitle('1950 United States Federal Census')).toMatchObject({
      text_excerpt: 'Birth date: 1917',
      page: 'Year: 1950; Sheet 4',
    });
  });

  it('deduplicates shared media and links people, events, families, and citations', () => {
    const mediaText = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME Ada /Kin/',
      '1 OBJE @M1@',
      '1 BIRT',
      '2 DATE 12 MAR 1850',
      '2 OBJE @M2@',
      '1 SOUR @S1@',
      '2 OBJE @M1@',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 OBJE @M1@',
      '0 @S1@ SOUR',
      '1 TITL Synthetic source',
      '0 @M1@ OBJE',
      '1 FILE /export/shared.jpg',
      '2 TITL Shared image',
      '0 @M2@ OBJE',
      '1 FILE /export/birth.pdf',
      '0 TRLR',
    ].join('\n');
    const payload = buildImportPayload(parseGedcom(mediaText, 'media.ged'), {
      userId: USER_ID,
      generateId: sequentialIdGenerator(),
    });

    expect(payload.media).toHaveLength(2);
    expect(payload.media.find((row) => row.gedcom_xref === 'M1')).toMatchObject({
      file_path: '/export/shared.jpg',
      format: 'jpg',
    });
    expect(payload.mediaLinks).toHaveLength(4);
    expect(payload.mediaLinks.filter((link) => link.media_id === payload.media[0]!.id)).toHaveLength(3);
    expect(payload.mediaLinks.some((link) => link.individual_event_id)).toBe(true);
    expect(payload.mediaLinks.some((link) => link.family_id)).toBe(true);
    expect(payload.mediaLinks.some((link) => link.citation_id)).toBe(true);
  });
});
