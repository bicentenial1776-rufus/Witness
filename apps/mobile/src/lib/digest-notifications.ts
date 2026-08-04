import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { weeklyDigest, type DigestEntry } from '@witness/core/query';

import { getFeaturedIds } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

/**
 * "This Week in Your Family" weekly notification.
 *
 * Local-only in v1: every time the app is opened with the digest enabled, we
 * compute NEXT week's digest and schedule a one-shot notification for the
 * coming Sunday at 9am whose body names the top anniversary — a real entry
 * from the user's tree, never canned copy. Opening the app (or the digest
 * itself) re-arms the following week. Server push is a post-launch upgrade.
 */

const ENABLED_KEY = 'witness.digest-notifications.enabled';
const SCHEDULED_ID_KEY = 'witness.digest-notifications.scheduled-id';

export const DIGEST_NOTIFICATION_URL = '/digest';

export async function isDigestNotificationEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
}

/** Next Sunday 09:00 local; if it's Sunday before 9am, today qualifies. */
export function nextDigestFireDate(now: Date): Date {
  const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
  let daysAhead = (7 - now.getDay()) % 7;
  if (daysAhead === 0 && now.getHours() >= 9) daysAhead = 7;
  fire.setDate(fire.getDate() + daysAhead);
  return fire;
}

function eventPhrase(entry: DigestEntry): string {
  const verb = entry.eventType === 'birth' ? 'was born' : 'died';
  return entry.yearsAgo !== null
    ? `${entry.fullName} ${verb} ${entry.yearsAgo} years ago this week`
    : `${entry.fullName} ${verb} this week in ${entry.year ?? 'history'}`;
}

async function cancelScheduled(): Promise<void> {
  const id = await AsyncStorage.getItem(SCHEDULED_ID_KEY);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(SCHEDULED_ID_KEY);
  }
}

// Concurrent arms both read the same stored id, both cancel it, both
// schedule — two Sunday notifications, one orphaned forever. A promise
// chain makes arming strictly sequential (2026-07-26 audit).
let armChain: Promise<void> = Promise.resolve();

/**
 * Compute next week's digest and (re)schedule the Sunday notification.
 * Quietly does nothing when disabled, when permissions are missing, or when
 * the coming week has no anniversaries. Calls are serialized.
 */
export function armDigestNotification(treeId: string): Promise<void> {
  armChain = armChain.catch(() => {}).then(() => armDigestNotificationNow(treeId));
  return armChain;
}

async function armDigestNotificationNow(treeId: string): Promise<void> {
  if (!(await isDigestNotificationEnabled())) return;
  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) return;

  const fireDate = nextDigestFireDate(new Date());
  const featuredIds = await getFeaturedIds(treeId).catch(() => new Set<string>());
  const digest = await weeklyDigest(supabase, treeId, fireDate, featuredIds);

  await cancelScheduled();
  if (digest.entries.length === 0) return;

  const top = digest.entries[0]!;
  const others = digest.entries.length - 1;
  const body =
    others > 0
      ? `${eventPhrase(top)} — and ${others} more ${others === 1 ? 'anniversary' : 'anniversaries'} in your family.`
      : `${eventPhrase(top)}.`;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'This Week in Your Family',
      body,
      data: { url: `${DIGEST_NOTIFICATION_URL}?treeId=${treeId}` },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
  });
  await AsyncStorage.setItem(SCHEDULED_ID_KEY, id);
}

/** Toggle from the digest screen. Returns the resulting enabled state. */
export async function setDigestNotificationEnabled(
  enabled: boolean,
  treeId: string,
): Promise<boolean> {
  if (!enabled) {
    await AsyncStorage.setItem(ENABLED_KEY, '0');
    await cancelScheduled();
    return false;
  }

  const { granted } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  if (!granted) {
    await AsyncStorage.setItem(ENABLED_KEY, '0');
    return false;
  }

  await AsyncStorage.setItem(ENABLED_KEY, '1');
  await armDigestNotification(treeId);
  return true;
}
