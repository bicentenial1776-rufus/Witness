/**
 * CAN YOU GO IN? — the door mark, by the rooms' own rule.
 *
 * Greg (19 September 2026): "perhaps we can make an icon, or coloration, in
 * witness to show that you have the opportunity to go to an interior when
 * the interior is well enough attested (once again, same rules you are
 * using already)."
 *
 * The rooms' rule has two halves. This is the half the record decides:
 * the household is not living, is dated, is placed in a country the world
 * knows, and has at least one day to be shown on. The other half — which
 * house that country and year give it, and whether the world has a room
 * for that house — is decided by the room page itself when the door is
 * opened, from the same catalogue the world uses; a household that passes
 * here and finds no room there is told so inside, not marked outside.
 *
 * Pure, and cheap enough to run for every row of a list.
 */

import type { FsvHouseholdRecord } from './household.js';

export type FsvDoorReason = 'ok' | 'living' | 'no-year' | 'no-place' | 'no-days' | 'no-record';

export interface FsvDoor {
  ok: boolean;
  why: FsvDoorReason;
}

export function fsvCanEnter(record: FsvHouseholdRecord | null | undefined): FsvDoor {
  if (!record) return { ok: false, why: 'no-record' };
  if (record.living) return { ok: false, why: 'living' };
  if (record.year === null) return { ok: false, why: 'no-year' };
  if (!record.rgn) return { ok: false, why: 'no-place' };
  if (!record.days.length) return { ok: false, why: 'no-days' };
  return { ok: true, why: 'ok' };
}
