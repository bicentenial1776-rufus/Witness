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
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ShareSubject {
  id: string;
  tree_id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
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
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in to share');

  // Attribution: the sharer's first name, from the tree's home person.
  let sharerName: string | null = null;
  const { data: tree } = await supabase
    .from('trees')
    .select('home_person_id')
    .eq('id', subject.tree_id)
    .maybeSingle();
  if (tree?.home_person_id) {
    const { data: home } = await supabase
      .from('individuals')
      .select('full_name')
      .eq('id', tree.home_person_id)
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
