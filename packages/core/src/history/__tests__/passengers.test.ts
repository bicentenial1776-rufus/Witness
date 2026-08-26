import { describe, expect, it } from 'vitest';
import {
  matchPassengers,
  normalizeNamePart,
  splitName,
  type MatchableIndividual,
  type PassengerDataset,
} from '../passengers.js';

// Synthetic rows in the dataset's shape. Real passenger facts come from
// published transcriptions, never from a test fixture.
const DATASET: PassengerDataset = {
  voyages: [
    {
      id: 'testship-1620',
      ship: 'Testship',
      arrivalYear: 1620,
      departurePort: 'Plymouth, England',
      arrivalPlace: 'Cape Cod',
      source: 'synthetic fixture',
    },
  ],
  passengers: [
    {
      id: 'testship-1620:standish-myles',
      voyageId: 'testship-1620',
      fullName: 'Myles Standish',
      givenNames: 'Myles',
      surname: 'Standish',
      birthYear: 1584,
      deathYear: 1656,
      ageAtVoyage: null,
      source: 'synthetic fixture',
    },
    {
      id: 'testship-1620:smith-john',
      voyageId: 'testship-1620',
      fullName: 'John Smith',
      givenNames: 'John',
      surname: 'Smith',
      birthYear: null,
      deathYear: null,
      ageAtVoyage: null,
      source: 'synthetic fixture',
    },
  ],
};

const individual = (
  id: string,
  fullName: string,
  birthYear: number | null,
  deathYear: number | null,
): MatchableIndividual => ({ id, fullName, birthYear, deathYear });

describe('name handling', () => {
  it('folds case, accents, and punctuation', () => {
    expect(normalizeNamePart('Frédéric')).toBe('frederic');
    expect(normalizeNamePart("O'Brien")).toBe('obrien');
  });

  it('reads a GEDCOM-slashed surname and a plain one alike', () => {
    expect(splitName('John /Alden/')).toEqual({ givenNames: 'John', surname: 'Alden' });
    expect(splitName('Mary Chilton')).toEqual({ givenNames: 'Mary', surname: 'Chilton' });
    expect(splitName('Elizabeth Ann Tilley')).toEqual({
      givenNames: 'Elizabeth Ann',
      surname: 'Tilley',
    });
  });
});

describe('matchPassengers', () => {
  it('calls an exact name with agreeing dates strong', () => {
    const [match] = matchPassengers(DATASET, [individual('a', 'Myles Standish', 1584, 1656)]);
    expect(match?.confidence).toBe('strong');
    expect(match?.voyage.ship).toBe('Testship');
    expect(match?.reasons.join(' ')).toContain('exactly');
  });

  it('matches across spelling drift', () => {
    const [match] = matchPassengers(DATASET, [individual('a', 'Miles Standishe', 1585, null)]);
    expect(match?.confidence).toBe('probable');
    expect(match?.reasons[0]).toContain('by sound');
  });

  it('drops a namesake whose dates contradict the passenger', () => {
    // A Standish born two centuries later is a different man.
    expect(matchPassengers(DATASET, [individual('a', 'Myles Standish', 1784, 1856)])).toEqual([]);
  });

  it('refuses anyone born after the ship arrived', () => {
    expect(matchPassengers(DATASET, [individual('a', 'Myles Standish', 1630, null)])).toEqual([]);
  });

  it('refuses anyone already dead when the ship arrived', () => {
    expect(matchPassengers(DATASET, [individual('a', 'Myles Standish', 1540, 1600)])).toEqual([]);
  });

  it('keeps a dateless namesake only as weak', () => {
    const [match] = matchPassengers(DATASET, [individual('a', 'John Smith', null, null)]);
    expect(match?.confidence).toBe('weak');
  });

  it('can be told to report only the confident ones', () => {
    const individuals = [
      individual('a', 'John Smith', null, null),
      individual('b', 'Myles Standish', 1584, 1656),
    ];
    const strong = matchPassengers(DATASET, individuals, { minimumConfidence: 'probable' });
    expect(strong).toHaveLength(1);
    expect(strong[0]!.individual.id).toBe('b');
  });

  it('reports every candidate rather than picking a winner', () => {
    const individuals = [
      individual('a', 'Myles Standish', 1584, 1656),
      individual('b', 'Myles Standish', 1586, null),
    ];
    expect(matchPassengers(DATASET, individuals)).toHaveLength(2);
  });
});
