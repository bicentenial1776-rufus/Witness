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

/**
 * What the account screen can honestly say about the live subscription.
 * Null whenever no entitlement is active — the store, not this app, is the
 * source of truth, and we never display a status we did not observe.
 */
export interface SubscriptionStatus {
  /** The intro trial is still running; expiresAt is the Day-7 conversion date. */
  isTrial: boolean;
  /** The store will charge again at expiresAt. False once canceled — access simply runs out. */
  willRenew: boolean;
  /** ISO date the current period ends; null for grants with no end recorded. */
  expiresAt: string | null;
  /** A promotional (comped) entitlement — no store billing behind it, nothing to manage. */
  isPromotional: boolean;
  /** The store's own manage/cancel page for this subscriber, when it offers one. */
  managementURL: string | null;
}

export interface PurchasesContextValue {
  isLoading: boolean;
  isEntitled: boolean;
  offering: PurchasesOffering | null;
  subscription: SubscriptionStatus | null;
  restore: () => Promise<boolean>;
  purchasePackage: (pkg: PurchasesOffering['availablePackages'][number]) => Promise<boolean>;
}

export const PurchasesContext = createContext<PurchasesContextValue>({
  isLoading: true,
  isEntitled: false,
  offering: null,
  subscription: null,
  restore: async () => false,
  purchasePackage: async () => false,
});

export function usePurchases(): PurchasesContextValue {
  return useContext(PurchasesContext);
}
