import { describe, expect, it } from 'vitest';

import { parseSubjectKey, subjectKey, subjectLabel } from '../subjects.js';

describe('subjectKey / parseSubjectKey', () => {
  it('round-trips every singular kind', () => {
    for (const kind of ['name', 'birth', 'death', 'burial', 'parents', 'spouse', 'other'] as const) {
      expect(subjectKey({ kind })).toBe(kind);
      expect(parseSubjectKey(kind)).toEqual({ kind });
    }
  });

  it('round-trips a dated event', () => {
    const key = subjectKey({ kind: 'event', eventType: 'census', year: 1900 });
    expect(key).toBe('event:census:1900');
    expect(parseSubjectKey(key)).toEqual({ kind: 'event', eventType: 'census', year: 1900 });
  });

  it('round-trips an undated event', () => {
    const key = subjectKey({ kind: 'event', eventType: 'residence', year: null });
    expect(key).toBe('event:residence');
    expect(parseSubjectKey(key)).toEqual({ kind: 'event', eventType: 'residence', year: null });
  });

  it('normalises event-type noise into the key', () => {
    expect(subjectKey({ kind: 'event', eventType: ' Census ', year: 1900 })).toBe(
      'event:census:1900',
    );
  });

  it('parses anything unrecognisable safely to other', () => {
    expect(parseSubjectKey('')).toEqual({ kind: 'other' });
    expect(parseSubjectKey('bogus')).toEqual({ kind: 'other' });
    expect(parseSubjectKey('event:')).toEqual({ kind: 'other' });
    expect(parseSubjectKey('event:census:abc')).toEqual({
      kind: 'event',
      eventType: 'census',
      year: null,
    });
  });
});

describe('subjectLabel', () => {
  it('titles the singular kinds', () => {
    expect(subjectLabel('birth')).toBe('Birth');
    expect(subjectLabel('parents')).toBe('Parents');
  });

  it('titles a dated event with its year', () => {
    expect(subjectLabel('event:census:1900')).toBe('Census · 1900');
    expect(subjectLabel('event:residence')).toBe('Residence');
  });

  it('never throws on garbage', () => {
    expect(subjectLabel('???')).toBe('Other');
  });
});
