/**
 * Deep links into ancestry.com person pages. Ancestry GEDCOM exports carry
 * the tree's numeric id in the header (stored as trees.ancestry_tree_id)
 * and each person's Ancestry id as the INDI xref (I<digits>). Both must be
 * present — trees from FamilySearch or other software simply get no link.
 * On a device with the Ancestry app installed, the https URL
 * universal-links straight into the app.
 */
export interface ProviderLink {
  /** What the button says: the platform's own name. */
  label: string;
  url: string;
}

/**
 * The person's page on whichever platform this tree can actually reach:
 * Ancestry via the tree's numeric id + xref, or FamilySearch via the
 * person's _FSFTID (carried by RootsMagic and other FamilySearch-synced
 * exports, regardless of which program wrote the file). Null when no
 * working URL can be built — a reader whose tree never touched a platform
 * is never shown its button (2026-08-18: the static "Ancestry ›" confused
 * readers without Ancestry accounts).
 */
export function providerPersonLink(args: {
  ancestryTreeId: string | null;
  xref: string;
  familySearchId: string | null;
  /** Ancestry's own person id, overlaid onto a tree whose xrefs are not
      Ancestry's (a Family Tree Maker export) — wins over the xref. */
  ancestryPersonId?: string | null;
}): ProviderLink | null {
  const ancestry = ancestryPersonUrl(
    args.ancestryTreeId,
    args.ancestryPersonId ? `I${args.ancestryPersonId}` : args.xref,
  );
  if (ancestry) return { label: 'Ancestry', url: ancestry };
  if (args.familySearchId) {
    return {
      label: 'FamilySearch',
      url: `https://www.familysearch.org/tree/person/details/${encodeURIComponent(args.familySearchId)}`,
    };
  }
  return null;
}

/**
 * An Ancestry record page from a citation's _APID ("1,7602::12345" →
 * database 7602, record 12345). The only link many citations have once
 * the tree comes through Family Tree Maker, which drops the WWW links.
 */
export function ancestryRecordUrl(apid: string | null | undefined): string | null {
  const match = /^\s*\d+,(\d+)::(\d+)\s*$/.exec(apid ?? '');
  if (!match) return null;
  return `https://www.ancestry.com/discoveryui-content/view/${match[2]}:${match[1]}`;
}

/**
 * Archive.org's BookReader jumps to a specific scan via `/page/n{N}` appended
 * to the book's `/details/{id}` URL. GEDCOM citation `page` fields are
 * freeform ("p. 45", "pp. 45-46") — the first digit run is taken as the
 * target page. Returns the URL unchanged when it isn't an archive.org book
 * link, or when no page number can be read, so this is safe to call on any
 * citation URL.
 */
export function archiveOrgDeepLink(url: string, page: string | null | undefined): string {
  const details = /^(https?:\/\/archive\.org\/details\/[^/?#]+)\/?$/i.exec(url.trim());
  if (!details) return url;
  const pageNumber = /(\d+)/.exec(page ?? '');
  if (!pageNumber) return url;
  return `${details[1]}/page/n${pageNumber[1]}`;
}

// Valid person-page tab paths, verified 2026-07-24: /facts and /gallery
// respond (401 signed-out); /sources is a 404 — Sources is a panel on the
// facts page, not a routable tab.
export function ancestryPersonUrl(
  ancestryTreeId: string | null,
  xref: string,
  tab: 'facts' | 'gallery' = 'facts',
): string | null {
  const match = /^I(\d+)$/.exec(xref);
  if (!ancestryTreeId || !match) return null;
  return `https://www.ancestry.com/family-tree/person/tree/${ancestryTreeId}/person/${match[1]}/${tab}`;
}
