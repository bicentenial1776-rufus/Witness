// The seat reconciliation worker (daily, pg_cron → x-cron-secret gate).
// Promotional entitlements don't lapse when the plan that justified them
// does — this worker is the price of the promotional-seat simplification
// (docs/family-sharing-design-brief.md §4). Two duties:
//
//  1. LAPSED plan → revoke the seats it granted and delete its
//     membership rows (Rufus 2026-08-30: no grace period — RevenueCat's
//     own billing-retry window, during which the entitlement stays
//     active, IS the grace).
//  2. ACTIVE plan → refresh any yearly seat grant inside its last 30
//     days, so seats never expire out from under a paying family.
//
// Posture on uncertainty: an UNKNOWN entitlement (RevenueCat outage)
// does nothing — a family is never dissolved on a blip; a definitive
// lapse or 404 acts. Revokes respect seats held through OTHER owners,
// and never touch entitlements a seat didn't create (rc_granted only —
// comps and self-subscribers pass through untouched).

import { requireCronSecret } from '../_shared/cron.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  getEntitlement,
  grantSeatEntitlement,
  ownerUnlocksSeats,
  revokeSeatEntitlement,
} from '../_shared/family.ts';

const REFRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  const gate = requireCronSecret(req);
  if (gate) return gate;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: members, error } = await admin
    .from('tree_members')
    .select('tree_id, user_id, rc_granted, trees!inner(user_id)');
  if (error) return new Response(error.message, { status: 500 });

  type Row = { tree_id: string; user_id: string; rc_granted: boolean; trees: { user_id: string } };
  const rows = (members ?? []) as unknown as Row[];

  const byOwner = new Map<string, Row[]>();
  for (const row of rows) {
    const owner = row.trees.user_id;
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner)!.push(row);
  }

  let lapsedOwners = 0;
  let removedSeats = 0;
  let revoked = 0;
  let refreshed = 0;
  const activeOwners = new Set<string>();

  // Pass 1: find lapsed plans and delete their membership rows.
  for (const [owner, ownerRows] of byOwner) {
    const plan = await ownerUnlocksSeats(owner);
    if (plan.unknown) {
      console.error(`reconcile-seats: owner ${owner} entitlement unknown — skipped`);
      activeOwners.add(owner); // uncertainty never dissolves a family
      continue;
    }
    if (plan.qualifies) {
      activeOwners.add(owner);
      continue;
    }
    lapsedOwners++;
    for (const row of ownerRows) {
      const { error: delError } = await admin
        .from('tree_members')
        .delete()
        .eq('tree_id', row.tree_id)
        .eq('user_id', row.user_id);
      if (delError) console.error('reconcile-seats: delete failed', delError.message);
      else removedSeats++;
    }
  }

  // Pass 2: revoke entitlements for granted seats that no longer exist
  // anywhere — a member seated by two owners keeps the entitlement while
  // either plan stands.
  const grantedUsers = new Set(rows.filter((r) => r.rc_granted).map((r) => r.user_id));
  for (const userId of grantedUsers) {
    const { data: remaining } = await admin
      .from('tree_members')
      .select('tree_id')
      .eq('user_id', userId)
      .eq('rc_granted', true)
      .limit(1);
    if (remaining?.length) continue;
    try {
      await revokeSeatEntitlement(userId);
      revoked++;
    } catch (error) {
      console.error(`reconcile-seats: revoke failed for ${userId}`, error);
    }
  }

  // Pass 3: refresh granted seats nearing expiry under active plans.
  const stillSeated = rows.filter((r) => r.rc_granted && activeOwners.has(r.trees.user_id));
  const seen = new Set<string>();
  for (const row of stillSeated) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    const state = await getEntitlement(row.user_id);
    if (state.unknown) continue;
    const expiringSoon =
      !state.active ||
      (state.expiresAt !== null && Date.parse(state.expiresAt) - Date.now() < REFRESH_WINDOW_MS);
    if (!expiringSoon) continue;
    try {
      await grantSeatEntitlement(row.user_id);
      refreshed++;
    } catch (error) {
      console.error(`reconcile-seats: refresh failed for ${row.user_id}`, error);
    }
  }

  const summary = { lapsedOwners, removedSeats, revoked, refreshed, owners: byOwner.size };
  console.log('reconcile-seats', JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    headers: { 'Content-Type': 'application/json' },
  });
});
