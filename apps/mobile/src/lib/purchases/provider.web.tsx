import { Purchases } from '@revenuecat/purchases-js';
import { useEffect, useState, type PropsWithChildren } from 'react';

import { useSession } from '@/auth/session-provider';

import { ENTITLEMENT_ID, PurchasesContext } from './contract';

/**
 * Web purchases provider (WEB_APP_DESIGN.md §2–4): entitlement read through
 * RevenueCat Web Billing, keyed by the same app_user_id (the Supabase user
 * id) the iOS app logs in with — so an App Store subscriber who signs in
 * here is entitled with no migration at all.
 *
 * Checkout is not wired yet: `offering` stays null and purchase/restore
 * fail closed until the Web Billing product exists in the RevenueCat
 * dashboard and the paywall route grows its web checkout. Without a key
 * (EXPO_PUBLIC_REVENUECAT_WEB_API_KEY), entitlement simply reads false —
 * the same fail-closed posture as the native provider with a missing key.
 */

const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY;

let configuredUserId: string | null = null;

async function instanceFor(userId: string): Promise<Purchases> {
  if (!Purchases.isConfigured()) {
    configuredUserId = userId;
    return Purchases.configure({ apiKey: apiKey!, appUserId: userId });
  }
  const instance = Purchases.getSharedInstance();
  if (configuredUserId !== userId) {
    configuredUserId = userId;
    await instance.changeUser(userId);
  }
  return instance;
}

export function PurchasesProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [isEntitled, setIsEntitled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!apiKey || !session) {
      setIsEntitled(false);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const purchases = await instanceFor(session.user.id);
        const info = await purchases.getCustomerInfo();
        if (!cancelled) setIsEntitled(Boolean(info.entitlements.active[ENTITLEMENT_ID]));
      } catch (error) {
        console.warn('RevenueCat web entitlement check failed', error);
        if (!cancelled) setIsEntitled(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  return (
    <PurchasesContext.Provider
      value={{
        isLoading,
        isEntitled,
        offering: null,
        restore: async () => false,
        purchasePackage: async () => false,
      }}
    >
      {children}
    </PurchasesContext.Provider>
  );
}
