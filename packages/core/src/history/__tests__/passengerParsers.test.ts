import { describe, expect, it } from 'vitest';

import { readName } from '../../../scripts/parse-banks.js';
import { extractEntries } from '../../../scripts/parse-hotten.js';

// Fixture lines are short verbatim excerpts of the two public-domain
// OCR texts — enough to pin the extraction rules, no more.

describe('parse-banks readName', () => {
  it('reads a bare name line', () => {
    expect(readName('Richard Brackenbury')).toEqual({
      given: 'Richard',
      surname: 'Brackenbury',
      rest: '',
    });
  });

  it('keeps same-line origin as notes and honors titles', () => {
    const r = readName('Jeffrey Massey of Knutsford, county Chester cordwainer Salem');
    expect(r).toMatchObject({ given: 'Jeffrey', surname: 'Massey' });
    expect(r!.rest).toContain('of Knutsford');
    expect(readName('Mrs. Susanna Skelton')).toMatchObject({
      given: 'Susanna',
      surname: 'Skelton',
    });
  });

  it('rejects narrative prose, headings, furniture, and parish fragments', () => {
    expect(readName('Left Southampton August 5, and arrived at')).toBeNull();
    expect(readName('GEORGE BONAVENTURE, Thomas Cox, Master, of three')).toBeNull();
    expect(readName('Passengers and Ships 65')).toBeNull();
    expect(readName('Saint Saviour’s South')).toBeNull();
    expect(readName('Olave’s Southwark')).toBeNull();
    expect(readName('She brought fifty-two planters.')).toBeNull();
  });
});

describe('parse-hotten extractEntries', () => {
  it('derives a birth year from the sworn age', () => {
    const { entries } = extractEntries('JOAN ANTROBUSS 65', 1635, '');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ given: 'Joan', surname: 'Antrobuss', birth: 'c. 1570' });
  });

  it('expands abbreviated given names and keeps occupation prefixes', () => {
    const { entries } = extractEntries('A Mercer Jo: TUTTELL 39', 1635, '');
    expect(entries[0]).toMatchObject({ given: 'John', surname: 'Tuttell', birth: 'c. 1596' });
    expect(entries[0].notes).toContain('A Mercer');
  });

  it('repairs OCR l-for-I and digit noise', () => {
    const { entries } = extractEntries('WM WlLCOCKSON 34', 1635, '');
    expect(entries[0]).toMatchObject({ given: 'William', surname: 'Wilcockson' });
    const noisy = extractEntries('GEO: BURLINGHAM* 2O', 1635, '');
    expect(noisy.entries[0]).toMatchObject({ given: 'George', birth: 'c. 1615' });
  });

  it('splits multi-person lines and lets a lone name inherit the surname', () => {
    const { entries } = extractEntries(
      'EDMOND WEAVER 28 yers & his wife MARGRETT aged 30 yers',
      1635,
      '',
    );
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ given: 'Margrett', surname: 'Weaver', birth: 'c. 1605' });
  });

  it('prefers a bracketed correction over the misreading', () => {
    const { entries } = extractEntries('JAMES GRASTON [or GRAFTON] 22', 1635, '');
    expect(entries[0].surname).toBe('Grafton');
  });

  it('yields nothing for prose without a trailing age', () => {
    expect(extractEntries('servant to Jo: TUTTELL', 1635, '').entries).toHaveLength(0);
    expect(extractEntries('27 psons', 1635, '').entries).toHaveLength(0);
  });
});
