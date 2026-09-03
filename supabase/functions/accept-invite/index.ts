// Accepting a family invite — the one place a seat comes into being.
// The membership row and the RevenueCat entitlement must move together,
// which is why the authenticated role cannot insert into tree_members at
// all: this function (service role) does the row and the grant as one
// operation, deleting the row if the grant half fails.
//
// Order of checks: invite validity → not-your-own → idempotent re-accept
// → seat count → owner's plan → member's existing entitlement → insert →
// grant → stamp the invite. Reached through the gateway's default JWT
// check: the caller IS the invitee.

import { authenticate, corsHeaders, json } from '../_shared/enrich.ts';
import { SEAT_LIMIT, getEntitlement, grantSeatEntitlement, ownerUnlocksSeats } from '../_shared/family.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  let token: unknown, displayName: unknown;
  try {
    ({ token, displayName } = await req.json());
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) {
    return json(400, { error: 'Invalid invite token' });
  }
  const name =
    typeof displayName === 'string' && displayName.trim() ? displayName.trim().slice(0, 80) : null;

  const { data: invite, error: inviteError } = await ctx.admin
    .from('invites')
    .select('token, tree_id, user_id, expires_at, accepted_at, revoked_at, invited_name')
    .eq('token', token)
    .maybeSingle();
  if (inviteError) return json(500, { error: inviteError.message });
  if (!invite || invite.revoked_at || Date.parse(invite.expires_at) <= Date.now()) {
    return json(404, { error: 'This invite is no longer valid.', code: 'invalid_invite' });
  }

  const ownerId = invite.user_id;
  if (ownerId === ctx.userId) {
    return json(400, { error: 'This is your own invite.', code: 'own_invite' });
  }

  const { data: tree } = await ctx.admin
    .from('trees')
    .select('id, name')
    .eq('id', invite.tree_id)
    .maybeSingle();
  if (!tree) return json(404, { error: 'This invite is no longer valid.', code: 'invalid_invite' });

  // Re-accepting an invite you already hold a seat for is success, not
  // an error — the /join page can't know you've been here before.
  const { data: existing } = await ctx.admin
    .from('tree_members')
    .select('tree_id')
    .eq('tree_id', invite.tree_id)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (existing) {
    return json(200, { ok: true, treeId: tree.id, treeName: tree.name, alreadyMember: true });
  }

  // A single-use token: someone else already spent this one.
  if (invite.accepted_at) {
    return json(404, { error: 'This invite is no longer valid.', code: 'invalid_invite' });
  }

  // Seats are per-plan, not per-tree: distinct people across ALL the
  // owner's trees.
  const { data: ownerTrees } = await ctx.admin.from('trees').select('id').eq('user_id', ownerId);
  const treeIds = (ownerTrees ?? []).map((t) => t.id);
  const { data: seatRows } = await ctx.admin
    .from('tree_members')
    .select('user_id')
    .in('tree_id', treeIds.length ? treeIds : [invite.tree_id]);
  const seatHolders = new Set((seatRows ?? []).map((r) => r.user_id));
  if (!seatHolders.has(ctx.userId) && seatHolders.size >= SEAT_LIMIT) {
    return json(403, { error: 'This family plan has no seats left.', code: 'seats_full' });
  }

  // The owner's plan must unlock seats. Unknown (RevenueCat outage)
  // fails open with a loud log — the house posture: a billing-service
  // blip must never break the feature; a definitive lapse must.
  const ownerPlan = await ownerUnlocksSeats(ownerId);
  if (!ownerPlan.qualifies && !ownerPlan.unknown) {
    return json(403, {
      error: 'The inviter needs an active family plan to add seats.',
      code: 'no_family_plan',
    });
  }
  if (ownerPlan.unknown) console.error('accept-invite: owner entitlement unknown — proceeding');

  // Someone already entitled on their own — a comp, or their own paid
  // subscription — takes the seat without a grant, and removal will
  // never touch what the seat didn't create. A store TRIAL is the
  // exception: they only started it because the paywall gave no other
  // way in, so the seat's grant stacks on top — cancel the trial and
  // the seat still carries them, instead of the trial converting into
  // a bill for what should be a free seat.
  const memberState = await getEntitlement(ctx.userId);
  const trialCovered = memberState.active && memberState.periodType === 'trial';
  const needsGrant = !memberState.active || trialCovered;

  // Claim the token ATOMICALLY before seating: two people accepting the
  // same forwarded link concurrently both read accepted_at = null, and
  // without this gate a single-use invite would spend two seats and two
  // grants (release-gate review, 2026-09-03). Exactly one update matches;
  // the loser gets invalid_invite. Failure paths below un-claim so a
  // botched grant doesn't burn the invitation.
  const { data: claimed } = await ctx.admin
    .from('invites')
    .update({ accepted_by: ctx.userId, accepted_at: new Date().toISOString() })
    .eq('token', token)
    .is('accepted_at', null)
    .select('token');
  if (!claimed || claimed.length === 0) {
    return json(404, { error: 'This invite is no longer valid.', code: 'invalid_invite' });
  }
  const unclaim = () =>
    ctx.admin
      .from('invites')
      .update({ accepted_by: null, accepted_at: null })
      .eq('token', token)
      .then(() => undefined, () => undefined);

  const { error: insertError } = await ctx.admin.from('tree_members').insert({
    tree_id: invite.tree_id,
    user_id: ctx.userId,
    // The join flow sends no name — the invitation already knows who it
    // was for, so the seat inherits it (Rufus, 2026-09-02: an accepted
    // member showed as "A family member" while her email sat on the
    // spent invite).
    display_name: name ?? invite.invited_name ?? null,
    rc_granted: needsGrant,
    invited_by: ownerId,
  });
  if (insertError) {
    await unclaim();
    return json(500, { error: insertError.message });
  }

  if (needsGrant) {
    try {
      await grantSeatEntitlement(ctx.userId);
    } catch (error) {
      // The row and the grant move together: no entitlement, no seat.
      await ctx.admin
        .from('tree_members')
        .delete()
        .eq('tree_id', invite.tree_id)
        .eq('user_id', ctx.userId);
      await unclaim();
      console.error('accept-invite: grant failed, seat rolled back', error);
      return json(502, { error: 'Could not activate the seat. Try again shortly.' });
    }
  }

  return json(200, { ok: true, treeId: tree.id, treeName: tree.name, granted: needsGrant, trialCovered });
});
