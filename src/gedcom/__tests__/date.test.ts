import { describe, expect, it } from 'vitest';
import { normalizeDate } from '../normalize/date.js';

describe('normalizeDate', () => {
  it('parses an exact full date', () => {
    const result = normalizeDate('12 Apr 2018');
    expect(result).toMatchObject({ year: 2018, month: 4, day: 12, qualifier: 'exact', confidence: 'exact' });
  });

  it('parses a bare year as exact', () => {
    expect(normalizeDate('1878')).toMatchObject({ year: 1878, qualifier: 'exact', confidence: 'exact' });
  });

  it('parses ABT as approximate', () => {
    expect(normalizeDate('ABT 1574')).toMatchObject({ year: 1574, qualifier: 'about', confidence: 'approximate' });
  });

  it('parses padded/irregular whitespace', () => {
    expect(normalizeDate('ABT     1574')).toMatchObject({ year: 1574, confidence: 'approximate' });
    expect(normalizeDate('  06 May 1676')).toMatchObject({ year: 1676, month: 5, day: 6 });
  });

  it('parses EST as estimated', () => {
    expect(normalizeDate('EST 1690')).toMatchObject({ year: 1690, qualifier: 'estimated', confidence: 'estimated' });
  });

  it('parses BET/AND ranges into a midpoint year plus range bounds', () => {
    const result = normalizeDate('BET 1597 AND 1649');
    expect(result).toMatchObject({
      year: 1623,
      qualifier: 'between',
      confidence: 'approximate',
      rangeStartYear: 1597,
      rangeEndYear: 1649,
    });
  });

  it('parses BEF/AFT and their full-word Ancestry.com variants', () => {
    expect(normalizeDate('AFT 1920')).toMatchObject({ year: 1920, qualifier: 'after', confidence: 'approximate' });
    expect(normalizeDate('BEFORE 20 Oct 1646')).toMatchObject({
      year: 1646,
      month: 10,
      day: 20,
      qualifier: 'before',
      confidence: 'approximate',
    });
    expect(normalizeDate('AFT 6 DEC 1660')).toMatchObject({ year: 1660, month: 12, day: 6 });
  });

  it('falls back to unknown for junk values', () => {
    expect(normalizeDate('?')).toMatchObject({ year: null, qualifier: 'unknown', confidence: 'unknown' });
    expect(normalizeDate('?unknown')).toMatchObject({ year: null, confidence: 'unknown' });
    expect(normalizeDate('DECEASED')).toMatchObject({ year: null, confidence: 'unknown' });
  });

  it('salvages a plausible year out of unparseable qualifiers as a last resort', () => {
    expect(normalizeDate('26 January 69')).toMatchObject({ year: null, confidence: 'unknown' });
  });

  it('treats an empty or missing value as unknown', () => {
    expect(normalizeDate(undefined)).toMatchObject({ year: null, confidence: 'unknown' });
    expect(normalizeDate('')).toMatchObject({ year: null, confidence: 'unknown' });
    expect(normalizeDate('   ')).toMatchObject({ year: null, confidence: 'unknown' });
  });
});
