# Ops — Database canary

**Since:** 2026-09-15
**Why:** On 2026-09-15 a paginated `individual_events` query began timing out
under RLS (Postgres 57014, "canceling statement due to statement timeout")
after an ad-hoc production migration. It cascaded into 500/504s on
`individuals`, `places`, `citations`, `family_children`, `relationships` and
the `search_people` RPC, and every Explore screen (Library, Moments in
History, Where They Lived, Family Patterns, Map) broke for every user with a
large tree. Nothing alerted anyone; it was found by chance. The fix was
`supabase/migrations/20260915200500_individual_events_tree_id_id_index.sql`.

## What runs

A Claude Code Routine named **"Witness DB canary (hourly)"** fires every hour
in a fresh session, read-only, against the Witness Supabase project. It:

1. Counts PostgREST 500/504 responses and Postgres `statement timeout` lines
   in the last 65 minutes (Supabase logs).
2. Runs the real tree-owner access path under RLS for the largest tree —
   `... where tree_id = X order by id limit 1000` on `individual_events`,
   `individuals`, `places`, `families` — via `EXPLAIN (ANALYZE)` and records
   each execution time.
3. Lists any query in `pg_stat_activity` active for more than 30 s.

## Thresholds (any one trips an alert)

| Signal | Alert when |
|---|---|
| Postgres statement timeouts (65 min) | > 0 |
| PostgREST 500/504 (65 min) | >= 5 |
| Any canary query | > 3,000 ms (the `authenticated` role's `statement_timeout` is 30 s, a role setting PostgREST applies; `authenticator` logs in at 8 s and `anon` at 3 s — confirmed 2026-09-19) |
| Active query age | > 30 s |
| The canary itself cannot reach the database | always |

An alert run ends with a line starting `WITNESS DB ALERT:` and sends a push
notification and an email to the account owner. An all-clear run sends
nothing.

## Managing it

- It lives in the Routines list of the claude.ai account
  (bicentenial1776@gmail.com), not in this repo. Pause, edit the schedule,
  or delete it there. It fires at :37 past each hour.
- **It needs the Supabase connector attached.** Routines created from a
  Claude Code session cannot carry connectors in this organization, so the
  routine was saved disabled: open it in the claude.ai Routines UI, attach
  the Supabase connector, then enable it. Without the connector every run
  would fail to reach the database and page a false alert each hour.
- The canary never changes the database. When it alerts, the usual first
  moves are: `EXPLAIN (ANALYZE)` the slow query under `set local role
  authenticated`, check `pg_stat_activity`, and check whether a schema
  change landed outside this repo's `supabase/migrations/` (compare
  `supabase_migrations.schema_migrations` against the directory).

## Related debt (performance advisor, 2026-09-15) — closed

After the 2026-09-15 migration the Supabase performance advisor still
reported 50 tables re-evaluating `auth.uid()` per row (`auth_rls_initplan`)
and 72 duplicate permissive policies (`multiple_permissive_policies`).
Closed by `20260917212731_finish_auth_rls_initplan.sql` and
`20260917214208_consolidate_remaining_shared_read_policies.sql` (the files
lived only on a branch until 2026-09-19) and the two FSV policies in
`20260919200000_cost_audit_tuning.sql`. As of 2026-09-19 the advisor reports
neither lint. The full audit is `docs/COST_AUDIT_2026-09-19.md`.
