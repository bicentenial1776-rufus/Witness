import { describe, expect, it } from 'vitest';

import { formatRegisterDate, normalizeDestination, parseRegisterDate } from '../ocrParsers.js';
import { rowsToPassengers } from '../passengerImport.js';

// Fixture lines are verbatim from the Hotten OCR text.

describe('parseRegisterDate', () => {
  it('reads an arabic day and a Latin month', () => {
    expect(parseRegisterDate('25  Decembris   1635 ')).toEqual({ year: 1635, month: 12, day: 25 });
  });

  it('reads roman days, with the clerks’ final j and OCR ornaments', () => {
    expect(parseRegisterDate('xj°  Aprilis  1635')).toMatchObject({ month: 4, day: 11 });
    expect(parseRegisterDate('viij°  Maij  1635.')).toMatchObject({ month: 5, day: 8 });
    expect(parseRegisterDate('xviij"  Aprilis  1635')).toMatchObject({ month: 4, day: 18 });
    expect(parseRegisterDate('ix°  Aprilis   1635')).toMatchObject({ month: 4, day: 9 });
  });

  it('reads Latin ordinals and skips "die"', () => {
    expect(parseRegisterDate('Nono  die  Maij  1635.')).toMatchObject({ month: 5, day: 9 });
    expect(parseRegisterDate('Primo  Aprill  1635')).toMatchObject({ month: 4, day: 1 });
    expect(parseRegisterDate('Secundo  Januarij  1634')).toMatchObject({ month: 1, day: 2 });
  });

  it('rejoins a day the OCR split and strips ordinal noise', () => {
    expect(parseRegisterDate('1 6  Marcij  1634')).toMatchObject({ month: 3, day: 16 });
    expect(parseRegisterDate('3rf  Aprill  1635')).toMatchObject({ month: 4, day: 3 });
    expect(parseRegisterDate('22°  Marcij  1634')).toMatchObject({ month: 3, day: 22 });
  });

  it('keeps the month when the day is unreadable', () => {
    expect(parseRegisterDate('r/"  Januarij  1634.')).toMatchObject({ month: 1, day: null });
    expect(parseRegisterDate('Aprilis  1635.')).toEqual({ year: 1635, month: 4, day: null });
  });

  it('leaves the year to the caller when the line has none', () => {
    expect(parseRegisterDate('eodem  29  Aprilis')).toEqual({ year: null, month: 4, day: 29 });
  });

  it('is not fooled by prose or name lines', () => {
    expect(parseRegisterDate('Jo:  KING 30')).toBeNull();
    expect(
      parseRegisterDate('The imposition of Ship Money was the culminating measure that drove hundreds, in June 1637'),
    ).toBeNull();
  });
});

describe('formatRegisterDate', () => {
  it('writes a partial ISO date', () => {
    expect(formatRegisterDate({ year: 1635, month: 12, day: 25 })).toBe('1635-12-25');
    expect(formatRegisterDate({ year: 1635, month: 4, day: null })).toBe('1635-04');
  });
});

describe('normalizeDestination', () => {
  it('reads the clerks’ spellings as one modern name each', () => {
    expect(normalizeDestination('the  Barbadoes')).toBe('Barbados');
    expect(normalizeDestination('Virginea  im-')).toBe('Virginia');
    expect(normalizeDestination("Virginea'imbarqued")).toBe('Virginia');
    expect(normalizeDestination('New-')).toBe('New England');
    expect(normalizeDestination("S'  Christo-")).toBe('St Christopher');
    expect(normalizeDestination('the  Bormoodes')).toBe('Bermuda');
  });

  it('gives up on a formula that names no place', () => {
    expect(normalizeDestination('the  Island  of')).toBe('');
    expect(normalizeDestination('')).toBe('');
  });
});

describe('rowsToPassengers register columns', () => {
  it('keeps a partial ISO date and a destination, and ignores a malformed date', () => {
    const rows = [
      ['given', 'surname', 'birth', 'date', 'destination', 'source'],
      ['John', 'King', 'c. 1605', '1635-12-25', 'Barbados', 'Hotten'],
      ['Jane', 'Hickles', 'c. 1610', '25 Dec 1635', '', 'Hotten'],
    ];
    const [king, hickles] = rowsToPassengers(rows, 'falcon-1635', 'Hotten');
    expect(king).toMatchObject({ registerDate: '1635-12-25', boundFor: 'Barbados' });
    expect(hickles).not.toHaveProperty('registerDate');
    expect(hickles).not.toHaveProperty('boundFor');
  });
});
