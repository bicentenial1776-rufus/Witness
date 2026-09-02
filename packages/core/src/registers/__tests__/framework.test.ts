import { describe, expect, it } from 'vitest';

import { fillDeepLink } from '../deeplink.js';
import { scoreExposure } from '../exposure.js';
import { pointsFromRecordEvents, pointsFromSavedPayloads } from '../map.js';
import { matchRegisterRecords } from '../match.js';
import { registerNarrativeBlocks } from '../narrative.js';
import type {
  ExposureConfig,
  PersonRegisterLink,
  RegisterDef,
  RegisterPersonFacts,
  RegisterRecord,
} from '../types.js';

// Synthetic registers, one per variant — the framework proves itself on
// fixtures before any real record set rides it. Real register tests live
// with their registers.

const person = (over: Partial<RegisterPersonFacts> = {}): RegisterPersonFacts => ({
  id: 'p1',
  fullName: 'Joseph Comeau',
  sex: 'M',
  birthYear: 1730,
  deathYear: 1790,
  events: [
    { type: 'birth', year: 1730, placeParts: ['Grand-Pré', 'Acadia'] },
    { type: 'residence', year: 1754, placeParts: ['Grand-Pré', 'Acadia'] },
  ],
  ...over,
});

const EXPOSURE: ExposureConfig = {
  dateWindows: [{ from: 1700, to: 1755, weight: 2, reason: 'events before the deportation' }],
  placeSignals: [{ pattern: 'acadia', weight: 3, reason: 'a recorded Acadian place' }],
  coincidenceBonus: 1,
  surnames: { list: ['comeau', 'leblanc'], weight: 1, reason: 'a deportation-roster surname' },
  threshold: 5,
};

describe('exposure scorer (Variant A/B/C shared)', () => {
  it('scores dates, places, coincidence, and surname with reasons', () => {
    const result = scoreExposure(person(), EXPOSURE);
    expect(result.exposed).toBe(true);
    expect(result.score).toBe(7);
    expect(result.reasons).toContain('a recorded Acadian place');
    expect(result.reasons).toContain('a deportation-roster surname');
  });

  it('stays silent below the threshold', () => {
    const nobody = person({
      fullName: 'Ezra Whitfield',
      events: [{ type: 'birth', year: 1900, placeParts: ['Ohio', 'United States'] }],
    });
    expect(scoreExposure(nobody, EXPOSURE).exposed).toBe(false);
  });

  it('hard-filters a mismatched sex', () => {
    const result = scoreExposure(person({ sex: 'F' }), { ...EXPOSURE, sex: 'M' });
    expect(result.score).toBe(0);
  });
});

const RECORD: RegisterRecord = {
  id: 'acadian-test:comeau-joseph',
  registerKey: 'acadian-test',
  recordKind: 'person',
  nameAsRecorded: 'Joseph Comeau',
  surnameNormalized: 'Comeau',
  givenNormalized: 'Joseph',
  entityKey: null,
  attributes: { birth_year: 1731, event_year: 1755 },
  sourceCitation: 'synthetic fixture',
  findingAidUrl: null,
};

describe('Variant A matcher', () => {
  it('grades exact name + year agreement strong, with plain reasons', () => {
    const [candidate] = matchRegisterRecords([RECORD], [person()]);
    expect(candidate).toBeDefined();
    expect(candidate!.confidence).toBe('strong');
    expect(candidate!.reasons.join(' ')).toContain('agree within 1');
  });

  it('kills a pair the years contradict', () => {
    const late = person({ birthYear: 1790, deathYear: 1860 });
    expect(matchRegisterRecords([RECORD], [late])).toHaveLength(0);
  });

  it('caps candidates per person', () => {
    const records = Array.from({ length: 9 }, (_, i) => ({
      ...RECORD,
      id: `acadian-test:comeau-${i}`,
      attributes: {},
    }));
    const out = matchRegisterRecords(records, [person()], { maxCandidatesPerPerson: 3 });
    expect(out).toHaveLength(3);
  });
});

describe('Variant C deep links', () => {
  it('fills and encodes template tokens, empty for missing values', () => {
    const url = fillDeepLink('https://example.gov/search?ln={surname}&fn={given}&st={state}', {
      surname: "O'Brien",
      given: 'Mary Ann',
      state: null,
    });
    expect(url).toBe("https://example.gov/search?ln=O'Brien&fn=Mary%20Ann&st=".replace("O'Brien", "O'Brien"));
    expect(url).toContain('fn=Mary%20Ann');
    expect(url.endsWith('st=')).toBe(true);
  });
});

const REGISTERS = new Map<string, RegisterDef>([
  [
    'acadian-test',
    {
      registerKey: 'acadian-test',
      displayName: 'Acadian Deportation (test)',
      variant: 'A',
      provenanceLabel: 'From Deportation records (test)',
      coverageCaveat: null,
      status: 'active',
      config: { markerStyle: 'deportation' },
    },
  ],
]);

const link = (over: Partial<PersonRegisterLink> = {}): PersonRegisterLink => ({
  id: 'l1',
  treeId: 't1',
  individualId: 'p1',
  registerKey: 'acadian-test',
  recordId: RECORD.id,
  status: 'confirmed',
  matchScore: null,
  matchReasons: [],
  recordName: 'Joseph Comeau, deported from Grand-Pré, 1755',
  recordSummary: 'aboard the Pembroke, bound for the Carolinas',
  sourceCitation: 'synthetic fixture',
  findingAidUrl: null,
  savedPayload: null,
  confirmedAt: '2026-09-02T00:00:00Z',
  ...over,
});

describe('narrative blocks', () => {
  it('emits provenance-labeled blocks for confirmed links only', () => {
    const blocks = registerNarrativeBlocks(
      [link(), link({ id: 'l2', status: 'candidate' })],
      REGISTERS,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.provenanceLabel).toBe('From Deportation records (test)');
    expect(blocks[0]!.text).toContain('Pembroke');
  });
});

describe('map points', () => {
  it('person points from Variant C payloads, entity points from record events', () => {
    const personPoints = pointsFromSavedPayloads(
      [link({ savedPayload: { latitude: 45.1, longitude: -64.3 } })],
      REGISTERS,
    );
    expect(personPoints).toHaveLength(1);
    expect(personPoints[0]!).toMatchObject({ kind: 'person', markerStyle: 'deportation' });

    const entityPoints = pointsFromRecordEvents('civilwar-test', 'regiment', [
      { latitude: 39.8, longitude: -77.2, event_type: 'battle', event_year: 1863, place_text: 'Gettysburg' },
      { latitude: null, longitude: null, event_type: 'muster', event_year: 1861, place_text: 'Boston' },
    ]);
    expect(entityPoints).toHaveLength(1);
    expect(entityPoints[0]!).toMatchObject({ kind: 'entity', label: 'battle · 1863 · Gettysburg' });
  });
});
