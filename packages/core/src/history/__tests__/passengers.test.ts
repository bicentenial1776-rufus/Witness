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
    {
      id: 'testship-1620:standish-rose',
      voyageId: 'testship-1620',
      fullName: 'Rose Standish',
      givenNames: 'Rose',
      surname: 'Standish',
      birthYear: null,
      deathYear: null,
      ageAtVoyage: null,
      notes: 'wife',
      source: 'synthetic fixture',
    },
    {
      id: 'testship-1620:smith-mary',
      voyageId: 'testship-1620',
      fullName: 'Mary Smith',
      givenNames: 'Mary',
      surname: 'Smith',
      birthYear: 1590,
      deathYear: null,
      ageAtVoyage: null,
      notes: 'wife',
      source: 'synthetic fixture',
    },
    {
      id: 'testship-1620:standish-mary',
      voyageId: 'testship-1620',
      fullName: 'Mary Standish',
      givenNames: 'Mary',
      surname: 'Standish',
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
  spouseIds?: string[],
): MatchableIndividual => ({ id, fullName, birthYear, deathYear, spouseIds });

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

describe('the household pass', () => {
  it('reads a surname-less spouse under a strong anchor as probable', () => {
    // The tree knows her only as "Rose", died the first winter.
    const matches = matchPassengers(DATASET, [
      individual('m', 'Myles Standish', 1584, 1656, ['r']),
      individual('r', 'Rose', null, 1621, ['m']),
    ]);
    const rose = matches.find((c) => c.individual.id === 'r');
    expect(rose?.passenger.id).toBe('testship-1620:standish-rose');
    expect(rose?.confidence).toBe('probable');
    expect(rose?.reasons[0]).toBe('no surname in the tree; read as Rose Standish');
    expect(rose?.reasons[1]).toContain('beside Myles Standish, a strong match');
  });

  it('reads a maiden-named spouse under the anchor surname', () => {
    const matches = matchPassengers(DATASET, [
      individual('m', 'Myles Standish', 1584, 1656, ['r']),
      individual('r', 'Rose Alden', null, null, ['m']),
    ]);
    const rose = matches.find((c) => c.individual.id === 'r');
    expect(rose?.confidence).toBe('probable');
    expect(rose?.reasons[0]).toContain("read under the spouse's surname as Rose Standish");
  });

  it('still applies the year tests', () => {
    // A Rose who died before the ship sailed did not sail on it.
    const matches = matchPassengers(DATASET, [
      individual('m', 'Myles Standish', 1584, 1656, ['r']),
      individual('r', 'Rose', null, 1610, ['m']),
    ]);
    expect(matches.find((c) => c.individual.id === 'r')).toBeUndefined();
  });

  it('needs a spouse the name pass already places on the voyage', () => {
    // A dateless John Smith is only weak — no anchor, no household.
    const matches = matchPassengers(DATASET, [
      individual('j', 'John Smith', null, null, ['r']),
      individual('r', 'Rose', null, null, ['j']),
    ]);
    expect(matches.find((c) => c.individual.id === 'r')).toBeUndefined();
  });

  it('lets agreeing years lift a probable anchor to probable', () => {
    // Miles Standishe (by sound) is a probable anchor; Mary's birth agrees
    // with the list, so she is probable rather than weak.
    const matches = matchPassengers(DATASET, [
      individual('j', 'John Smith', 1588, 1650, ['m']),
      individual('m', 'Mary Jones', 1591, null, ['j']),
    ]);
    const mary = matches.find((c) => c.individual.id === 'm');
    expect(mary?.passenger.id).toBe('testship-1620:smith-mary');
    expect(mary?.confidence).toBe('probable');
  });

  it('does not resurrect a bucket-mate the name pass rejected', () => {
    // Rose Standish born 1700 already met Rose Standish on the list and
    // failed on the years; her husband cannot bring her back.
    const matches = matchPassengers(DATASET, [
      individual('m', 'Myles Standish', 1584, 1656, ['r']),
      individual('r', 'Rose Standish', 1700, null, ['m']),
    ]);
    expect(matches.find((c) => c.individual.id === 'r')).toBeUndefined();
  });

  it('never reads a husband under his wife\'s maiden surname', () => {
    // John Howland married Elizabeth Tilley; read as a Tilley he would
    // only find her mother Joan, whose name happens to sound like his.
    const matches = matchPassengers(DATASET, [
      { ...individual('m', 'Myles Standish', 1584, 1656, ['r']), sex: 'M' },
      { ...individual('r', 'Rose Alden', null, null, ['m']), sex: 'M' },
    ]);
    expect(matches.find((c) => c.individual.id === 'r')).toBeUndefined();
  });

  it('leaves alone anyone already placed on the voyage by name', () => {
    // Mary Smith stands on the list in her own right; Myles's household
    // does not read her again as a Standish.
    const matches = matchPassengers(DATASET, [
      individual('m', 'Myles Standish', 1584, 1656, ['s']),
      individual('s', 'Mary Smith', 1590, null, ['m']),
    ]);
    const mary = matches.filter((c) => c.individual.id === 's');
    expect(mary.map((c) => c.passenger.id)).toEqual(['testship-1620:smith-mary']);
  });

  it('respects the confidence floor', () => {
    const matches = matchPassengers(
      DATASET,
      [individual('m', 'Myles Standish', 1584, 1656, ['r']), individual('r', 'Rose', null, null, ['m'])],
      { minimumConfidence: 'strong' },
    );
    expect(matches.map((c) => c.individual.id)).toEqual(['m']);
  });
});
