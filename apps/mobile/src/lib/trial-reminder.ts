import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { PurchasesEntitlementInfo } from 'react-native-purchases';

/**
 * Backstop for the "Day 5 — we'll remind you before your trial ends" promise
 * on the paywall (witness-onboarding-screens.md, Screen 8: a 7-day trial,
 * reminder 2 days before the Day 7 charge). App Store Connect's trial
 * mechanics and any Superwall push campaign live outside this codebase and
 * aren't guaranteed to fire on this exact schedule, so Witness also arms its
 * own local notification the moment a trial starts — same pattern as the
 * weekly digest notification.
 */

const SCHEDULED_EXPIRATION_KEY = 'witness.trial-reminder.expiration';
const SCHEDULED_ID_KEY = 'witness.trial-reminder.scheduled-id';

const REMINDER_LEAD_MS = 2 * 24 * 60 * 60 * 1000;

export const TRIAL_REMINDER_URL = '/you';

async function cancelScheduled(): Promise<void> {
  const id = await AsyncStorage.getItem(SCHEDULED_ID_KEY);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(SCHEDULED_ID_KEY);
  }
  await AsyncStorage.removeItem(SCHEDULED_EXPIRATION_KEY);
}

/**
 * Keeps the reminder in sync with the active entitlement: (re)schedules a
 * one-shot local notification 2 days before a trial's expiration date, and
 * cancels it once the entitlement leaves the trial period (converted,
 * canceled, or expired). Safe to call on every customer-info refresh —
 * it only touches the OS scheduler when the expiration date actually changes.
 */
// Startup fires this from up to three near-simultaneous paths (listener,
// getCustomerInfo, logIn); overlapping runs both pass the stored-key check
// and double-schedule. Serialize (2026-07-26 audit).
let syncChain: Promise<void> = Promise.resolve();

export function syncTrialReminder(
  entitlement: PurchasesEntitlementInfo | undefined,
): Promise<void> {
  syncChain = syncChain.catch(() => {}).then(() => syncTrialReminderNow(entitlement));
  return syncChain;
}

async function syncTrialReminderNow(
  entitlement: PurchasesEntitlementInfo | undefined,
): Promise<void> {
  if (!entitlement || entitlement.periodType !== 'TRIAL' || !entitlement.expirationDate) {
    await cancelScheduled();
    return;
  }

  const alreadyScheduledFor = await AsyncStorage.getItem(SCHEDULED_EXPIRATION_KEY);
  if (alreadyScheduledFor === entitlement.expirationDate) return;

  const permissions = await Notifications.getPermissionsAsync();
  const granted =
    permissions.granted ||
    (
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      })
    ).granted;
  if (!granted) return;

  const fireDate = new Date(new Date(entitlement.expirationDate).getTime() - REMINDER_LEAD_MS);
  if (fireDate.getTime() <= Date.now()) return;

  await cancelScheduled();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your Witness trial ends in 2 days',
      body: 'Your subscription starts on Day 7 unless you cancel before then. Manage it anytime in Settings.',
      data: { url: TRIAL_REMINDER_URL },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
  });
  await AsyncStorage.setItem(SCHEDULED_ID_KEY, id);
  await AsyncStorage.setItem(SCHEDULED_EXPIRATION_KEY, entitlement.expirationDate);
}
