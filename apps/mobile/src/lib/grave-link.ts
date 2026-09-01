import { supabase } from '@/lib/supabase';

/**
 * Find a Grave deep-link & confirm (Rufus's spec, 2026-08-24). Witness
 * never fetches or parses findagrave.com — no API exists and the ToS
 * forbids scraping. We build a search URL from the record, the user
 * browses in their own in-app browser session, and we store only the
 * memorial URL they personally confirm.
 */

export interface GraveConfirmation {
  url: string;
  confirmed_at: string;
}

/**
 * Pulls a clean memorial URL out of whatever the user pasted. Find a
 * Grave's share sheet offers "Copy record details", which puts the WHOLE
 * record — dates, plot, family, citation — on the clipboard (Rufus hit
 * this on day one); the memorial link is in there, so take it. Returns
 * null when no memorial URL is present at all.
 */
export function extractFindAGraveUrl(text: string): string | null {
  const match = text.match(/https?:\/\/(?:[\w.-]*\.)?findagrave\.com\/memorial\/[^\s"'<>)\]]+/i);
  if (!match) return null;
  // Trailing punctuation from prose ("…asa-k-howe: accessed…") isn't URL.
  return match[0].replace(/[.,:;!?]+$/, '');
}

/**
 * A Find a Grave search URL from whatever the record has. Missing fields
 * are omitted, never blocking: a lone surname still searches.
 */
export function buildFindAGraveSearchUrl(input: {
  fullName: string;
  birthYear: number | null;
  deathYear: number | null;
  location?: string | null;
}): string {
  // Generational suffixes aren't surnames — "Ariel Cooke Sr" must search
  // lastname=Cooke, not lastname=Sr.
  const SUFFIX = /^(sr|jr|i{1,3}|iv|v|esq)\.?,?$/i;
  const tokens = input.fullName.trim().split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && SUFFIX.test(tokens[tokens.length - 1])) tokens.pop();
  const lastname = tokens.length ? tokens[tokens.length - 1] : '';
  const firstname = tokens.slice(0, -1).join(' ');
  const params = new URLSearchParams();
  if (firstname) params.set('firstname', firstname);
  if (lastname) params.set('lastname', lastname);
  if (input.birthYear) params.set('birthyear', String(input.birthYear));
  if (input.deathYear) params.set('deathyear', String(input.deathYear));
  if (input.location) params.set('location', input.location);
  return `https://www.findagrave.com/memorial/search?${params.toString()}`;
}

export async function fetchGraveConfirmation(
  individualId: string,
): Promise<GraveConfirmation | null> {
  // The unique key is (user_id, individual_id) — per user, not per
  // person. On a family-shared tree the owner's and a member's rows can
  // coexist for one individual, and an unscoped maybeSingle() would
  // error on the pair. This reads "MY confirmation", as it always has.
  const { data: auth } = await supabase.auth.getSession();
  const { data } = await supabase
    .from('grave_confirmations')
    .select('url, confirmed_at')
    .eq('individual_id', individualId)
    .eq('user_id', auth.session?.user.id ?? '')
    .maybeSingle();
  return data ?? null;
}

/** Saves (or overwrites) the user-confirmed memorial URL for one person. */
export async function saveGraveConfirmation(
  individualId: string,
  treeId: string,
  url: string,
): Promise<GraveConfirmation> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');
  const confirmed_at = new Date().toISOString();
  const { error } = await supabase.from('grave_confirmations').upsert(
    {
      individual_id: individualId,
      tree_id: treeId,
      user_id: userData.user.id,
      url,
      confirmed_at,
    },
    { onConflict: 'user_id,individual_id' },
  );
  if (error) throw new Error(error.message);
  return { url, confirmed_at };
}
