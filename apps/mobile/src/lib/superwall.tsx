import { useCallback, useEffect, type PropsWithChildren } from 'react';
import {
  CustomPurchaseControllerProvider,
  SuperwallLoaded,
  SuperwallProvider,
  usePlacement,
  useUser,
  type PurchaseResult,
  type RestoreResult,
} from 'expo-superwall';
import Purchases, { type CustomerInfo } from 'react-native-purchases';

import { useSession } from '@/auth/session-provider';
import { ENTITLEMENT_ID, usePurchases } from '@/lib/purchases';

/**
 * Superwall drives which paywall shows and when (placements, audiences,
 * experiments — configured in the Superwall dashboard). RevenueCat stays the
 * source of truth for transactions and entitlement: Superwall delegates every
 * purchase/restore to RevenueCat via the purchase controller below, and the
 * `premium` entitlement continues to gate the app.
 *
 * Public (pk_…) key — safe to embed in the client.
 */
const superwallKey = process.env.EXPO_PUBLIC_SUPERWALL_IOS_KEY;

export const PLACEMENT_ONBOARDING_COMPLETE = 'onboarding_complete';
export const PLACEMENT_FEATURE_LOCKED = 'feature_locked';

/** Superwall purchase/restore requests, fulfilled by RevenueCat. */
const purchaseController = {
  async onPurchase(params: { productId: string; platform: string }): Promise<PurchaseResult> {
    try {
      const products = await Purchases.getProducts([params.productId]);
      const product = products[0];
      if (!product) {
        return { type: 'failed', error: `Product ${params.productId} not found in RevenueCat` };
      }
      await Purchases.purchaseStoreProduct(product);
      return { type: 'purchased' };
    } catch (error) {
      if ((error as { userCancelled?: boolean }).userCancelled) {
        return { type: 'cancelled' };
      }
      return { type: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  },
  async onPurchaseRestore(): Promise<RestoreResult> {
    try {
      await Purchases.restorePurchases();
      return { type: 'restored' };
    } catch (error) {
      return { type: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  },
};

/**
 * Keeps Superwall in sync with the app's state:
 * - identity: the Supabase user id, the same id RevenueCat is logged in with,
 *   so subscription events line up across both platforms;
 * - subscription status: mirrored from RevenueCat's customer info so
 *   Superwall's audience filters ("subscribed?") see the truth.
 */
function SuperwallBridge() {
  const { session } = useSession();
  const { identify, signOut, setSubscriptionStatus } = useUser();

  useEffect(() => {
    if (session) {
      identify(session.user.id).catch((error) => console.warn('Superwall identify failed', error));
    } else {
      signOut();
    }
  }, [session, identify, signOut]);

  useEffect(() => {
    const listener = (customerInfo: CustomerInfo) => {
      const active = Object.keys(customerInfo.entitlements.active);
      setSubscriptionStatus(
        active.length === 0
          ? { status: 'INACTIVE' }
          : {
              status: 'ACTIVE',
              entitlements: active.map((id) => ({ id, type: 'SERVICE_LEVEL' as const })),
            },
      ).catch((error) => console.warn('Superwall status sync failed', error));
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [setSubscriptionStatus]);

  return null;
}

/**
 * Mounts Superwall (inside PurchasesProvider, which configures RevenueCat
 * first, at render time). Without a key the app renders unchanged.
 */
export function SuperwallGate({ children }: PropsWithChildren) {
  if (!superwallKey) return <>{children}</>;

  return (
    <CustomPurchaseControllerProvider controller={purchaseController}>
      <SuperwallProvider
        apiKeys={{ ios: superwallKey }}
        onConfigurationError={(error) => console.warn('Superwall configuration failed', error)}
      >
        {/* Identity + status sync must wait for configure to finish, or the
            calls reject (e.g. while the simulator's App Store dialog blocks
            SuperwallKit's StoreKit startup queries). */}
        <SuperwallLoaded>
          <SuperwallBridge />
        </SuperwallLoaded>
        {children}
      </SuperwallProvider>
    </CustomPurchaseControllerProvider>
  );
}

/**
 * Gate a premium feature behind the `feature_locked` placement. Entitled
 * users run the feature immediately; everyone else gets whatever paywall the
 * Superwall dashboard has attached to the placement.
 *
 * The Superwall hooks throw when used outside SuperwallProvider, and the
 * provider only mounts when a key is configured — so the export switches
 * implementation on the build-time key. Without Superwall, non-entitled
 * users simply don't pass; the hard paywall in the gauntlet is the fallback.
 */
function usePremiumGateWithSuperwall(): (feature: () => void) => Promise<void> {
  const { isEntitled } = usePurchases();
  const { registerPlacement } = usePlacement();

  return useCallback(
    async (feature: () => void) => {
      if (isEntitled) {
        feature();
        return;
      }
      await registerPlacement({
        placement: PLACEMENT_FEATURE_LOCKED,
        params: { entitlement: ENTITLEMENT_ID },
        feature,
      });
    },
    [isEntitled, registerPlacement],
  );
}

function usePremiumGateFallback(): (feature: () => void) => Promise<void> {
  const { isEntitled } = usePurchases();
  return useCallback(
    async (feature: () => void) => {
      if (isEntitled) feature();
    },
    [isEntitled],
  );
}

export const usePremiumGate = superwallKey ? usePremiumGateWithSuperwall : usePremiumGateFallback;

/**
 * Fire-and-forget registration of the post-onboarding placement. The
 * Superwall dashboard decides whether a paywall presents; the router's
 * entitlement guard still owns access either way.
 */
function useOnboardingPlacementWithSuperwall(): () => Promise<void> {
  const { registerPlacement } = usePlacement();

  return useCallback(async () => {
    try {
      await registerPlacement({ placement: PLACEMENT_ONBOARDING_COMPLETE });
    } catch (error) {
      console.warn('Superwall onboarding placement failed', error);
    }
  }, [registerPlacement]);
}

function useOnboardingPlacementFallback(): () => Promise<void> {
  return useCallback(async () => {}, []);
}

export const useOnboardingPlacement = superwallKey
  ? useOnboardingPlacementWithSuperwall
  : useOnboardingPlacementFallback;
