/**
 * WHO MAY OPEN A ROOM — and, for now, nobody.
 *
 * Family Street View's rooms (phase 1) go into the app dark: no tab, no
 * link, no mark on any screen, no code path that runs, until each of three
 * things says yes. Any one of them saying no is enough to keep the door
 * shut, and the first of them is a constant that is false.
 *
 *   1. FSV_ROOMS_ENABLED (lib/features.ts) — off in the shipped app. The
 *      build-time switch. While it is false the other two are never asked.
 *   2. An active seat — the subscription, as usePurchases reports it. Early
 *      access is for active subscribers (Greg, 19 September 2026).
 *   3. A row in fsv_early_access for this user — the server-side list, and
 *      the KILL SWITCH: deleting the rows closes every door for everyone,
 *      at once, with no release. Absent table, absent row, or any error
 *      reading it, means no.
 *
 * The rung above this (docs/FSV_PHASE1_DARK.md) is a build to TestFlight
 * for internal testers with the flag on for them; the rung above that is
 * the list opened to subscribers who opt in.
 */
import { useEffect, useState } from 'react';
import { fsvCanEnter, fsvHouseholdRecord, type FsvHouseholdRecord } from '@witness/core/fsv';

import { useActiveTree } from '@/lib/active-tree';
import { FSV_ROOMS_ENABLED } from '@/lib/features';
import { usePurchases } from '@/lib/purchases';
import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';

export interface FsvAccess {
  /** True only when all three say yes. */
  allowed: boolean;
  /** Which one said no, for a log line and nothing the user sees. */
  why: 'flag' | 'seat' | 'list' | 'checking' | 'ok';
}

let listAnswer: { userId: string; ok: boolean } | null = null;

/** Is this user on the early-access list? Cached for the session; false on any doubt. */
async function onEarlyAccessList(): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return false;
    if (listAnswer && listAnswer.userId === userId) return listAnswer.ok;
    /* the table is new in this branch (supabase/migrations/20260919230000)
       and the generated Database types do not know it until they are
       regenerated after the migration runs (supabase gen types). Until
       then the one query names it loosely; with the types regenerated this
       line becomes supabase.from('fsv_early_access') and nothing else moves. */
    const loose = supabase as unknown as { from: (table: string) => { select: (cols: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> } } } };
    const { data, error } = await loose.from('fsv_early_access').select('user_id').eq('user_id', userId).maybeSingle();
    const ok = !error && !!data;
    listAnswer = { userId, ok };
    return ok;
  } catch {
    return false;
  }
}

export function useFsvAccess(): FsvAccess {
  const { isEntitled } = usePurchases();
  const [list, setList] = useState<boolean | null>(null);
  useEffect(() => {
    if (!FSV_ROOMS_ENABLED || !isEntitled) return;
    let alive = true;
    void onEarlyAccessList().then((ok) => { if (alive) setList(ok); });
    return () => { alive = false; };
  }, [isEntitled]);
  if (!FSV_ROOMS_ENABLED) return { allowed: false, why: 'flag' };
  if (!isEntitled) return { allowed: false, why: 'seat' };
  if (list === null) return { allowed: false, why: 'checking' };
  return list ? { allowed: true, why: 'ok' } : { allowed: false, why: 'list' };
}

export interface FsvDoorState {
  /** Access is allowed and this household can be entered. */
  open: boolean;
  familyId: string | null;
  record: FsvHouseholdRecord | null;
}

/**
 * The door for a person's household: the family they head (the stage key),
 * read from the tree index on the device, judged by the rooms' own rule.
 * Resolves to a shut door whenever access is not allowed, so a screen can
 * render the mark unconditionally and it simply never appears.
 */
export function useFsvDoor(stageKey: string | null): FsvDoorState {
  const access = useFsvAccess();
  const { activeTree } = useActiveTree();
  const [door, setDoor] = useState<FsvDoorState>({ open: false, familyId: null, record: null });
  useEffect(() => {
    if (!access.allowed || !stageKey || !activeTree?.id) { setDoor({ open: false, familyId: null, record: null }); return; }
    let alive = true;
    void getTreeIndex(activeTree.id).then((index) => {
      if (!alive) return;
      const fam = index.families.find((f) => f.husband_id === stageKey || f.wife_id === stageKey);
      if (!fam) { setDoor({ open: false, familyId: null, record: null }); return; }
      const record = fsvHouseholdRecord(index, fam.id);
      setDoor({ open: fsvCanEnter(record).ok, familyId: fam.id, record });
    }).catch(() => { if (alive) setDoor({ open: false, familyId: null, record: null }); });
    return () => { alive = false; };
  }, [access.allowed, stageKey, activeTree?.id]);
  return door;
}
