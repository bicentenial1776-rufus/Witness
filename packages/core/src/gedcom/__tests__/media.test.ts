import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../index.js';

/**
 * Family Tree Maker's GEDCOM shape (25.0.2 export, 2026-09-05): the
 * primary portrait rides a proprietary `1 _PHOTO @M..@` pointer, not an
 * OBJE with `_PRIM Y`; record images sit under the SOUR citation of the
 * fact they prove; and family records carry their own OBJE.
 */
const FTM = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL 1850 United States Federal Census
0 @I1@ INDI
1 NAME Ruth /Field/
2 SOUR @S1@
3 PAGE Year: 1850; Roll: 305
3 OBJE @M2@
1 SEX F
1 BIRT
2 DATE 4 JUL 1827
2 OBJE @M3@
1 OBJE @M4@
1 _PHOTO @M1@
1 FAMS @F1@
0 @I2@ INDI
1 NAME Samuel /Eaton/
1 _PHOTO @M1@
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 MARR
2 DATE 1848
2 OBJE @M5@
1 OBJE @M6@
0 @M1@ OBJE
1 FILE /Users/rufus/Media/couple.jpg
2 FORM jpg
1 TITL Ruth and Samuel, 1890
0 @M2@ OBJE
1 FILE /Users/rufus/Media/1850 census.jpg
2 FORM jpg
0 @M3@ OBJE
1 FILE /Users/rufus/Media/birth record.pdf
2 FORM pdf
0 @M4@ OBJE
1 FILE /Users/rufus/Media/ruth young.jpg
2 FORM jpg
0 @M5@ OBJE
1 FILE /Users/rufus/Media/marriage.jpg
2 FORM jpg
0 @M6@ OBJE
1 FILE /Users/rufus/Media/family bible.jpg
2 FORM jpg
0 TRLR`;

describe('media attachment contexts (Family Tree Maker shape)', () => {
  const parsed = parseGedcom(FTM, 'ftm.ged');
  const ruth = parsed.individuals.get('I1')!;
  const samuel = parsed.individuals.get('I2')!;
  const family = parsed.families.get('F1')!;

  it('reads _PHOTO as the primary portrait, resolved through the OBJE record', () => {
    const primary = ruth.media.filter((m) => m.primary);
    expect(primary).toHaveLength(1);
    expect(primary[0]).toMatchObject({
      objeId: 'M1',
      file: '/Users/rufus/Media/couple.jpg',
      title: 'Ruth and Samuel, 1890',
    });
    // A couple's photo can be both people's portrait.
    expect(samuel.media.filter((m) => m.primary)[0]?.objeId).toBe('M1');
  });

  it('keeps plain OBJE attachments alongside the portrait, unflagged', () => {
    expect(ruth.media.map((m) => m.objeId)).toEqual(['M4', 'M1']);
    expect(ruth.media.find((m) => m.objeId === 'M4')?.primary).toBe(false);
  });

  it('attaches media to the fact it hangs under', () => {
    expect(ruth.birth?.media?.map((m) => m.objeId)).toEqual(['M3']);
    expect(ruth.birth?.media?.[0]?.file).toBe('/Users/rufus/Media/birth record.pdf');
  });

  it('carries record images on the citation that cites them', () => {
    const nameCitation = ruth.citations.find((c) => c.fact === 'name');
    expect(nameCitation?.media?.map((m) => m.objeId)).toEqual(['M2']);
    // Citations without images stay lean — no empty arrays to serialise.
    expect(samuel.citations).toHaveLength(0);
  });

  it('reads family and marriage media separately', () => {
    expect(family.media.map((m) => m.objeId)).toEqual(['M6']);
    expect(family.marriage?.media?.map((m) => m.objeId)).toEqual(['M5']);
  });
});
