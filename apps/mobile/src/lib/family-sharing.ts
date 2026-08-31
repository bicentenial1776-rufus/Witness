import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes } from 'expo-crypto';

import { supabase } from '@/lib/supabase';

/**
 * Family sharing, the client half (docs/family-sharing-design-brief.md).
 * Invites are 32-hex tokens the owner creates directly (RLS: owners
 * manage their own invites); everything that moves a seat — accepting,
 * removing, leaving — goes through the edge functions, because a seat is
 * a membership row AND a RevenueCat entitlement and the two must never
 * move apart.
 */

export const SEAT_LIMIT = 4; // companions; the plan is 5 accounts total

export interface TreeMemberRow {
  user_id: string;
  display_name: string | null;
  home_person_id: string | null;
  joined_at: string;
}

export interface InviteRow {
  token: string;
  tree_id: string;
  created_at: string;
  expires_at: string;
}

function token(): string {
  // expo-crypto, not global crypto — Hermes has none (share-links lesson).
  const bytes = getRandomBytes(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The roster the owner sees for one tree. */
export async function fetchMembers(treeId: string): Promise<TreeMemberRow[]> {
  const { data, error } = await supabase
    .from('tree_members')
    .select('user_id, display_name, home_person_id, joined_at')
    .eq('tree_id', treeId)
    .order('joined_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Open invites across the owner's trees (unaccepted, unrevoked, unexpired). */
export async function fetchPendingInvites(): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('token, tree_id, created_at, expires_at')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Create an invite and return its public URL, ready for the share sheet. */
export async function createInvite(treeId: string): Promise<{ token: string; url: string }> {
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new Error('Not signed in');
  const t = token();
  const { error } = await supabase
    .from('invites')
    .insert({ token: t, tree_id: treeId, user_id: userId });
  if (error) throw new Error(error.message);
  return { token: t, url: inviteUrl(t) };
}

/** /j/ is the unfurl worker (api/join.js), which bounces humans into the
    SPA's /join/{token} — the share-links /s/ → /shared/ mechanic. */
export function inviteUrl(t: string): string {
  return `https://app.witnesslives.com/j/${t}`;
}

export async function revokeInvite(t: string): Promise<void> {
  const { error } = await supabase
    .from('invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', t);
  if (error) throw new Error(error.message);
}

export interface InvitePeek {
  treeName: string;
  inviterName: string;
  individualCount: number;
}

/** Pre-auth look at an invite — who, into what, still good? Null when spent,
    revoked, or expired. */
export async function peekInvite(t: string): Promise<InvitePeek | null> {
  const { data, error } = await supabase.rpc('get_invite', { p_token: t });
  if (error) throw new Error(error.message);
  return (data as InvitePeek | null) ?? null;
}

export interface AcceptResult {
  ok: boolean;
  treeId: string;
  treeName: string;
  alreadyMember?: boolean;
}

export async function acceptInvite(t: string, displayName?: string): Promise<AcceptResult> {
  const { data, error } = await supabase.functions.invoke('accept-invite', {
    body: { token: t, displayName },
  });
  if (error) {
    // The function writes its reason into the response body; surface it
    // instead of the generic "non-2xx" wrapper.
    const context = (error as { context?: Response }).context;
    if (context) {
      const body = await context.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message);
  }
  return data as AcceptResult;
}

/** Owner removes a member; a member omits memberUserId to leave. */
export async function removeMember(treeId: string, memberUserId?: string): Promise<void> {
  const { error } = await supabase.functions.invoke('remove-member', {
    body: { treeId, memberUserId },
  });
  if (error) throw new Error(error.message);
}

/** The caller's own seat on one tree, or null when they aren't a member. */
export async function fetchMyMembership(treeId: string): Promise<TreeMemberRow | null> {
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) return null;
  const { data } = await supabase
    .from('tree_members')
    .select('user_id, display_name, home_person_id, joined_at')
    .eq('tree_id', treeId)
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

// ---------------------------------------------------------------------
// The pending-invite stash: someone lands on /join/{token} signed out,
// walks through sign-up (or sign-in), and must arrive back at the invite
// without carrying the token through the auth screens by hand.

const PENDING_INVITE_KEY = 'witness.pendingInvite';

export async function stashPendingInvite(t: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_INVITE_KEY, t);
  } catch {}
}

export async function consumePendingInvite(): Promise<string | null> {
  try {
    const t = await AsyncStorage.getItem(PENDING_INVITE_KEY);
    if (t) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
    return t && /^[0-9a-f]{32}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}
