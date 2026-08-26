import { describe, expect, it } from 'vitest';
import { parseCsv, parseYear, rowsToPassengers } from '../passengerImport.js';

describe('parseCsv', () => {
  it('handles quotes, embedded commas, and doubled quotes', () => {
    const rows = parseCsv('name,notes\n"Standish, Myles","said ""captain"""\n');
    expect(rows).toEqual([
      ['name', 'notes'],
      ['Standish, Myles', 'said "captain"'],
    ]);
  });

  it('drops blank lines and tolerates CRLF', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseYear', () => {
  it('reads the hedges these lists are written in', () => {
    expect(parseYear('c. 1584')).toBe(1584);
    expect(parseYear('abt 1584')).toBe(1584);
    expect(parseYear('1584?')).toBe(1584);
  });

  it('refuses what is not a year in range', () => {
    expect(parseYear('')).toBeNull();
    expect(parseYear('unknown')).toBeNull();
    expect(parseYear('2019')).toBeNull();
  });
});

describe('rowsToPassengers', () => {
  const source = 'test source';

  it('splits a single name column and keeps provenance', () => {
    const rows = parseCsv('name,birth,death\nMyles Standish,c. 1584,1656\n');
    expect(rowsToPassengers(rows, 'mayflower-1620', source)[0]).toMatchObject({
      id: 'mayflower-1620:standish-myles',
      fullName: 'Myles Standish',
      givenNames: 'Myles',
      surname: 'Standish',
      birthYear: 1584,
      deathYear: 1656,
      source,
    });
  });

  it('prefers explicit given and surname columns', () => {
    const rows = parseCsv('Given Names,Last Name\nElizabeth Ann,Tilley\n');
    expect(rowsToPassengers(rows, 'v', source)[0]).toMatchObject({
      givenNames: 'Elizabeth Ann',
      surname: 'Tilley',
      fullName: 'Elizabeth Ann Tilley',
    });
  });

  it('keeps two namesakes on one list as two rows', () => {
    const rows = parseCsv('name\nJohn Cooke\nJohn Cooke\n');
    expect(rowsToPassengers(rows, 'v', source).map((p) => p.id)).toEqual([
      'v:cooke-john',
      'v:cooke-john-2',
    ]);
  });

  it('reads an age column as an age, not a year', () => {
    const rows = parseCsv('name,age\nJohn Alden,22\n');
    const [passenger] = rowsToPassengers(rows, 'v', source);
    expect(passenger?.ageAtVoyage).toBe(22);
    expect(passenger?.birthYear).toBeNull();
  });

  it('lets a row override the voyage-level source', () => {
    const rows = parseCsv('name,source\nMary Chilton,a particular transcription\n');
    expect(rowsToPassengers(rows, 'v', source)[0]?.source).toBe('a particular transcription');
  });

  it('skips rows with no name at all', () => {
    expect(rowsToPassengers(parseCsv('name,birth\n,1600\n'), 'v', source)).toEqual([]);
  });
});
