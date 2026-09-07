# Usage Monitoring

**Added:** September 2026, from Rufus asking to monitor logins, feature
use, GEDCOM file sizes, and API calling patterns.

First-party operational logging only — no third-party analytics vendor
(PostHog, Amplitude, Mixpanel, Segment). The served policy is `apps/preview-site/privacy.html`
(witnesslives.com/privacy, the page the app links to); `docs/privacy.html`
is a stale copy kept in step. It publicly said
"no analytics or crash-reporting trackers"; that line has been updated to
describe honestly what this adds — see "Usage and diagnostics" there. The
distinction that keeps the old promise intact in spirit: nothing here is a
third-party tracker shipping data off Witness's own systems, nothing is
sold, shared, or used for advertising, and no feature in the app reads it
back. It exists for one reader only — the operator, via Supabase Studio's
SQL editor or the service role — the same posture as a server access log.

## Two feeds, deliberately kept separate

### 1. `usage_events` — a new table, for moments with no existing home

Migration: `supabase/migrations/20260907120000_usage_events.sql`.

```
usage_events
  id, user_id (nullable), event_name, properties jsonb,
  source ('client' | 'edge_function' | 'cron'), created_at
```

RLS has an insert policy only (`auth.uid() = user_id`) — a signed-in
device can log its own moments, but there is no select policy, so nothing
in the app ever reads this table back. Query it as the operator only.

**What logs to it today**, via `apps/mobile/src/lib/usage-events.ts`
(`logEvent(userId, eventName, properties)` — fire-and-forget, swallows its
own errors so a logging failure can never interrupt the action it's
attached to):

- `login` — `apps/mobile/src/auth/session-provider.tsx`, on Supabase
  Auth's `SIGNED_IN` event. A session restored from storage on cold start
  arrives as `INITIAL_SESSION` in auth-js 2.x, so this counts real
  sign-ins (password, Apple, magic link) — not every app open. An "app
  opened" event is the obvious next one if opens matter more than
  sign-ins. `SIGNED_OUT` isn't logged: by the time it fires, the client's
  own token is already cleared, so an insert would fail RLS.
- `gedcom_import_completed` / `gedcom_import_failed` —
  `apps/mobile/src/app/(app)/import.tsx`, with `bytes` (the picked file's
  raw size), person/family/place counts, parse-warning count, whether it
  was a refresh, and the detected provider (Ancestry, FamilySearch, etc).

**Not yet instrumented, by design** — feature-tap events (which screens
people actually use: the Relatives-by-Kind filter, At the Stone, One
Generation at a Time) were left for a follow-up pass rather than guessed
at blind. The helper is ready; wiring up a specific tap is a one-line
`logEvent(userId, 'relatives_by_kind_opened')` call at the point of
interest. Tell Claude which screens you want signal on next.

### 2. Closing the AI-cost gap on two existing tables, instead of a second ledger

`enrichment_cache`, `story_arcs`, and `tree_syntheses` already recorded
`model` + `input_tokens` + `output_tokens` per AI call — Rufus's original
"daily AI budget" work already put this bookkeeping in place, it just
wasn't surfaced. Two tables had a gap:

- `research_briefs` recorded `model` but not tokens.
- `grave_captures` (headstone reads, "At the Stone") recorded neither.
- `media_readings` (reading the media, 2026-09-06) recorded `model` but not
  tokens; the desktop text extraction rows (`model = 'text-extraction'`)
  cost nothing and are left out of the ledger.

Rather than open a parallel `usage_events`-shaped table for AI calls too,
the migration adds the missing columns to those two tables
(`supabase/functions/generate-research-brief/index.ts` and
`supabase/functions/read-headstone/index.ts` now populate them), and adds
one view, `ai_usage_daily`, that reads all six tables as one ledger:

```sql
select * from ai_usage_daily
where created_at >= now() - interval '7 days'
order by created_at desc;
```

The view is declared `with (security_invoker = true)` — it enforces each
underlying table's own "read your own rows" RLS policy for whoever queries
it, rather than running with the view owner's rights. The service role
bypasses RLS as usual and sees everything.

**Not covered on purpose:** Nominatim geocoding and the NARA archive
lookup are both server-side cron workers, not actions any one user takes —
`geocode_ticks` and `nara_api_calls` already track their own run-level
pacing against provider rate limits. Per-user attribution wouldn't mean
anything there; this is genuinely infrastructure, not user activity.

## Answering the questions that prompted this

- **Logins**: `select date_trunc('day', created_at), count(*) from
  usage_events where event_name = 'login' group by 1 order by 1;`
- **GEDCOM file sizes**: `select created_at, properties->>'bytes',
  properties->>'individual_count' from usage_events where event_name =
  'gedcom_import_completed' order by created_at desc;`
- **API cost by day**: `select date_trunc('day', created_at), kind,
  sum(input_tokens), sum(output_tokens) from ai_usage_daily group by 1, 2
  order by 1 desc;`
- **Feature use**: nothing yet — see "not yet instrumented" above.

## Deliberately not built yet

- **A dashboard UI.** The four queries above, saved in Supabase Studio,
  answer the questions that motivated this. Build a real screen only once
  it's clear which numbers get checked often enough to be worth it.
- **Retention/pruning.** `usage_events` has no cap. Fine at beta scale;
  revisit if it grows large enough to matter (a daily rollup table,
  keeping raw rows for ~90 days, is the standard fix).
