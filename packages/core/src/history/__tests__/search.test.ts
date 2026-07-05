import { describe, expect, it } from 'vitest';
import { HISTORICAL_EVENTS, eventMatchesSearch, getHistoricalEvent } from '../events.js';

describe('eventMatchesSearch', () => {
  const kpw = getHistoricalEvent('king-philips-war')!;
  const mayflower = getHistoricalEvent('mayflower-landing')!;

  it('matches name, region, and summary text', () => {
    expect(eventMatchesSearch(kpw, 'philip')).toBe(true);
    expect(eventMatchesSearch(kpw, 'new england')).toBe(true);
    expect(eventMatchesSearch(kpw, 'deadliest')).toBe(true);
  });

  it('matches start and end years', () => {
    expect(eventMatchesSearch(kpw, '1675')).toBe(true);
    expect(eventMatchesSearch(kpw, '1678')).toBe(true);
    expect(eventMatchesSearch(kpw, '1620')).toBe(false);
  });

  it('matches hidden keywords when present', () => {
    expect(eventMatchesSearch({ ...mayflower, keywords: ['pilgrims'] }, 'pilgrim')).toBe(true);
  });

  it('is case-insensitive and an empty query matches everything', () => {
    expect(eventMatchesSearch(kpw, 'PHILIP')).toBe(true);
    expect(HISTORICAL_EVENTS.every((e) => eventMatchesSearch(e, ''))).toBe(true);
  });
});
