import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeUnitParser, type UnitTerms } from '../normalizers/unitDesignation.js';
import { findUnitMentions, warStateFromPlaces } from '../unitHints.js';

const terms = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../../data/registers/cw-regiments/unit-terms.json', import.meta.url)), 'utf8'),
) as UnitTerms;
const parse = makeUnitParser(terms);

describe('findUnitMentions', () => {
  it('finds regiments named in an obituary and a pension paper', () => {
    const text =
      'He enlisted in Co. K, 15th Massachusetts Infantry in July 1861 and was wounded at Ball\'s Bluff. ' +
      'His widow drew a pension on his service in the 15th Mass. Infantry. Later he joined the 1st Maine Cavalry.';
    const found = findUnitMentions(text, parse);
    expect(found.map((m) => m.unit.unitKey)).toEqual(['US-MA-INF-15', 'US-ME-CAV-1']);
    expect(found[0]!.unit.company).toBe('K');
    expect(found[0]!.span).toMatch(/15th Massachusetts Infantry/);
  });

  it('reads a headstone\'s abbreviation', () => {
    const found = findUnitMentions('EDWIN S. PARKER · CO. H 25TH MASS. INF. · 1843–1911', parse);
    expect(found.map((m) => m.unit.unitKey)).toEqual(['US-MA-INF-25']);
    expect(found[0]!.unit.company).toBe('H');
  });

  it('finds nothing in ordinary prose', () => {
    expect(findUnitMentions('She was born in 1842 in Worcester and married in 1863.', parse)).toEqual([]);
  });
});

describe('warStateFromPlaces', () => {
  it('names the state he lived in during the war years, ignoring later moves', () => {
    const state = warStateFromPlaces([
      { year: 1850, placeParts: ['Litchfield', 'Kennebec', 'Maine', 'USA'] },
      { year: 1860, placeParts: ['Litchfield', 'Kennebec', 'Maine', 'USA'] },
      { year: 1863, placeParts: ['Litchfield', 'Maine', 'United States'] },
      { year: 1900, placeParts: ['Boston', 'Massachusetts', 'USA'] },
    ]);
    expect(state).toBe('Maine');
  });
  it('is null without a dated place in the window', () => {
    expect(warStateFromPlaces([{ year: 1900, placeParts: ['Boston', 'Massachusetts'] }])).toBeNull();
  });
});

describe('findUnitMentions on worn stones', () => {
  it('reads the model\'s "M.S.S." and a bare "Vols." as Massachusetts, branch unknown', () => {
    const found = findUnitMentions('EDWIN S. PARKER · Died April 14, 1899 · Co. H 25th M.S.S. Vols. · Farewell', parse);
    expect(found.map((m) => [m.unit.unitKey, m.unit.company])).toEqual([['US-MA-UNK-25', 'H']]);
    expect(found[0]!.span).toBe('Co. H 25th Mass. Vols.');
  });
  it('reads M.V.M. as Massachusetts', () => {
    expect(findUnitMentions('Co. B, 42d Regt. M.V.M.', parse).map((m) => m.unit.unitKey)).toEqual(['US-MA-UNK-42']);
  });
});
