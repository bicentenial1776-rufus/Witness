import {
  ErrorCode,
  Purchases,
  PurchasesError,
  type CustomerInfo as WebCustomerInfo,
  type Package as WebPackage,
} from '@revenuecat/purchases-js';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { PurchasesOffering } from 'react-native-purchases';

import { useSession } from '@/auth/session-provider';

import { ENTITLEMENT_ID, PurchasesContext, type SubscriptionStatus } from './contract';

/**
 * Web purchases provider (WEB_APP_DESIGN.md §2–4): entitlement and checkout
 * through RevenueCat Web Billing, keyed by the same app_user_id (the
 * Supabase user id) the iOS app logs in with — an App Store subscriber who
 * signs in here is entitled with no migration, and a web purchase unlocks
 * the iOS app the same way.
 *
 * The contract speaks the native SDK's offering shape, so the paywall
 * screen renders unchanged on both platforms; this provider adapts the
 * Web Billing offering into that shape (just the fields the paywall
 * reads) and keeps the real web packages aside for purchase() — which
 * opens RevenueCat's hosted checkout in-page and resolves when Stripe
 * confirms. Without a key (EXPO_PUBLIC_REVENUECAT_WEB_API_KEY),
 * everything fails closed, the same posture as native with a missing key.
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
    // Record the switch only AFTER it succeeds: setting it first meant a
    // rejected changeUser left the module claiming user B while the SDK
    // still held user A — and a later restore() then handed A's
    // entitlement to B.
    await instance.changeUser(userId);
    configuredUserId = userId;
  }
  return instance;
}

// The web SDK's shape differs from native only in the small ways adapted
// here: lowercase periodType values and Date objects for expiration.
function subscriptionOf(info: WebCustomerInfo): SubscriptionStatus | null {
  const entitlement = info.entitlements.active[ENTITLEMENT_ID];
  if (!entitlement) return null;
  return {
    isTrial: entitlement.periodType === 'trial',
    willRenew: entitlement.willRenew,
    expiresAt: entitlement.expirationDate ? entitlement.expirationDate.toISOString() : null,
    isPromotional: String(entitlement.store).toLowerCase() === 'promotional',
    managementURL: info.managementURL,
  };
}

export function PurchasesProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [isEntitled, setIsEntitled] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  // The adapted offering carries only what the paywall renders; the real
  // Web Billing packages wait here, keyed by package identifier.
  const webPackages = useRef(new Map<string, WebPackage>());

  useEffect(() => {
    if (!apiKey || !session) {
      setIsEntitled(false);
      setSubscription(null);
      setOffering(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const purchases = await instanceFor(session.user.id);
        const info = await purchases.getCustomerInfo();
        if (!cancelled) {
          setIsEntitled(Boolean(info.entitlements.active[ENTITLEMENT_ID]));
          setSubscription(subscriptionOf(info));
        }

        const offerings = await purchases.getOfferings();
        const current = offerings.current;
        if (!cancelled && current) {
          webPackages.current = new Map(
            current.availablePackages.map((pkg) => [pkg.identifier, pkg]),
          );
          const adapt = (pkg: WebPackage) => ({
            identifier: pkg.identifier,
            product: { priceString: pkg.webBillingProduct.currentPrice.formattedPrice },
          });
          setOffering({
            identifier: current.identifier,
            availablePackages: current.availablePackages.map(adapt),
            annual: current.annual ? adapt(current.annual) : null,
          } as unknown as PurchasesOffering);
        }
      } catch (error) {
        console.warn('RevenueCat web setup failed', error);
        if (!cancelled) {
          setIsEntitled(false);
          setSubscription(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  /** Re-read entitlement; the "restore" concept is receipts, which web has none of. */
  async function restore(): Promise<boolean> {
    if (!apiKey || !session) return false;
    const purchases = await instanceFor(session.user.id);
    const info = await purchases.getCustomerInfo();
    const entitled = Boolean(info.entitlements.active[ENTITLEMENT_ID]);
    setIsEntitled(entitled);
    setSubscription(subscriptionOf(info));
    return entitled;
  }

  async function purchasePackage(
    pkg: PurchasesOffering['availablePackages'][number],
  ): Promise<boolean> {
    if (!apiKey || !session) return false;
    const webPackage = webPackages.current.get(pkg.identifier);
    if (!webPackage) return false;
    const purchases = await instanceFor(session.user.id);
    try {
      const { customerInfo } = await purchases.purchase({
        rcPackage: webPackage,
        customerEmail: session.user.email ?? undefined,
      });
      const entitled = Boolean(customerInfo.entitlements.active[ENTITLEMENT_ID]);
      setIsEntitled(entitled);
      setSubscription(subscriptionOf(customerInfo));
      return entitled;
    } catch (error) {
      if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) {
        // Mirror the native SDK's cancellation contract so the paywall's
        // error handling works unchanged on web.
        throw Object.assign(new Error('Purchase cancelled'), { userCancelled: true });
      }
      throw error;
    }
  }

  return (
    <PurchasesContext.Provider
      value={{ isLoading, isEntitled, offering, subscription, restore, purchasePackage }}
    >
      {children}
    </PurchasesContext.Provider>
  );
}
