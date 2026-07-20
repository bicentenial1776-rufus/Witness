import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
} from 'react-native-purchases';

import { useSession } from '@/auth/session-provider';

/** The single subscription tier — $19.99/year, no feature gating (BRIEF.md). */
export const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'premium';

const apiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  default: undefined,
});

function isEntitled(info: CustomerInfo | null): boolean {
  return Boolean(info?.entitlements.active[ENTITLEMENT_ID]);
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

  useEffect(() => {
    if (!apiKey) {
      // No RevenueCat project configured yet (see .env) — fail closed so
      // the paywall still gates, rather than silently granting access.
      console.warn('Missing RevenueCat API key. Check apps/mobile/.env.');
      setIsLoading(false);
      return;
    }

    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });

    const listener = (info: CustomerInfo) => setCustomerInfo(info);
    Purchases.addCustomerInfoUpdateListener(listener);

    Purchases.getCustomerInfo()
      .then(setCustomerInfo)
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
      Purchases.logIn(session.user.id).then(({ customerInfo: info }) => setCustomerInfo(info));
    } else {
      Purchases.logOut().then(setCustomerInfo);
    }
  }, [session]);

  async function restore(): Promise<boolean> {
    const info = await Purchases.restorePurchases();
    setCustomerInfo(info);
    return isEntitled(info);
  }

  async function purchasePackage(
    pkg: PurchasesOffering['availablePackages'][number],
  ): Promise<boolean> {
    const { customerInfo: info } = await Purchases.purchasePackage(pkg);
    setCustomerInfo(info);
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
