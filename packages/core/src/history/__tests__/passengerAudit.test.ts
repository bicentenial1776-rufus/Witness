import { describe, expect, it } from 'vitest';
import { auditDated, auditPassengers, formatAudit, type DatedSubject } from '../passengerAudit.js';
import type { PassengerDataset } from '../passengers.js';

const subject = (over: Partial<DatedSubject>): DatedSubject => ({
  id: 'x',
  label: 'Test Person',
  birthYear: null,
  deathYear: null,
  age: null,
  eventYear: 1620,
  eventLabel: 'the Testship arrived in 1620',
  ...over,
});

const rules = (flags: ReturnType<typeof auditDated>) => flags.map((f) => f.rule);

describe('auditDated — the generic tier', () => {
  it('passes a plausible record in silence', () => {
    expect(auditDated([subject({ birthYear: 1584, deathYear: 1656, age: 36 })])).toEqual([]);
  });

  it('refuses a birth after the event', () => {
    expect(rules(auditDated([subject({ birthYear: 1756 })]))).toEqual(['born-after-event']);
  });

  it('refuses a death before the event', () => {
    expect(rules(auditDated([subject({ deathYear: 1561 })]))).toEqual(['died-before-event']);
  });

  it('refuses a death before birth, and an impossible span', () => {
    // A death before birth always breaks another rule too (the event
    // cannot sit between them), so the rule is checked by presence.
    expect(rules(auditDated([subject({ birthYear: 1600, deathYear: 1590 })]))).toContain(
      'died-before-born',
    );
    expect(rules(auditDated([subject({ birthYear: 1501, deathYear: 1621 })]))).toEqual(['lifespan']);
  });

  it('refuses an age that disagrees with the birth year', () => {
    // A one-year-old born in 1596: Samuel Eaton wearing his father's dates.
    const [flag] = auditDated([subject({ birthYear: 1596, age: 1 })]);
    expect(flag?.rule).toBe('age-disagrees-with-birth');
    expect(flag?.reason).toContain('about 1619');
  });

  it('lets an age drift a few years, as sworn ages do', () => {
    expect(auditDated([subject({ birthYear: 1592, age: 25 })])).toEqual([]);
  });

  it('refuses a nameless row', () => {
    expect(rules(auditDated([subject({ label: '  ' })]))).toEqual(['no-name']);
  });

  it('every generic flag is a contradiction', () => {
    const flags = auditDated([subject({ birthYear: 1700, deathYear: 1500, age: 200 })]);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f) => f.tier === 'contradiction')).toBe(true);
  });
});

const dataset = (passengers: PassengerDataset['passengers']): PassengerDataset => ({
  voyages: [{ id: 'testship-1620', ship: 'Testship', arrivalYear: 1620, source: 'synthetic' }],
  passengers,
});

const row = (
  id: string,
  fullName: string,
  over: Partial<PassengerDataset['passengers'][number]> = {},
): PassengerDataset['passengers'][number] => {
  const [givenNames, surname] = fullName.split(' ') as [string, string];
  return {
    id: `testship-1620:${id}`,
    voyageId: 'testship-1620',
    fullName,
    givenNames,
    surname,
    birthYear: null,
    deathYear: null,
    ageAtVoyage: null,
    source: 'synthetic',
    ...over,
  };
};

describe('auditPassengers — the library tier', () => {
  it('runs the generic rules against the voyage year', () => {
    const flags = auditPassengers(dataset([row('a', 'Aaron Burr', { birthYear: 1756, deathYear: 1836 })]));
    expect(flags.map((f) => f.rule)).toEqual(['born-after-event']);
    expect(flags[0]?.reason).toContain('the Testship arrived in 1620');
  });

  it('flags a voyage the dataset does not know', () => {
    const flags = auditPassengers(dataset([row('a', 'John Smith', { voyageId: 'ghost-1600' })]));
    expect(flags.map((f) => f.rule)).toEqual(['unknown-voyage']);
  });

  it('notices one Wikidata item dating two people', () => {
    const flags = auditPassengers(
      dataset([
        row('f', 'Francis Eaton', { birthYear: 1596, deathYear: 1633, source: 'list; dates via Wikidata (Q1)' }),
        row('s', 'Sarah Eaton', { birthYear: 1596, deathYear: 1633, source: 'list; dates via Wikidata (Q1)' }),
      ]),
    );
    const shared = flags.filter((f) => f.rule === 'wikidata-item-shared');
    expect(shared).toHaveLength(2);
    expect(shared.every((f) => f.tier === 'look')).toBe(true);
    expect(shared[1]?.reason).toBe('Sarah Eaton: cites Q1, which also dates Francis Eaton');
    // And the same pair trips the household look.
    expect(flags.filter((f) => f.rule === 'household-shares-dates')).toHaveLength(2);
  });

  it('leaves two namesakes sharing dates alone — that is one person twice', () => {
    const flags = auditPassengers(
      dataset([
        row('a', 'John Smith', { birthYear: 1616 }),
        row('b', 'John Smith', { birthYear: 1616 }),
      ]),
    );
    expect(flags).toEqual([]);
  });

  it('notices a source that names dates the row does not carry', () => {
    const flags = auditPassengers(dataset([row('a', 'Mary Chilton', { source: 'list; dates via Wikidata (Q2)' })]));
    expect(flags.map((f) => f.rule)).toEqual(['dates-cited-not-carried']);
  });
});

describe('formatAudit', () => {
  it('prints contradictions first and says nothing for a clean set', () => {
    expect(formatAudit([])).toBe('');
    const text = formatAudit([
      { tier: 'look', rule: 'x', id: 'a', reason: 'a look' },
      { tier: 'contradiction', rule: 'y', id: 'b', reason: 'a contradiction' },
    ]);
    expect(text.indexOf('impossible')).toBeLessThan(text.indexOf('worth a look'));
  });
});
