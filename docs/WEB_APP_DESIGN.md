# Witness Web App — Design

**Status:** design, July 2026. Companion to the "Web Application Behind a Paywall"
entry in IDEAS.md (the three legs: port-not-rewrite, web billing economics, web as
growth funnel) and the 2026-07-24 direction that future features favor iPad + web.

The central design problem this document solves: **a paywall outside Apple that
still honors every App Store subscriber**, with one codebase and one entitlement.

---

## 1. The one-sentence architecture

The web app is the same Expo app exported for web, served at
**app.witnesslives.com**, sharing Supabase auth and data unchanged; entitlement
unifies through RevenueCat by keying every platform's SDK to the same
`app_user_id` (the Supabase user id), so a subscription bought anywhere unlocks
everywhere, and the web sells through RevenueCat Web Billing (Stripe under the
hood) at ~3% instead of Apple's 15%.

## 2. Identity is the keystone

Everything hangs on one existing decision that turns out to be exactly right:
`purchases.tsx` already calls `Purchases.logIn(session.user.id)` — the RevenueCat
customer is keyed by the **Supabase user id** on iOS today.

- Same email/password (Supabase auth works identically in the browser) →
  same user id → same RevenueCat customer → same `premium` entitlement.
- **An App Store subscriber who signs into the web app is entitled with zero
  migration, zero receipts, zero support tickets.** RevenueCat's backend already
  holds their Apple-sourced entitlement; `purchases-js` just reads it.
- The reverse also holds: a web purchaser who later installs the iOS app is
  entitled there. Apple permits accounts-that-carry-access (the "reader"
  pattern); what the iOS app must not do is *steer* to web checkout — see §6.

Rule: **no platform ever grants entitlement locally.** `isEntitled` remains the
single source of truth, always derived from RevenueCat customer info.

## 3. The purchases seam (the refactor that unblocks everything)

Today `src/lib/purchases.tsx` imports `react-native-purchases` directly, plus
Superwall. That file becomes a platform pair with one shared contract:

```
src/lib/purchases/
  contract.ts          // PurchasesContextValue, ENTITLEMENT_ID, isEntitled rule
  provider.native.tsx  // react-native-purchases + Superwall (today's file, moved)
  provider.web.tsx     // @revenuecat/purchases-js (Web Billing SDK)
```

Metro and the web bundler resolve `.native`/`.web` automatically; every consumer
keeps importing `usePurchases()` and never knows the platform. The web provider
mirrors the native lifecycle: configure once with the Web Billing public key,
`changeUser(supabaseUserId)` on session change, entitlement from
`getCustomerInfo()`, offerings for the paywall page. The `DEV_SKIP_PAYWALL`
escape hatch stays native-only.

This refactor should land **before** any other web work; it is small, testable
on iOS alone (pure file move), and every later piece depends on it.

## 4. Checkout, trials, and the paywall page

- **Account first, then purchase.** Web visitors create the Supabase account
  before checkout (matches iOS onboarding order), so the RevenueCat customer is
  keyed correctly from the first transaction — never an anonymous purchase that
  needs stitching later.
- **Checkout = RevenueCat Web Billing** (Stripe-backed), via `purchases-js`
  `purchase(package)` from our own paywall route — same $19.99/yr, same 7-day
  trial configured on the Web Billing product. Keeping price parity with the App
  Store avoids both user confusion and Apple-relations friction.
- **Double-subscription guard:** before showing checkout, if `premium` is
  already active, show "You already have Witness Pro (via the App Store)" with a
  manage link instead of a buy button. RevenueCat's `managementURL` routes each
  subscriber to the right console (Apple's subscription settings for
  Apple-sourced, Web Billing's customer portal for Stripe-sourced).
- **Double-trial leak:** Apple intro-offer eligibility and Web Billing trial
  eligibility are tracked per store, so a determined user could take both
  7-day trials. Accepted for v1 (cost ≈ nothing, complexity of closing it ≈
  real); revisit only if abused.
- **Lapsed Apple subscribers on web are the winback surface**: expired
  entitlement + web session → web offer. This is allowed on web (Apple's rules
  bind the app, not the site) and is the churn-recovery channel Apple never
  gives us.

## 5. Porting inventory (the native edges)

| Area | iOS today | Web plan | Phase |
|---|---|---|---|
| Screens/data (digest, queries, library, archives, ancestor, NARA) | RN + Supabase | Render as-is via react-native-web | A |
| Auth | Supabase | Identical | A |
| Purchases | react-native-purchases + Superwall | purchases-js + our paywall route | A |
| GEDCOM import | Files app picker | Drag-and-drop + file input — *better* on web | A |
| Map + proximity | react-native-maps | Platform-split `Map.web.tsx` on MapLibre GL (OSM tiles) | B |
| Notifications (trial reminder, weekly digest) | expo-notifications | Email (Resend is already wired for auth mail) | B |
| Share cards (view-shot) | Native snapshot | Server-rendered OG images / html-to-image | B |
| Street View | RN / (future) three.js | react-three-fiber targets web natively | with feature |

Standing rule (now binding): components stay platform-agnostic; a platform
split file is the escape hatch, not the norm.

## 6. Apple compliance posture

- The iOS app keeps selling through IAP, never mentions web pricing, never
  links to checkout — except optionally in the **US storefront**, where the
  post-*Epic* guidelines allow an external purchase link; RevenueCat ships a
  hosted flow for exactly this (mobile paywall button → web checkout → return
  with entitlement). Treat that as a Phase B experiment, geo-gated to US.
- Cross-platform *access* (web-purchased sub working in the iOS app) is the
  long-standing reader pattern and is compliant.
- The marketing site and web app may sell freely; anti-steering rules bind the
  app binary only.

## 7. Topology & delivery

- `witnesslives.com` — marketing (unchanged, Vercel).
- `app.witnesslives.com` — the Expo web export (static + client-side routing),
  same Vercel project family, deployed from the repo (`npx expo export
  --platform web`). Expo Router gives every screen a real URL — which is what
  makes shared discovery links land on living pages later (growth-funnel leg).
- Supabase and Edge Functions unchanged — the web app is just another client
  behind the same RLS. The NARA/geocoding workers don't know or care.

## 8. Phasing

**Phase A — "the entitled web"**: purchases seam refactor → Expo web export
renders core screens → Supabase auth on web → `purchases-js` entitlement →
paywall route with Web Billing checkout → deploy at app.witnesslives.com.
Map tab shows a graceful "on iPad and iPhone for now" card. Exit criteria:
an App Store subscriber signs in on web and reads their digest; a fresh web
user completes trial → paid without touching an iPhone.

**Phase B — parity & growth**: MapLibre map, email notifications, public
share-link previews (signed, read-only slices of a tree), US external-link
experiment in the iOS paywall, winback offers for lapsed subscribers.

## 9. Open questions

1. Web Billing product/tax setup: Stripe account ownership, tax registration
   thresholds (Stripe Tax handles collection; registration is on us).
2. Does Superwall matter on web, or is a hand-built paywall route enough? (v1:
   hand-built; Superwall is a native experiment layer.)
3. Family/gift plans — web-only differentiator worth designing once Phase A
   proves out.
4. How much of onboarding (narrative screens) ports vs. gets a web-specific,
   shorter flow that assumes a shared link brought you here.
