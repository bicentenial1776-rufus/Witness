/**
 * Feature switches for surfaces that are built but shelved.
 *
 * ARCHIVES — the National Archives candidate matching (nara_candidates,
 * the Archives screen, the Home module, the Tree tab door, the Portrait's
 * "In the National Archives" and a place's "Papers of this place").
 * Pulled 2026-09-17 (Rufus: "let's pull National Archives as a feature for
 * now; we may come back to it"). The code stays; every surface checks this
 * flag, and the nara-enrich cron is unscheduled so the API budget is not
 * spent on a hidden feature. To bring it back: flip the flag and re-run
 * the cron.schedule from migration 20260726150000.
 */
export const ARCHIVES_ENABLED = false;

/**
 * FSV ROOMS — Family Street View, phase 1: a household's home on a census
 * day, entered from the Portrait and the Family Graph. Built into the app
 * DARK (docs/FSV_PHASE1_DARK.md): while this is false no mark is drawn, no
 * room screen opens, and nothing here is read or queried. Turning it on is
 * the first of three gates (lib/fsv-access.ts); the other two are an active
 * seat and a row in fsv_early_access, which is also the kill switch.
 */
// On since 2026-09-18 for the internal-tester TestFlight (Greg's ladder,
// docs/FSV_PHASE1_DARK.md): the other two gates — an active seat and a row
// in fsv_early_access — still keep every door shut for everyone else.
export const FSV_ROOMS_ENABLED = true;
