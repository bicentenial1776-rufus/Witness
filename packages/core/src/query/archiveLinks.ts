/**
 * Archive.org's BookReader opens a scanned book at a given page when the
 * book's `/details/{id}` URL carries `/page/{label}`, where the label is
 * the number printed on the page (the reader maps it through the scan's
 * page labels). `/page/n{N}` would be the raw leaf index, which sits a
 * front-matter's worth off the printed number, so it is not used here.
 *
 * GEDCOM citation `page` fields are freeform, and only some of them name
 * a page. Ancestry and Family Tree Maker write the source's own metadata
 * into the field for a whole class of book citations — "Contributor: The
 * Library of Congress; Publisher: …; Date: 1909; URL: …" — where the only
 * digits are a year. So a page number is read only from an explicit page
 * marker ("p. 45", "pp. 45–46", "page 12", "Page: 12") or from a field
 * that is nothing but a number. Anything else leaves the URL alone.
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
 * An archive.org book link opened at the cited page. Returns the URL
 * unchanged when it is not a bare `/details/{id}` archive.org link or when
 * the page field names no page, so it is safe to call on any citation URL.
 */
export function archiveOrgDeepLink(url: string, page: string | null | undefined): string {
  const details = ARCHIVE_DETAILS.exec(url.trim());
  if (!details) return url;
  const number = citedPageNumber(page);
  if (number === null) return url;
  return `${details[1]}/page/${number}`;
}
