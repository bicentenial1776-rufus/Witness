import { useEffect, useState, type PropsWithChildren } from 'react';
import { LogBox, Platform } from 'react-native';

// The store isn't fully configured yet, so RevenueCat logs noisy (and
// expected) fetch errors on every dev launch. Keep them out of the LogBox
// toast — they still reach the console.
LogBox.ignoreLogs([/\[RevenueCat\]/]);
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
} from 'react-native-purchases';

import { useSession } from '@/auth/session-provider';
import { syncTrialReminder } from '@/lib/trial-reminder';

import { ENTITLEMENT_ID, PurchasesContext, type SubscriptionStatus } from './contract';

const rawApiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  default: undefined,
});

// RevenueCat deliberately hard-crashes Release builds configured with a
// Test Store (test_…) key. Treat one like a missing key outside dev: skip
// configuration entirely and fail closed — the paywall still gates.
const apiKey = rawApiKey && (__DEV__ || !rawApiKey.startsWith('test_')) ? rawApiKey : undefined;

/**
 * Dev-only escape hatch: EXPO_PUBLIC_DEV_SKIP_PAYWALL=1 in apps/mobile/.env
 * (gitignored) grants entitlement without RevenueCat, so simulators and demo
 * recordings never block on store configuration. Compiled out of release
 * builds by the __DEV__ guard, and native-only by design (WEB_APP_DESIGN.md).
 */
const DEV_SKIP_PAYWALL = __DEV__ && process.env.EXPO_PUBLIC_DEV_SKIP_PAYWALL === '1';

function isEntitled(info: CustomerInfo | null): boolean {
  if (DEV_SKIP_PAYWALL) return true;
  return Boolean(info?.entitlements.active[ENTITLEMENT_ID]);
}

function subscriptionOf(info: CustomerInfo | null): SubscriptionStatus | null {
  const entitlement = info?.entitlements.active[ENTITLEMENT_ID];
  if (!entitlement) return null;
  return {
    isTrial: entitlement.periodType === 'TRIAL',
    willRenew: entitlement.willRenew,
    expiresAt: entitlement.expirationDate,
    isPromotional: entitlement.store === 'PROMOTIONAL',
    managementURL: info?.managementURL ?? null,
  };
}

let configured = false;

/**
 * Configure RevenueCat exactly once, synchronously. Called during
 * PurchasesProvider render so RevenueCat is always configured before
 * Superwall (rendered as a child) initializes — the documented order.
 * Returns whether the SDK is usable in this build.
 */
export function ensurePurchasesConfigured(): boolean {
  if (!apiKey) return false;
  if (!configured) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });
    configured = true;
  }
  return true;
}

/**
 * Configures RevenueCat once and keeps entitlement state in sync with the
 * signed-in user, so `isEntitled` is the single source of truth the router
 * guard checks to decide paywall vs full access.
 */
export function PurchasesProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Render-time so RevenueCat is configured before any child (Superwall) mounts.
  const purchasesActive = ensurePurchasesConfigured();

  // Keeps the Day-5 trial reminder (see lib/trial-reminder.ts) in step with
  // whatever RevenueCat reports, from whichever path reported it — initial
  // load, listener push, login/logout, or a purchase/restore in this tab.
  function applyCustomerInfo(info: CustomerInfo) {
    setCustomerInfo(info);
    syncTrialReminder(info.entitlements.active[ENTITLEMENT_ID]).catch((error) =>
      console.warn('Trial reminder sync failed', error),
    );
  }

  useEffect(() => {
    if (!purchasesActive) {
      // Key missing, or a Test Store key in a release build (see above) —
      // fail closed so the paywall still gates, rather than crashing or
      // silently granting access.
      console.warn('RevenueCat API key missing or unusable in this build. Check apps/mobile/.env.');
      setIsLoading(false);
      return;
    }

    const listener = (info: CustomerInfo) => applyCustomerInfo(info);
    Purchases.addCustomerInfoUpdateListener(listener);

    // On a fresh install getCustomerInfo can hang indefinitely behind
    // StoreKit's first-launch queries, and the router gates the whole UI on
    // isLoading — without a ceiling the app sits on a blank screen forever.
    // Fail closed instead: stop blocking, leave isEntitled false, and let the
    // customer-info listener above flip entitlement whenever StoreKit answers.
    const loadingCeiling = setTimeout(() => setIsLoading(false), 5000);

    Purchases.getCustomerInfo()
      .then(applyCustomerInfo)
      .catch((error) => console.warn('Failed to load RevenueCat customer info', error))
      .finally(() => {
        clearTimeout(loadingCeiling);
        setIsLoading(false);
      });

    Purchases.getOfferings()
      .then((offerings) => setOffering(offerings.current))
      .catch((error) => console.warn('Failed to load RevenueCat offerings', error));

    return () => {
      clearTimeout(loadingCeiling);
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // Tie the RevenueCat identity to the Supabase account, so entitlement
  // follows the user across devices/reinstalls rather than the device.
  // Keyed on the user id, not the session object — token refreshes must
  // not re-run logIn. On an identity change the old customerInfo is
  // dropped FIRST (fail closed while the switch is in flight: the previous
  // account's entitlement must never admit the next), and a stale
  // in-flight resolution from the prior identity is discarded.
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    setCustomerInfo(null);
    if (session) {
      Purchases.logIn(session.user.id)
        .then(({ customerInfo: info }) => {
          if (!cancelled) applyCustomerInfo(info);
        })
        .catch((error) => console.warn('RevenueCat logIn failed', error));
    } else {
      // logOut rejects when RevenueCat is already anonymous — the normal
      // state on a fresh install, where this effect first runs with no
      // session. There is nothing to undo in that case.
      Purchases.logOut()
        .then((info) => {
          if (!cancelled) applyCustomerInfo(info);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  async function restore(): Promise<boolean> {
    const info = await Purchases.restorePurchases();
    applyCustomerInfo(info);
    return isEntitled(info);
  }

  async function purchasePackage(
    pkg: PurchasesOffering['availablePackages'][number],
  ): Promise<boolean> {
    const { customerInfo: info } = await Purchases.purchasePackage(pkg);
    applyCustomerInfo(info);
    return isEntitled(info);
  }

  return (
    <PurchasesContext.Provider
      value={{
        isLoading,
        isEntitled: isEntitled(customerInfo),
        offering,
        subscription: subscriptionOf(customerInfo),
        restore,
        purchasePackage,
      }}
    >
      {children}
    </PurchasesContext.Provider>
  );
}
