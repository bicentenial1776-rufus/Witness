import { describe, expect, it } from 'vitest';

import { describeRegistration, groupVoyages, type PassengerCandidate } from '../passengerCandidates.js';

function candidate(overrides: Partial<PassengerCandidate>): PassengerCandidate {
  return {
    id: 'c',
    treeId: 't',
    individualId: 'i',
    voyageId: 'falcon-1635',
    passengerId: 'falcon-1635:king-john',
    ship: 'Falcon',
    arrivalYear: 1635,
    departurePort: null,
    arrivalPlace: null,
    passengerName: 'John King',
    passengerBirthYear: 1605,
    passengerDeathYear: null,
    registerDate: null,
    boundFor: null,
    source: 'Hotten',
    confidence: 'strong',
    reasons: [],
    status: 'pending',
    ...overrides,
  };
}

describe('describeRegistration', () => {
  it('reads a full date and a destination', () => {
    expect(describeRegistration({ registerDate: '1635-12-25', boundFor: 'Barbados' })).toBe(
      'Registered 25 December 1635 · bound for Barbados',
    );
  });

  it('reads a month-only date, and either half alone', () => {
    expect(describeRegistration({ registerDate: '1635-04', boundFor: null })).toBe('Registered April 1635');
    expect(describeRegistration({ registerDate: null, boundFor: 'New England' })).toBe('bound for New England');
  });

  it('is null for a reconstruction', () => {
    expect(describeRegistration({ registerDate: null, boundFor: null })).toBeNull();
  });
});

describe('groupVoyages', () => {
  it('counts verdicts per voyage, ships with a confirmed name first, then by year', () => {
    const roster = groupVoyages([
      candidate({ id: '1', voyageId: 'falcon-1635', ship: 'Falcon', arrivalYear: 1635 }),
      candidate({ id: '2', voyageId: 'falcon-1635', ship: 'Falcon', arrivalYear: 1635, status: 'dismissed' }),
      candidate({ id: '3', voyageId: 'mayflower-1620', ship: 'Mayflower', arrivalYear: 1620, status: 'confirmed' }),
      candidate({ id: '4', voyageId: 'mayflower-1620', ship: 'Mayflower', arrivalYear: 1620 }),
      candidate({ id: '5', voyageId: 'anne-1623', ship: 'Anne', arrivalYear: 1623 }),
    ]);
    expect(roster).toEqual([
      { voyageId: 'mayflower-1620', ship: 'Mayflower', arrivalYear: 1620, confirmed: 1, pending: 1 },
      { voyageId: 'anne-1623', ship: 'Anne', arrivalYear: 1623, confirmed: 0, pending: 1 },
      { voyageId: 'falcon-1635', ship: 'Falcon', arrivalYear: 1635, confirmed: 0, pending: 1 },
    ]);
  });
});
