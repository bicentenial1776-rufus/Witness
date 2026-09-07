import { describe, expect, it } from 'vitest';
import { ancestorGenerations, classifyLabel, coupleUp, groupByKind, type KinRow } from '../kinds.js';

describe('classifyLabel', () => {
  it('reads the line of ancestors and descendants', () => {
    expect(classifyLabel('father')).toMatchObject({ key: 'ancestors-1', title: 'Parents' });
    expect(classifyLabel('grandmother')).toMatchObject({ key: 'ancestors-2', title: 'Grandparents' });
    expect(classifyLabel('great-grandfather')).toMatchObject({ key: 'ancestors-3', title: 'Great-grandparents' });
    expect(classifyLabel('7th great-grandmother')).toMatchObject({ key: 'ancestors-9', title: '7th great-grandparents' });
    expect(classifyLabel('daughter')).toMatchObject({ key: 'descendants-1', title: 'Children' });
    expect(classifyLabel('2nd great-grandson')).toMatchObject({ key: 'descendants-4', title: '2nd great-grandchildren' });
  });

  it('reads collaterals and cousins', () => {
    expect(classifyLabel('uncle')).toMatchObject({ key: 'aunts-1', title: 'Aunts & uncles' });
    expect(classifyLabel('great-aunt')).toMatchObject({ key: 'aunts-2', title: 'Great-aunts & uncles' });
    expect(classifyLabel('5th great-aunt/uncle')).toMatchObject({ key: 'aunts-6', title: '5th great-aunts & uncles' });
    expect(classifyLabel('niece')).toMatchObject({ key: 'nieces-1' });
    expect(classifyLabel('1st cousin')).toMatchObject({ key: 'cousins-1', title: '1st cousins' });
    expect(classifyLabel('1st cousin twice removed')).toMatchObject({ key: 'cousins-1-removed', title: '1st cousins, removed' });
    expect(classifyLabel('2nd cousin 5 times removed')).toMatchObject({ key: 'cousins-2-removed' });
    expect(classifyLabel('sister')).toMatchObject({ key: 'siblings' });
  });

  it('folds softeners and half/adoptive qualifiers into the blood kind', () => {
    expect(classifyLabel('half-8th great-uncle')).toMatchObject({ key: 'aunts-9' });
    expect(classifyLabel('possibly a half-sister')).toMatchObject({ key: 'siblings' });
    expect(classifyLabel('adoptive father')).toMatchObject({ key: 'ancestors-1' });
    expect(classifyLabel('3rd cousin — also your wife')).toMatchObject({ key: 'cousins-3' });
  });

  it("files a spouse's relatives under the spouse, keeping the inner kind", () => {
    expect(classifyLabel("your wife's 8th great-grandfather")).toMatchObject({
      key: 'spouse:ancestors-10',
      title: "Your wife's 8th great-grandparents",
    });
    expect(classifyLabel("your husband's 1st cousin twice removed")).toMatchObject({ key: 'spouse:cousins-1-removed' });
    expect(classifyLabel('mother-in-law')).toMatchObject({ key: 'in-laws' });
    expect(classifyLabel('stepbrother')).toMatchObject({ key: 'step-family' });
    expect(classifyLabel('wife')).toMatchObject({ key: 'spouse' });
  });

  it('never drops a label it cannot place', () => {
    expect(classifyLabel('something the engine invented')).toMatchObject({ key: 'other', title: 'Other relatives' });
  });
});

const row = (id: string, label: string, gen: number, line = 'paternal', ancestor = false): KinRow => ({
  individual_id: id,
  label,
  generation_distance: gen,
  line,
  is_direct_ancestor: ancestor,
});

describe('groupByKind', () => {
  it('orders closer kinds first and keeps every person', () => {
    const order = ['father', 'sister', 'son', 'grandmother', 'grandson', 'uncle', 'niece', 'great-grandfather', 'great-aunt', '1st cousin', '1st cousin once removed', '2nd cousin'].map(
      (l) => classifyLabel(l).order,
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const groups = groupByKind([
      row('gm', 'grandmother', 2),
      row('c1', '1st cousin', 0),
      row('f', 'father', 1),
      row('u', 'uncle', 1),
      row('gf', 'grandfather', 2),
      row('w', "your wife's aunt", 1),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['ancestors-1', 'ancestors-2', 'aunts-1', 'cousins-1', 'spouse:aunts-1']);
    expect(groups.find((g) => g.key === 'ancestors-2')?.ids).toEqual(['gm', 'gf']);
  });
});

describe('ancestorGenerations', () => {
  it('walks one generation at a time, split by side, with empty generations kept', () => {
    const generations = ancestorGenerations([
      row('f', 'father', 1, 'paternal', true),
      row('m', 'mother', 1, 'maternal', true),
      row('pgf', 'grandfather', 2, 'paternal', true),
      row('mgm', 'grandmother', 2, 'maternal', true),
      row('x', '2nd great-grandfather', 4, 'unknown', true),
      row('u', 'uncle', 1, 'paternal', false),
    ]);
    expect(generations.map((g) => g.n)).toEqual([1, 2, 3, 4]);
    expect(generations[0]).toMatchObject({ title: 'Parents', expected: 2, paternal: ['f'], maternal: ['m'] });
    expect(generations[1]).toMatchObject({ expected: 4, paternal: ['pgf'], maternal: ['mgm'] });
    expect(generations[2]).toMatchObject({ title: 'Great-grandparents', expected: 8, paternal: [], maternal: [] });
    expect(generations[3]).toMatchObject({ title: '2nd great-grandparents', expected: 16, unplaced: ['x'] });
  });
});

describe('coupleUp', () => {
  const fam = (id: string, h: string | null, w: string | null, year: number | null) => ({ id, husband_id: h, wife_id: w, marriage_year: year });
  it('pairs the two ancestors of a family and leaves the partnerless standing alone', () => {
    const units = coupleUp(['pgf', 'pgm', 'x'], [fam('f1', 'pgf', 'pgm', 1850), fam('f2', 'x', 'outsider', 1870)]);
    expect(units).toEqual([
      { partners: ['pgf', 'pgm'], familyId: 'f1', marriageYear: 1850, laterMarriages: [] },
      { partners: ['x'], familyId: null, marriageYear: null, laterMarriages: [{ ofId: 'x', spouseId: 'outsider', marriageYear: 1870 }] },
    ]);
  });
  it('hangs every other marriage of either partner off the couple, in year order', () => {
    const units = coupleUp(['a', 'b'], [fam('f1', 'a', 'b', 1850), fam('f2', 'a', 'second', 1880), fam('f0', 'first', 'b', 1840)]);
    expect(units[0]?.laterMarriages).toEqual([
      { ofId: 'b', spouseId: 'first', marriageYear: 1840 },
      { ofId: 'a', spouseId: 'second', marriageYear: 1880 },
    ]);
  });
});
