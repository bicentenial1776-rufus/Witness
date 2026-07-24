import { createContext, useContext } from 'react';
import type { PurchasesOffering } from 'react-native-purchases';

/**
 * The platform-independent purchases contract (WEB_APP_DESIGN.md §3).
 * Consumers import from '@/lib/purchases' and never learn which store is
 * underneath: iOS resolves provider.tsx (RevenueCat native SDK + StoreKit),
 * web resolves provider.web.tsx (RevenueCat Web Billing). The native
 * PurchasesOffering types appear here as type-only imports, which erase at
 * compile time — nothing from react-native-purchases reaches a web bundle.
 */

/** The single subscription tier — $19.99/year, no feature gating (BRIEF.md). */
export const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'premium';

export interface PurchasesContextValue {
  isLoading: boolean;
  isEntitled: boolean;
  offering: PurchasesOffering | null;
  restore: () => Promise<boolean>;
  purchasePackage: (pkg: PurchasesOffering['availablePackages'][number]) => Promise<boolean>;
}

export const PurchasesContext = createContext<PurchasesContextValue>({
  isLoading: true,
  isEntitled: false,
  offering: null,
  restore: async () => false,
  purchasePackage: async () => false,
});

export function usePurchases(): PurchasesContextValue {
  return useContext(PurchasesContext);
}
