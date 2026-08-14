# Witness — UX Psychology Audit (Summary)

> **Implementation status (2026-08-14, same day):** every hard stop and ranked
> recommendation below was implemented in four commits — `dfefa9e` (exit paths),
> `3b2b6c3` (policy truth + Superwall retired), `d1c78aa` (no dead ends),
> `9a9470b` (pre-auth narrative + Sign in with Apple) — verified on a fresh
> device install, and shipped: edge functions deployed, web + marketing site
> live, iOS 1.5.0 (9) submitted to App Store Connect. The by-hand outcomes
> (Superwall dashboard, ASC privacy labels) are recorded in
> `ux-audit-byhand-checklist-2026-08-14.md` beside this file.

**Date:** 2026-08-14 · **Scope:** full app as shipped (1.4.0, four-tab IA: Home · Tree · Explore · Map, with Near me as a Map mode) · **Method:** source-code audit, two passes — effectiveness (Positive Layer) then ethics (Negative Layer, full Brignull dark-pattern taxonomy). Trust-sensitive bar applied: Witness holds family/genealogical data, so techniques merely aggressive elsewhere count as harmful here.

## Overall verdict

The middle of the app — everything between GEDCOM import and the weekly edition — is exceptionally clean: no urgency, no fabricated scarcity, no social-proof numbers, no review prompts, no confirmshaming, no streaks/badges, one toggle in the whole app (default off, server default false), every displayed number a real query result. A published audit found 95% of popular apps carry at least one dark pattern; Witness's in-repo surface carries essentially none. This is a marketable differentiator.

The problems concentrate at the two boundaries of the subscription funnel:
- **Entrance:** the first screen is the sign-in form. All value demonstration (the 7-screen narrative) happens *after* account creation, and the price is never disclosed before the account exists.
- **Exit:** cancel, delete, and export paths are missing or promised-but-unlinked.

## What's working

- Honest trial disclosure: price + charge date + cancel path stated three times on the paywall; the app arms its own Day-5 local reminder (works against conversion — in the user's favor).
- Anti-urgency house style: "worth a look, nothing urgent"; Tree Check findings blame the record, never the user ("is recorded as…"); "a prompt, not a problem" is doctrine in the code.
- Privacy-protective defaults: share links are explicit-tap, snapshot, 90-day expiring, revocable, non-enumerable; living people hard-blocked from sharing; digest email opt-in.
- Import flow is the best sequence in the app (real progress %, "Nothing changes on Ancestry," "Welcome home, {FirstName}") — commitment/IKEA-effect retention built honestly.
- Notifications decay when the app is unused (digest re-arms only on open) — the inverse of a re-engagement campaign.

## Hard stops (fix before next submission)

1. **No in-app account deletion.** Account creation exists; deletion doesn't — even the email path (support@witnesslives.com) appears only on the marketing site, never in-app. Apple guideline 5.1.1(v) exposure (rejection risk on any routine update) plus a Roach Motel finding.
2. **Web subscribers have no cancellation path.** Terms promise "manage or cancel from your account page at app.witnesslives.com" — no such page exists. On web (direct billing) this is genuine Forced Continuity with FTC click-to-cancel exposure. Build the billing/account page or fix the Terms and the mechanism together.
3. **The Superwall dashboard paywall is unaudited.** ~~On iOS release builds, a Superwall-configured paywall presents over the clean in-repo one.~~ **RESOLVED 2026-08-14:** dashboard inspected (key verified) — no campaigns or paywalls are configured for `onboarding_complete`; every user sees the audited in-repo paywall. Standing rule: any future dashboard campaign re-triggers the paywall checklist before publishing.

## Soft flags

- Paywall/trial reminder promise ("DAY 5 — We'll remind you") depends on a silently requested notification permission; if denied, it never fires and nothing falls back.
- Stale repo-root `privacy/index.html` claims "no accounts, no third-party services" — false against shipped architecture; delete it.
- RevenueCat + Superwall telemetry has no consent gate; verify App Privacy labels and policy wording actually cover subscription-infrastructure data sharing.
- Digest email has no `List-Unsubscribe` header or unsubscribe link (Gmail/Yahoo bulk-sender expectations; in-app-only opt-out is obstruction-shaped).
- No data export as a file: no GEDCOM export; the encrypted original restores only into the app. For a genealogy audience, "your file is yours, here it is" is a trust feature.
- The hard wall itself (account before value + non-dismissible paywall + no free tier) is honestly executed but is a Forced Action pattern; mitigate by disclosing "$19.99/year after a free week" before account creation.

## Top Positive-Layer recommendations (ranked by impact)

1. **Show value before the account wall** — move the narrative (or a 3-screen cut) in front of sign-up; disclose the price there. Biggest conversion lever in the funnel.
2. **Fix the sign-up dead end** — Sign in with Apple; `textContentType`/`autoComplete` autofill hints; auto-navigate after signup instead of alert + re-typing credentials.
3. **Make the cancellation promise tappable** — "Your subscription" section on /you (status, renewal date, `showManageSubscriptions()`, Restore Purchase).
4. **Guarantee the Day-5 promise** — prime the notification ask at trial start; add an in-app Home notice in the final two trial days as fallback.
5. **Repair dead-end empty states** — blank `/places` screen; Library results "0 ancestors" with no guidance; Explore search "0 moments match"; unexplained empty New England map when nothing is geocoded.
6. **Prime the location ask** — one-line rationale card before the OS dialog; "Open Settings" button on the denial state.

## Ethical checklist result (Brignull taxonomy)

Roach Motel: **present (hard stops 1–2)**. Misdirection: borderline (muted Sign out as only paywall exit — documented, acceptable). Forced Continuity: clean on disclosure, one soft flag (silent-fail reminder). All others — Trick Questions, Sneak into Basket, Privacy Zuckering, Price Comparison Prevention, Hidden Costs, Bait & Switch, Confirmshaming, Disguised Ads, Friend Spam, fabricated urgency/social proof: **clean**.

## Caveat

Source-code audit only. The Superwall dashboard paywall and App Store Connect subscription metadata are outside the repo and need a by-hand check against the same checklist.
