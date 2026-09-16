import { describe, expect, it } from 'vitest';
import { passengerVerificationLinks, type PassengerCandidate } from '../passengerCandidates.js';

function candidate(overrides: Partial<PassengerCandidate>): PassengerCandidate {
  return {
    id: 'c1',
    treeId: 't1',
    individualId: 'i1',
    voyageId: 'mayflower-1620',
    passengerId: 'mayflower-1620:alden-john',
    ship: 'Mayflower',
    arrivalYear: 1620,
    departurePort: null,
    arrivalPlace: null,
    passengerName: 'John Alden',
    passengerBirthYear: 1598,
    passengerDeathYear: 1687,
    source: 'Wikipedia, "List of Mayflower passengers" (CC BY-SA); dates via Wikidata (Q6218491)',
    confidence: 'strong',
    reasons: [],
    status: 'pending',
    ...overrides,
  };
}

const labels = (links: { label: string }[]) => links.map((l) => l.label);

describe('passengerVerificationLinks', () => {
  it('sends a Wikidata-backed row to the article, then the list it appears on', () => {
    const links = passengerVerificationLinks(candidate({}));
    expect(links[0]).toEqual({
      label: 'Wikipedia article',
      url: 'https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/Q6218491',
    });
    expect(links[1]).toEqual({
      label: 'Wikipedia: List of Mayflower passengers',
      url: 'https://en.wikipedia.org/wiki/List_of_Mayflower_passengers',
    });
    expect(labels(links)).not.toContain('Find on Wikipedia');
  });

  it('links every Wikipedia page the source names, encoding the title', () => {
    const links = passengerVerificationLinks(
      candidate({
        passengerName: 'Samuel Eaton',
        source:
          'Wikipedia, "List of Mayflower passengers" (CC BY-SA); dates via Wikipedia, "Francis Eaton (Mayflower passenger)"',
      }),
    );
    expect(links.map((l) => l.url)).toEqual(
      expect.arrayContaining([
        'https://en.wikipedia.org/wiki/List_of_Mayflower_passengers',
        'https://en.wikipedia.org/wiki/Francis_Eaton_(Mayflower_passenger)',
      ]),
    );
  });

  it('opens a Banks row in the scanned book at the surname', () => {
    const links = passengerVerificationLinks(
      candidate({
        passengerName: 'Edward Winslow',
        ship: 'Charity',
        arrivalYear: 1624,
        source: 'Charles Edward Banks, The Planters of the Commonwealth (1930), Charity (1624)',
      }),
    );
    expect(links[0]).toEqual({
      label: 'Banks, Planters of the Commonwealth (archive.org)',
      url: 'https://archive.org/details/plantersofcommon00bank?q=Winslow',
    });
    expect(labels(links)).not.toContain('Find on Wikipedia');
  });

  it('opens a Hotten row in the port register scan', () => {
    const links = passengerVerificationLinks(
      candidate({
        passengerName: 'John King',
        ship: 'Falcon',
        arrivalYear: 1635,
        source: 'John Camden Hotten, The Original Lists of Persons of Quality (1874) — Falcon (1635) register',
      }),
    );
    expect(links[0]?.url).toBe('https://archive.org/details/originallistsofp00hott?q=King');
  });

  it('falls back to a search only when the source names nothing linkable', () => {
    const links = passengerVerificationLinks(
      candidate({
        passengerName: 'Thomas Greene',
        ship: 'Ark and Dove',
        arrivalYear: 1634,
        passengerBirthYear: null,
        source: 'Maryland land patents (Skordas 1968), compiled in Newman (1968)',
      }),
    );
    expect(labels(links)).toEqual(['Find on Wikipedia', 'FamilySearch (free account needed)']);
    expect(links[0]?.url).toBe('https://en.wikipedia.org/w/index.php?search=Thomas%20Greene&go=Go');
  });

  it('always ends with a FamilySearch query, windowed on the birth year when known', () => {
    const [last] = passengerVerificationLinks(candidate({})).slice(-1);
    expect(last?.url).toBe(
      'https://www.familysearch.org/search/record/results?q.givenName=John&q.surname=Alden&q.birthLikeDate.from=1596&q.birthLikeDate.to=1600',
    );
    const [noYear] = passengerVerificationLinks(candidate({ passengerBirthYear: null })).slice(-1);
    expect(noYear?.url).toBe(
      'https://www.familysearch.org/search/record/results?q.givenName=John&q.surname=Alden',
    );
  });
});
