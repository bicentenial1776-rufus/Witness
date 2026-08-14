import { Linking, Platform } from 'react-native';

import type { SubscriptionStatus } from '@/lib/purchases';

/**
 * Where "cancel anytime" actually happens. RevenueCat reports the store's
 * own management page per subscriber — Apple's subscriptions screen for App
 * Store billing, the hosted portal for web billing — and on iOS the Apple
 * page is a safe fallback while customer info is still resolving. Null means
 * there is genuinely nowhere to send this reader (a web session on an
 * Apple-billed account before customer info loads).
 */
export function manageSubscriptionUrl(subscription: SubscriptionStatus | null): string | null {
  if (subscription?.managementURL) return subscription.managementURL;
  return Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : null;
}

export function openManageSubscription(subscription: SubscriptionStatus | null): void {
  const url = manageSubscriptionUrl(subscription);
  if (url) Linking.openURL(url).catch(() => {});
}
