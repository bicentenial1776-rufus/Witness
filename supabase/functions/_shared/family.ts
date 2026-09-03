// Family-sharing seat plumbing (docs/family-sharing-design-brief.md).
// Seats ride RevenueCat promotional entitlements so every existing gate
// — the router guard, Superwall, checkEntitlement() — works unchanged.
// The two-call grant sequence and the v1-key requirement mirror the
// comp-subscription tooling: GET /subscribers with the PUBLIC SDK key
// lazily creates the subscriber (the secret key is rejected there);
// the promotional grant and revoke take the v1 SECRET key only.

const ENTITLEMENT = Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'premium';
const RC_BASE = 'https://api.revenuecat.com/v1/subscribers';

// 5 accounts total on the family plan: the owner plus this many seats.
export const SEAT_LIMIT = 4;

// Seat grants are yearly and refreshed by reconcile-seats while the
// owner's plan stays active; expiry is the backstop if reconciliation
// ever stops running, not the mechanism.
const SEAT_DURATION = 'yearly';
const secretKey = () => Deno.env.get('REVENUECAT_SECRET_API_KEY');
const publicKey = () => Deno.env.get('REVENUECAT_PUBLIC_SDK_KEY');

export interface EntitlementState {
  active: boolean;
  productId: string | null;
  expiresAt: string | null;
  /** "trial" while a store intro trial runs; null for promos/comps and paid periods. */
  periodType: string | null;
  /** RevenueCat could not answer — treat as "unknown", never as lapsed. */
  unknown: boolean;
}

export async function getEntitlement(userId: string): Promise<EntitlementState> {
  const key = secretKey();
  if (!key) {
    console.error('REVENUECAT_SECRET_API_KEY not set — entitlement state unknown');
    return { active: false, productId: null, expiresAt: null, periodType: null, unknown: true };
  }
  try {
    const res = await fetch(`${RC_BASE}/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 404)
      return { active: false, productId: null, expiresAt: null, periodType: null, unknown: false };
    if (!res.ok) {
      console.error('RevenueCat subscriber fetch failed', res.status);
      return { active: false, productId: null, expiresAt: null, periodType: null, unknown: true };
    }
    const body = await res.json();
    const ent = body?.subscriber?.entitlements?.[ENTITLEMENT];
    const active = Boolean(
      ent && (ent.expires_date === null || Date.parse(ent.expires_date) > Date.now()),
    );
    const sub = ent?.product_identifier
      ? body?.subscriber?.subscriptions?.[ent.product_identifier]
      : undefined;
    return {
      active,
      productId: ent?.product_identifier ?? null,
      expiresAt: ent?.expires_date ?? null,
      periodType: sub?.period_type ?? null,
      unknown: false,
    };
  } catch (error) {
    console.error('RevenueCat unreachable', error);
    return { active: false, productId: null, expiresAt: null, periodType: null, unknown: true };
  }
}

/**
 * Does this owner's subscription unlock seats? The family_annual SKU
 * doesn't exist in App Store Connect yet, so the qualifying products are
 * config, not code: FAMILY_PRODUCT_IDS (comma-separated) names them once
 * the SKU ships. Until it's set, ANY active premium entitlement
 * qualifies — the pre-SKU beta posture that lets the family test seats
 * now; setting the env var is part of the family-plan launch checklist.
 * Promotional comps always qualify: comps exist so nothing about the
 * product is gated for those accounts.
 */
export async function ownerUnlocksSeats(ownerId: string): Promise<EntitlementState & { qualifies: boolean }> {
  const state = await getEntitlement(ownerId);
  if (!state.active) return { ...state, qualifies: false };
  const familyIds = (Deno.env.get('FAMILY_PRODUCT_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const qualifies =
    familyIds.length === 0 ||
    (state.productId !== null &&
      (familyIds.includes(state.productId) || state.productId.startsWith('rc_promo')));
  return { ...state, qualifies };
}

/** Two calls, in order; the keys are not interchangeable. */
export async function grantSeatEntitlement(userId: string): Promise<void> {
  const pub = publicKey();
  const secret = secretKey();
  if (!pub || !secret) throw new Error('RevenueCat keys not configured for seat grants');
  const base = `${RC_BASE}/${encodeURIComponent(userId)}`;
  const ensure = await fetch(base, {
    headers: { Authorization: `Bearer ${pub}`, 'X-Platform': 'ios' },
  });
  if (!ensure.ok) throw new Error(`subscriber create failed: ${ensure.status}`);
  const grant = await fetch(`${base}/entitlements/${ENTITLEMENT}/promotional`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration: SEAT_DURATION }),
  });
  if (!grant.ok) throw new Error(`seat grant failed: ${grant.status} ${await grant.text()}`);
}

export async function revokeSeatEntitlement(userId: string): Promise<void> {
  const secret = secretKey();
  if (!secret) throw new Error('RevenueCat secret key not configured');
  const res = await fetch(
    `${RC_BASE}/${encodeURIComponent(userId)}/entitlements/${ENTITLEMENT}/revoke_promotionals`,
    { method: 'POST', headers: { Authorization: `Bearer ${secret}` } },
  );
  if (!res.ok) throw new Error(`seat revoke failed: ${res.status} ${await res.text()}`);
}
