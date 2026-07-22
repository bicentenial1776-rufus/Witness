import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
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

/** The single subscription tier — $19.99/year, no feature gating (BRIEF.md). */
export const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'premium';

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
 * builds by the __DEV__ guard.
 */
const DEV_SKIP_PAYWALL = __DEV__ && process.env.EXPO_PUBLIC_DEV_SKIP_PAYWALL === '1';

function isEntitled(info: CustomerInfo | null): boolean {
  if (DEV_SKIP_PAYWALL) return true;
  return Boolean(info?.entitlements.active[ENTITLEMENT_ID]);
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

interface PurchasesContextValue {
  isLoading: boolean;
  isEntitled: boolean;
  offering: PurchasesOffering | null;
  restore: () => Promise<boolean>;
  purchasePackage: (pkg: PurchasesOffering['availablePackages'][number]) => Promise<boolean>;
}

const PurchasesContext = createContext<PurchasesContextValue>({
  isLoading: true,
  isEntitled: false,
  offering: null,
  restore: async () => false,
  purchasePackage: async () => false,
});

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

    Purchases.getCustomerInfo()
      .then(applyCustomerInfo)
      .catch((error) => console.warn('Failed to load RevenueCat customer info', error))
      .finally(() => setIsLoading(false));

    Purchases.getOfferings()
      .then((offerings) => setOffering(offerings.current))
      .catch((error) => console.warn('Failed to load RevenueCat offerings', error));

    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // Tie the RevenueCat identity to the Supabase account, so entitlement
  // follows the user across devices/reinstalls rather than the device.
  useEffect(() => {
    if (!apiKey) return;
    if (session) {
      Purchases.logIn(session.user.id).then(({ customerInfo: info }) => applyCustomerInfo(info));
    } else {
      Purchases.logOut().then(applyCustomerInfo);
    }
  }, [session]);

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
      value={{ isLoading, isEntitled: isEntitled(customerInfo), offering, restore, purchasePackage }}
    >
      {children}
    </PurchasesContext.Provider>
  );
}

export function usePurchases(): PurchasesContextValue {
  return useContext(PurchasesContext);
}
