// Removing a family seat — the owner removes a member, or a member
// leaves. The mirror of accept-invite and the reason client deletes on
// tree_members are revoked: the membership row and the RevenueCat seat
// entitlement must fall together (Rufus 2026-08-30: seat + access
// revoked, own data kept — the member's account and any tree they
// imported themselves survive, behind the paywall).
//
// The entitlement is revoked only when the seat created it (rc_granted)
// and the member holds no other granted seat. A failed revoke does not
// resurrect the row: access ends now, the yearly grant expiry is the
// backstop, and the loud log is the signal to look.

import { authenticate, corsHeaders, json } from '../_shared/enrich.ts';
import { revokeSeatEntitlement } from '../_shared/family.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  let treeId: unknown, memberUserId: unknown;
  try {
    ({ treeId, memberUserId } = await req.json());
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  if (typeof treeId !== 'string') return json(400, { error: 'treeId required' });
  const targetId = typeof memberUserId === 'string' ? memberUserId : ctx.userId;

  // Leaving is any member's right; removing someone else is the owner's.
  if (targetId !== ctx.userId) {
    const { data: tree } = await ctx.admin
      .from('trees')
      .select('id')
      .eq('id', treeId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (!tree) return json(403, { error: 'Only the tree owner removes members.' });
  }

  const { data: member } = await ctx.admin
    .from('tree_members')
    .select('tree_id, user_id, rc_granted')
    .eq('tree_id', treeId)
    .eq('user_id', targetId)
    .maybeSingle();
  if (!member) return json(404, { error: 'No such member.' });

  const { error: deleteError } = await ctx.admin
    .from('tree_members')
    .delete()
    .eq('tree_id', treeId)
    .eq('user_id', targetId);
  if (deleteError) return json(500, { error: deleteError.message });

  let revoked = false;
  if (member.rc_granted) {
    const { data: remaining } = await ctx.admin
      .from('tree_members')
      .select('tree_id')
      .eq('user_id', targetId)
      .eq('rc_granted', true)
      .limit(1);
    if (!remaining?.length) {
      try {
        await revokeSeatEntitlement(targetId);
        revoked = true;
      } catch (error) {
        console.error('remove-member: revoke failed — grant expires on its own', error);
      }
    }
  }

  return json(200, { ok: true, revoked });
});
