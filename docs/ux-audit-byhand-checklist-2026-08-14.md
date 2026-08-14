# Witness — Batch 2 By-Hand Checklist

**Date prepared:** 2026-08-14 · Two audits that can't be done from the repo: the Superwall dashboard paywall, and the App Privacy labels in App Store Connect. Facts below are grounded in the code as of commit `dfefa9e`.

---

## Part A — Superwall dashboard paywall (audit hard stop 3)

> **OUTCOME (2026-08-14): CLOSED — no dashboard paywall exists.** Key verified against
> `.env.production` (`pk_5vVYe…`). Production dashboard holds two inert campaigns:
> "WitnessLives Original" (no placements, no paywalls) and "Example Campaign" (Superwall's
> sample, wired to `campaign_trigger`, which the app never fires). Nothing is attached to
> `onboarding_complete` — every iOS user falls through to the in-repo `paywall.tsx`, which
> is the paywall the audit already passed. Remaining actions: archive both placeholder
> campaigns, confirm Team access is Rufus-only, and decide whether to keep the Superwall
> SDK mounted at all (zero campaigns = it currently identifies users and sends events in
> exchange for nothing; dropping the key removes a processor from Part B's table).
> Standing rule if kept: any future campaign on `onboarding_complete` re-triggers the A2
> checklist before publishing.
>
> **DECISION (2026-08-14): SDK dropped** — key removed from `.env.production` in commit
> `3b2b6c3`; the gate renders the app unchanged without it. B3 policy edits landed in the
> same commit. Re-adding a key (and the ASC Usage Data row) re-enables it if experiments
> are ever wanted.

**Why:** On iOS release builds a Superwall-configured paywall presents over the clean in-repo one at the `onboarding_complete` placement (live key in `apps/mobile/.env.production`). Its copy, price framing, decline affordance, and re-ask rules live in the dashboard, changeable without an app release — so the in-repo paywall's clean audit proves nothing about what users actually see until this check is done.

**Where:** superwall.com → the Witness iOS app → Campaigns / Placements.

### A1. Inventory
- [ ] Find every campaign wired to the `onboarding_complete` placement.
- [ ] List every paywall **variant** it can serve — including A/B experiment arms and any audience-targeted variants (the app sends `persona` as an audience param: `gedcom-ready`, `just-starting`, `inheriting`, `curious`, `unspecified`). Audit every variant, not just the default.
- [ ] Confirm the `feature_locked` placement has no live campaign (it's dead code in the app — zero call sites).

### A2. Per-variant checklist (same standard as the in-repo paywall)
- [ ] **Price stated plainly**: $19.99/year and the 7-day trial, visible before the purchase button — no fabricated anchor price, no strikethrough "was" price that was never charged, no fake discount badge.
- [ ] **Trial conversion disclosed**: charge date / auto-renewal stated near the CTA (Apple 3.1.2 wants this adjacent to the button, not only in fine print).
- [ ] **No urgency or scarcity**: no countdown, no "offer ends", no "only today" — the offer is permanent, so any such claim would be fabricated (audit hard-stop category).
- [ ] **No fabricated social proof**: no invented user counts, ratings, or testimonials.
- [ ] **No confirmshaming**: if any decline/close control has a label, it's neutral ("Not now"), never guilt-flavored.
- [ ] **Restore Purchases reachable** from the paywall (guideline 3.1.1 expectation).
- [ ] **Privacy Policy + Terms links present** (Apple requires both on subscription paywalls).
- [ ] **Dismissal behavior**: what happens when the Superwall paywall is closed/dismissed? It must land the user back on the local `/paywall` route (which carries Sign out and now Delete account) — verify the user can always still reach sign-out and deletion. If a variant is configured non-dismissible AND covers the local paywall permanently, that's a trap; fix the config.

### A3. Governance (so this audit stays true)
- [ ] Record the audited version/date of each variant (screenshot each one into your records).
- [ ] Check who has edit access to the dashboard; reduce to just you if it isn't already.
- [ ] Adopt the rule: dashboard paywall edits get re-checked against A2 before publishing — treat it as review-gated, like a release.
- [ ] Optional simplification worth considering: if you're not actually running experiments, serve one variant (or drop the Superwall layer and let the in-repo paywall stand) — one auditable paywall beats a configurable one you have to keep re-auditing.

---

## Part B — App Privacy labels (App Store Connect) + policy wording

**Why:** RevenueCat and Superwall collect device/event data with no consent gate, while the shipped policy says only "basic diagnostic information." The labels and the policy both need to match reality before the next binary goes to review — reviewers check labels together with the 5.1.1(v) deletion flow that's now in the app.

**Where:** App Store Connect → Witness → App Privacy. Labels are editable anytime without a new build; do it before the next submission.

> **OUTCOME (2026-08-14): ASC labels corrected and republished.** Declared set was already
> the right four types (Email Address, Other User Content, User ID, Purchase History), all
> App Functionality, no Location row, no tracking. One error found and fixed: User ID was
> declared "not linked to identity" — changed to linked (it's the account key everything
> hangs off). Privacy Policy URL points at witnesslives.com/privacy (the live policy, not
> the deleted stale one). Still open: B3 policy-wording edits (code-side), B4 reviewer
> notes on next binary, and the Superwall keep-or-drop decision (if kept, add Usage Data →
> Product Interaction, linked).

### B1. What the app actually collects (from the code audit — declare these)
| Data | Where it comes from | Label | Linked to identity? |
|---|---|---|---|
| Email address | Supabase auth (sign-up) | Contact Info → Email Address | Yes — app functionality |
| Family-tree content | GEDCOM import stored server-side (names, dates, places) | User Content → Other User Content | Yes — app functionality |
| User ID | Supabase user id, passed as app-user-id to RevenueCat and Superwall | Identifiers → User ID | Yes — app functionality |
| Purchase history | RevenueCat | Purchases → Purchase History | Yes — app functionality |
| Paywall interaction events | Superwall (impressions/conversions, identified with the user id) | Usage Data → Product Interaction | Yes — analytics + app functionality |
| Crash/diagnostic data | RevenueCat + Superwall SDK internals | Diagnostics → per each SDK's published disclosure | Per their docs |

Cross-check each SDK's own "App Privacy disclosure" page (both RevenueCat and Superwall publish one listing exactly which ASC rows to declare) and mirror them — don't reconstruct from memory.

### B2. What the app does NOT collect (verify the labels don't over- or under-claim)
- [ ] **Location: not collected on iOS.** Near me requests foreground location and computes distances on-device against the already-downloaded geography index — coordinates are never transmitted from the iOS app. (The web app does reverse-geocode via Nominatim; that's outside ASC labels but belongs in the privacy policy.) Verify no "Location" row is declared — or if one ever was, remove it.
- [ ] **Tracking: No.** No ads, no cross-app tracking, no ATT prompt needed. The "Data Used to Track You" section should be empty.
- [ ] **No first-party analytics** — don't declare analytics beyond the Superwall row above.

### B3. Privacy policy + Terms alignment (code-side; I can draft these edits when you're ready)
- [ ] `apps/preview-site/privacy.html` + `docs/privacy.html`: name RevenueCat (subscription billing) and Superwall (paywall presentation/experimentation) as processors receiving the user id and purchase/paywall events; keep the "no ads, no data sales, no advertising trackers" line (still true).
- [ ] Same files: the account-deletion paragraph should now lead with the in-app path ("You screen → Delete your account") with email as the fallback.
- [ ] Web privacy policy: mention the Nominatim reverse-geocode on the web Nearby page (coordinates sent to OpenStreetMap's service to name your town).
- [ ] `apps/preview-site/terms.html`: the "manage or cancel from your account page at app.witnesslives.com" sentence becomes true once the web deploy ships — verify wording matches the actual screen (it's the You screen's "Your subscription" section).

### B4. While you're in ASC
- [ ] Reviewer notes for the next binary: mention the new in-app account deletion path (You → Help & account → Delete your account) — it preempts the 5.1.1(v) question.
- [ ] Subscription metadata: confirm the ASC subscription display name/description matches "$19.99/year, 7-day free trial" with no copy drift.

---

## Ship-order reminder
1. Deploy edge functions: `supabase functions deploy send-digest-emails digest-unsubscribe delete-account`
2. Web deploy (Vercel recipe) — makes the Terms' account-page claim true
3. Part A + B above (no code required)
4. Next iOS binary carries deletion + subscription section → then Batch 3 (trial-reminder priming, empty states, location priming)
