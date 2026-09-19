import { splitName } from '../history/passengers.js';

/**
 * Archive.org's BookReader can open a scanned book two ways beyond its
 * landing page, both off the book's `/details/{id}` URL:
 *
 * - `/page/{label}` opens at the page whose printed number is `label` (the
 *   reader maps it through the scan's page labels; `/page/n{N}` would be
 *   the raw leaf index, a front-matter's worth off, so it is not used).
 * - `?q={text}` opens the reader searching the book's OCR text for `text`:
 *   it reports how many times the words occur, jumps to the first hit and
 *   lets the reader step through the rest. The Crossing card has opened
 *   Banks and Hotten this way since 2026-09-16.
 *
 * Which one a citation earns depends on what it carries. GEDCOM `page`
 * fields are freeform and only some name a page: Ancestry and Family Tree
 * Maker write the source's own metadata into the field for a whole class
 * of book citations — "Contributor: The Library of Congress; Publisher: …;
 * Date: 1909; URL: …" — where the only digits are a year. So a page number
 * is read only from an explicit marker ("p. 45", "pp. 45–46", "page 12",
 * "Page: 12") or from a field that is nothing but a number. A citation with
 * no cited page falls back to searching the book for the person's surname,
 * which is how a reader actually checks a vital-records volume or a census
 * translation: every entry for the family, in order.
 */
const ARCHIVE_DETAILS = /^(https?:\/\/archive\.org\/details\/[^/?#]+)\/?$/i;
const MARKED_PAGE = /\b(?:pp?|pg|pages?)\s*[.:]?\s*(\d{1,4})\b/i;
const BARE_PAGE = /^\s*(\d{1,4})\s*$/;

/**
 * The page number a citation's `page` field names, or null when it names
 * none. A year inside a metadata string is not a page.
 */
export function citedPageNumber(page: string | null | undefined): number | null {
  const text = page ?? '';
  const match = BARE_PAGE.exec(text) ?? MARKED_PAGE.exec(text);
  if (!match) return null;
  const number = Number(match[1]);
  return number > 0 ? number : null;
}

/**
 * The word to search a book for on a person's behalf: the surname, which
 * finds every entry for the family. A single-word name is searched as is.
 */
export function bookSearchTerm(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return null;
  const { surname } = splitName(trimmed);
  return (surname || trimmed).trim() || null;
}

/**
 * An archive.org book link opened where a reader can check the claim: at
 * the cited printed page when the citation names one, else searching the
 * book for the person's surname. Returns the URL unchanged when it is not
 * a bare `/details/{id}` archive.org link, or when neither a page nor a
 * name is available, so it is safe to call on any source URL.
 */
export function archiveOrgBookLink(
  url: string,
  where: { page?: string | null; name?: string | null },
): string {
  const details = ARCHIVE_DETAILS.exec(url.trim());
  if (!details) return url;
  const number = citedPageNumber(where.page);
  if (number !== null) return `${details[1]}/page/${number}`;
  const term = bookSearchTerm(where.name);
  if (term) return `${details[1]}?q=${encodeURIComponent(term)}`;
  return url;
}

/** The page-only form of archiveOrgBookLink, for callers with no name. */
export function archiveOrgDeepLink(url: string, page: string | null | undefined): string {
  return archiveOrgBookLink(url, { page });
}
