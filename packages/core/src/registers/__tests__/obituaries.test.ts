import { describe, expect, it } from 'vitest';

import {
  findObituaryWindow,
  paperName,
  relativesAgainstTree,
  renderObituaryCandidate,
  type ObituaryExtraction,
} from '../obituaries.js';

const page =
  'CITY NEWS.\nThe Howe & Co. dry goods store announces its spring line of ginghams.\n' +
  'PERSONAL.\n' +
  'Ezekiel Howe, one of the oldest residents of Sudbury, died at his home on Concord road ' +
  'Tuesday, aged 81 years. He was born in Sudbury in 1816 and followed farming all his life. ' +
  'He is survived by his wife, Mary, and by three sons, John, Henry and Charles, and one daughter, ' +
  'Mrs. Sarah Haynes of Worcester. The funeral will be held Friday from the Congregational church; ' +
  'interment at Mount Wadsworth cemetery.\n' +
  'The weather continues cold.';

describe('findObituaryWindow', () => {
  it('finds the surname beside a death cue and prefers the occurrence with the given name', () => {
    const w = findObituaryWindow(page, 'Ezekiel Howe');
    expect(w).not.toBeNull();
    expect(w!.nameForm).toBe('Ezekiel Howe');
    expect(w!.excerpt).toContain('survived by his wife');
    expect(w!.cueCount).toBeGreaterThanOrEqual(3);
  });

  it('is null when the surname appears only in an advertisement', () => {
    expect(findObituaryWindow('The Howe & Co. store has ginghams. Prices low.', 'Ezekiel Howe')).toBeNull();
  });

  it('is null when the surname is absent or too short to trust', () => {
    expect(findObituaryWindow(page, 'Ezekiel Field')).toBeNull();
    expect(findObituaryWindow(page, 'Ann Ho')).toBeNull();
  });
});

const extracted: ObituaryExtraction = {
  about_person: true,
  kind: 'obituary',
  confidence: 'strong',
  deceased_name: 'Ezekiel Howe',
  death_date: 'Tuesday',
  age_at_death: '81',
  residence: 'Sudbury',
  birthplace: 'Sudbury',
  occupation: 'farmer',
  spouse: 'Mary',
  parents: [],
  children: ['John', 'Henry', 'Charles', 'Mrs. Sarah Haynes'],
  siblings: [],
  others: [],
  burial_place: 'Mount Wadsworth cemetery',
  quote: 'He is survived by his wife, Mary, and by three sons, John, Henry and Charles',
};

describe('relativesAgainstTree', () => {
  it('corroborates known relatives and turns the rest into leads', () => {
    const out = relativesAgainstTree(extracted, {
      spouses: ['Mary Rice Howe'],
      children: ['John Howe', 'Henry Howe'],
      parents: [],
      siblings: [],
    });
    expect(out.agreements).toBe(3);
    expect(out.leads).toEqual(['Charles', 'Mrs. Sarah Haynes']);
    expect(out.reasons).toContain('names a spouse Mary — Mary Rice Howe in your tree');
    expect(out.reasons).toContain('names a child Charles, not among the children in your tree — a lead');
  });
});

describe('renderObituaryCandidate', () => {
  const hit = {
    paperTitle: 'worcester daily spy (worcester [mass.]) 1850-1888',
    date: '1897-02-19',
    pageUrl: 'http://www.loc.gov/resource/sn83021205/1897-02-19/ed-1/?sp=2',
    imageUrl: null,
  };
  const window = findObituaryWindow(page, 'Ezekiel Howe')!;

  it('is strong when the model is sure, the year agrees, and the tree corroborates', () => {
    const c = renderObituaryCandidate({ fullName: 'Ezekiel Howe', deathYear: 1897 }, hit, window, extracted, {
      spouses: ['Mary Rice'],
      children: [],
      parents: [],
      siblings: [],
    });
    expect(c).not.toBeNull();
    expect(c!.confidence).toBe('strong');
    expect(c!.recordName).toBe('Worcester Daily Spy (Worcester, Mass.), 1897-02-19');
    expect(c!.reasons[0]).toBe('printed 1897, the year your tree records the death');
    expect(c!.recordSummary).toContain('Obituary, Tuesday');
    expect(c!.recordSummary).toContain('Names spouse Mary; children John, Henry, Charles, Mrs. Sarah Haynes.');
    expect(c!.sourceCitation).toContain('page 2');
    expect(c!.savedPayload['leads']).toEqual(['John', 'Henry', 'Charles', 'Mrs. Sarah Haynes']);
    expect(c!.savedPayload['event_year']).toBe(1897);
  });

  it('is probable when the year is off and nothing in the tree corroborates', () => {
    const c = renderObituaryCandidate({ fullName: 'Ezekiel Howe', deathYear: 1890 }, hit, window, extracted, {
      spouses: [],
      children: [],
      parents: [],
      siblings: [],
    });
    expect(c!.confidence).toBe('probable');
  });

  it('is silent when the model says the passage is not about the person, or is unsure', () => {
    const empty = { spouses: [], children: [], parents: [], siblings: [] };
    expect(renderObituaryCandidate({ fullName: 'Ezekiel Howe', deathYear: 1897 }, hit, window, { ...extracted, about_person: false }, empty)).toBeNull();
    expect(renderObituaryCandidate({ fullName: 'Ezekiel Howe', deathYear: 1897 }, hit, window, { ...extracted, confidence: 'weak' }, empty)).toBeNull();
  });
});

describe('paperName', () => {
  it('re-cases and drops the date range', () => {
    expect(paperName('springfield weekly republican (springfield, mass.) 1851-1946')).toBe(
      'Springfield Weekly Republican (Springfield, Mass.)',
    );
  });
});
