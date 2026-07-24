/**
 * Deep links into ancestry.com person pages. Ancestry GEDCOM exports carry
 * the tree's numeric id in the header (stored as trees.ancestry_tree_id)
 * and each person's Ancestry id as the INDI xref (I<digits>). Both must be
 * present — trees from FamilySearch or other software simply get no link.
 * On a device with the Ancestry app installed, the https URL
 * universal-links straight into the app.
 */
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
