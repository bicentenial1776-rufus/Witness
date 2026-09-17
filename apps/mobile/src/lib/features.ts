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
