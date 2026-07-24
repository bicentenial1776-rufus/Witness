import { useCallback, type PropsWithChildren } from 'react';

import { usePurchases } from '@/lib/purchases';

/**
 * Web variant: Superwall is a native paywall-experiment layer with no web
 * SDK in this stack (WEB_APP_DESIGN.md §9) — on web the paywall route
 * itself is the only paywall. Same exports as superwall.tsx, no behavior.
 */

export const PLACEMENT_ONBOARDING_COMPLETE = 'onboarding_complete';
export const PLACEMENT_FEATURE_LOCKED = 'feature_locked';

export function SuperwallGate({ children }: PropsWithChildren) {
  return <>{children}</>;
}

/** Entitled users run the feature; everyone else is simply gated. */
export function usePremiumGate(): (feature: () => void) => Promise<void> {
  const { isEntitled } = usePurchases();
  return useCallback(
    async (feature: () => void) => {
      if (isEntitled) feature();
    },
    [isEntitled],
  );
}

export function useOnboardingPlacement(): (params?: Record<string, string>) => Promise<void> {
  return useCallback(async () => {}, []);
}
