import { getRandomBytes } from 'expo-crypto';

import { supabase } from '@/lib/supabase';

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * Public share links: a snapshot of one ancestor's card, tokenized,
 * revocable, expiring in 90 days (migration 20260724220000). The payload
 * is composed here at share time — the public page renders only what the
 * sharer saw, never live tree data, and living persons never get here
 * (the share affordance is hidden for them).
 */

export interface SharePayload {
  fullName: string;
  years: string;
  lines: string[];
}

function token(): string {
  // expo-crypto, not global crypto: Hermes has no global `crypto`, so the
  // web API silently killed sharing on iOS (same lesson as the importer's
  // id generator).
  const bytes = getRandomBytes(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ShareSubject {
  id: string;
  tree_id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

/**
 * Create a share link for an ancestor and return its public URL.
 * `lines` are the story hooks the card shows (event lines, a lived-through
 * tag — whatever the caller curates).
 */
export async function createAncestorShareLink(
  subject: ShareSubject,
  lines: string[],
): Promise<string> {
  // The carried rule, enforced where the row is made — not only in the
  // JSX that hides the button: living people are never shareable.
  if (subject.living) throw new Error('Living people are never shared');
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in to share');

  // Attribution: the sharer's first name — the tree's home person for the
  // owner; for a family companion sharing from a shared tree, THEIR seat
  // (their own home person, else the name they joined under), never the
  // owner's name on a card the owner didn't send.
  let sharerName: string | null = null;
  const { data: tree } = await supabase
    .from('trees')
    .select('user_id, home_person_id')
    .eq('id', subject.tree_id)
    .maybeSingle();
  let namePersonId = tree?.home_person_id ?? null;
  if (tree && tree.user_id !== auth.user.id) {
    const { data: membership } = await supabase
      .from('tree_members')
      .select('home_person_id, display_name')
      .eq('tree_id', subject.tree_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (membership?.home_person_id) namePersonId = membership.home_person_id;
    else if (membership?.display_name) {
      namePersonId = null;
      sharerName = membership.display_name.split(' ')[0] ?? null;
    }
  }
  if (namePersonId && !sharerName) {
    const { data: home } = await supabase
      .from('individuals')
      .select('full_name')
      .eq('id', namePersonId)
      .maybeSingle();
    sharerName = home?.full_name?.split(' ')[0] ?? null;
  }

  const payload: SharePayload = {
    fullName: subject.full_name,
    years: `${subject.birth_year ?? '?'}–${subject.death_year ?? '?'}`,
    lines: lines.filter(Boolean).slice(0, 4),
  };

  const shareToken = token();
  const { error } = await supabase.from('share_links').insert({
    token: shareToken,
    tree_id: subject.tree_id,
    user_id: auth.user.id,
    individual_id: subject.id,
    kind: 'ancestor',
    sharer_name: sharerName,
    payload: payload as unknown as Json,
  });
  if (error) throw new Error(`Creating the share link failed: ${error.message}`);

  return `https://app.witnesslives.com/s/${shareToken}`;
}
