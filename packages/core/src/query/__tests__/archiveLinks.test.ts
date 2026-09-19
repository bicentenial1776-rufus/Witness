import { describe, expect, it } from 'vitest';
import {
  archiveOrgBookLink,
  archiveOrgDeepLink,
  bookSearchTerm,
  citedPageNumber,
} from '../archiveLinks.js';

const BOOK = 'https://archive.org/details/vitalrecordsofsp00spencer';
const LAROQUE = 'https://archive.org/details/reportconcerning21publ';

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

describe('bookSearchTerm', () => {
  it('searches for the surname', () => {
    expect(bookSearchTerm('Jean Doiron')).toBe('Doiron');
    expect(bookSearchTerm('Rufus Scott Howe')).toBe('Howe');
    expect(bookSearchTerm('Jean /Doiron/')).toBe('Doiron');
  });

  it('searches a single-word name as it stands', () => {
    expect(bookSearchTerm('Baptiste')).toBe('Baptiste');
  });

  it('has nothing to search for without a name', () => {
    expect(bookSearchTerm(null)).toBeNull();
    expect(bookSearchTerm(undefined)).toBeNull();
    expect(bookSearchTerm('   ')).toBeNull();
  });
});

describe('archiveOrgBookLink', () => {
  it('opens a book at its cited printed page', () => {
    expect(archiveOrgBookLink(BOOK, { page: 'p. 45' })).toBe(`${BOOK}/page/45`);
    expect(archiveOrgBookLink(`${BOOK}/`, { page: 'pp. 45-46' })).toBe(`${BOOK}/page/45`);
    expect(archiveOrgBookLink(BOOK, { page: '145' })).toBe(`${BOOK}/page/145`);
    expect(archiveOrgBookLink(` ${BOOK} `, { page: 'page 12' })).toBe(`${BOOK}/page/12`);
  });

  it('prefers the cited page over a name search', () => {
    expect(archiveOrgBookLink(BOOK, { page: 'p. 45', name: 'Rufus Howe' })).toBe(`${BOOK}/page/45`);
  });

  it('searches the book for the surname when no page is cited', () => {
    expect(archiveOrgBookLink(LAROQUE, { name: 'Jean Doiron' })).toBe(`${LAROQUE}?q=Doiron`);
    expect(archiveOrgBookLink(BOOK, { page: LOC_METADATA, name: 'Rufus Scott Howe' })).toBe(`${BOOK}?q=Howe`);
    expect(archiveOrgBookLink(BOOK, { page: null, name: 'Rufus Howe' })).toBe(`${BOOK}?q=Howe`);
  });

  it('encodes a surname the URL cannot carry as written', () => {
    expect(archiveOrgBookLink(LAROQUE, { name: "Marie d'Entremont" })).toBe(`${LAROQUE}?q=d'Entremont`);
    expect(archiveOrgBookLink(LAROQUE, { name: 'Anne Le Blanc' })).toBe(`${LAROQUE}?q=Blanc`);
    expect(archiveOrgBookLink(LAROQUE, { name: 'Pierre Thériault' })).toBe(
      `${LAROQUE}?q=${encodeURIComponent('Thériault')}`,
    );
  });

  it('leaves the landing page alone with neither a page nor a name', () => {
    expect(archiveOrgBookLink(BOOK, { page: LOC_METADATA })).toBe(BOOK);
    expect(archiveOrgBookLink(BOOK, { page: null, name: null })).toBe(BOOK);
    expect(archiveOrgBookLink(BOOK, {})).toBe(BOOK);
  });

  it('never rewrites a link that is not a bare archive.org book page', () => {
    const grave = 'https://www.findagrave.com/memorial/123/john-doe';
    expect(archiveOrgBookLink(grave, { page: 'p. 45', name: 'John Doe' })).toBe(grave);
    const ancestry = 'https://www.ancestry.com/discoveryui-content/view/12345:7602';
    expect(archiveOrgBookLink(ancestry, { name: 'John Doe' })).toBe(ancestry);
    const search = `${BOOK}?q=Howe`;
    expect(archiveOrgBookLink(search, { name: 'Rufus Howe' })).toBe(search);
    const stream = 'https://archive.org/stream/historyofdurhamm00stac#page/253/mode/1up';
    expect(archiveOrgBookLink(stream, { page: 'p. 45' })).toBe(stream);
    const alreadyPaged = `${BOOK}/page/44/mode/2up`;
    expect(archiveOrgBookLink(alreadyPaged, { page: 'p. 45' })).toBe(alreadyPaged);
    const acadianOrg = 'https://www.acadian.org/history/acadian-prisoners-grand-pre/';
    expect(archiveOrgBookLink(acadianOrg, { name: 'Pierre Alin' })).toBe(acadianOrg);
  });
});

describe('archiveOrgDeepLink', () => {
  it('is the page-only form', () => {
    expect(archiveOrgDeepLink(BOOK, 'p. 45')).toBe(`${BOOK}/page/45`);
    expect(archiveOrgDeepLink(BOOK, LOC_METADATA)).toBe(BOOK);
    expect(archiveOrgDeepLink(BOOK, null)).toBe(BOOK);
  });
});
