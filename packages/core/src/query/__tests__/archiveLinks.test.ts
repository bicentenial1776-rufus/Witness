import { describe, expect, it } from 'vitest';
import { archiveOrgDeepLink, citedPageNumber } from '../archiveLinks.js';

const BOOK = 'https://archive.org/details/vitalrecordsofsp00spencer';

// The page field Ancestry and Family Tree Maker write for Library of
// Congress book citations: the only digits are the publication year.
const LOC_METADATA =
  'Contributor: The Library of Congress; Publisher: Worcester, Mass.: F.p. Rice; Date: 1909; URL: https://archive.org/details/vitalrecordsofsp00spencer';

describe('citedPageNumber', () => {
  it('reads an explicitly marked page', () => {
    expect(citedPageNumber('p. 45')).toBe(45);
    expect(citedPageNumber('P.45')).toBe(45);
    expect(citedPageNumber('pp. 45-46')).toBe(45);
    expect(citedPageNumber('pp. 45–46')).toBe(45);
    expect(citedPageNumber('pg 7')).toBe(7);
    expect(citedPageNumber('page 12')).toBe(12);
    expect(citedPageNumber('Page: 12')).toBe(12);
    expect(citedPageNumber('Pages 12-13')).toBe(12);
    expect(citedPageNumber('Vol. 2, p. 310')).toBe(310);
  });

  it('accepts a field that is nothing but a number', () => {
    expect(citedPageNumber('45')).toBe(45);
    expect(citedPageNumber(' 145 ')).toBe(145);
  });

  it('does not mistake a year in source metadata for a page', () => {
    expect(citedPageNumber(LOC_METADATA)).toBeNull();
    expect(citedPageNumber('Date: 1905')).toBeNull();
    expect(citedPageNumber('Year: 1900; Census Place: Spencer, Worcester, Massachusetts')).toBeNull();
  });

  it('names no page for empty, absent or unmarked text', () => {
    expect(citedPageNumber(null)).toBeNull();
    expect(citedPageNumber(undefined)).toBeNull();
    expect(citedPageNumber('')).toBeNull();
    expect(citedPageNumber('Spencer births')).toBeNull();
    expect(citedPageNumber('p. 0')).toBeNull();
    expect(citedPageNumber('Ancestry Record 7602 #12345')).toBeNull();
  });
});

describe('archiveOrgDeepLink', () => {
  it('opens a book at its cited printed page', () => {
    expect(archiveOrgDeepLink(BOOK, 'p. 45')).toBe(`${BOOK}/page/45`);
    expect(archiveOrgDeepLink(`${BOOK}/`, 'pp. 45-46')).toBe(`${BOOK}/page/45`);
    expect(archiveOrgDeepLink(BOOK, '145')).toBe(`${BOOK}/page/145`);
    expect(archiveOrgDeepLink(` ${BOOK} `, 'page 12')).toBe(`${BOOK}/page/12`);
  });

  it('leaves the landing page alone when the field only carries a year', () => {
    expect(archiveOrgDeepLink(BOOK, LOC_METADATA)).toBe(BOOK);
  });

  it('leaves the URL alone when no page is named', () => {
    expect(archiveOrgDeepLink(BOOK, null)).toBe(BOOK);
    expect(archiveOrgDeepLink(BOOK, '')).toBe(BOOK);
    expect(archiveOrgDeepLink(BOOK, 'Spencer births')).toBe(BOOK);
  });

  it('never rewrites a link that is not a bare archive.org book page', () => {
    const grave = 'https://www.findagrave.com/memorial/123/john-doe';
    expect(archiveOrgDeepLink(grave, 'p. 45')).toBe(grave);
    const ancestry = 'https://www.ancestry.com/discoveryui-content/view/12345:7602';
    expect(archiveOrgDeepLink(ancestry, 'p. 45')).toBe(ancestry);
    const search = `${BOOK}?q=Howe`;
    expect(archiveOrgDeepLink(search, 'p. 45')).toBe(search);
    const stream = 'https://archive.org/stream/historyofdurhamm00stac#page/253/mode/1up';
    expect(archiveOrgDeepLink(stream, 'p. 45')).toBe(stream);
    const alreadyPaged = `${BOOK}/page/44/mode/2up`;
    expect(archiveOrgDeepLink(alreadyPaged, 'p. 45')).toBe(alreadyPaged);
  });
});
