# Database cost & pipeline audit — 2026-09-19

Answers the brief in `~/Downloads/witness-cost-audit-brief.md`, measured on
production (project `bdjsahbjptpcmouqozvs`) through the management API,
`pg_stat_statements` (cumulative since 2026-07-01), `cron.job_run_details`,
the Prometheus metrics endpoint and `EXPLAIN (ANALYZE, BUFFERS)`. The tuning
applied the same day is `supabase/migrations/20260919200000_cost_audit_tuning.sql`
plus the keyset rewrite of `supabase/functions/match-records/index.ts`.

## The numbers the brief asked for

| | |
|---|---|
| Plan / compute | Pro; **Large** add-on since 2026-09-18 (2 dedicated cores, 8 GB, ~$111/mo). Every code comment saying "Micro" predates that. |
| Postgres | 17.6, `shared_buffers` 2 GB, `effective_cache_size` 6 GB, `work_mem` 12 MB, `max_connections` 160 |
| Statement timeouts | `authenticated` **30 s** (role setting; PostgREST applies it), `anon` 3 s, `authenticator` 8 s. `docs/OPS_DB_CANARY.md` said 8 s; the observed max for authenticated queries is 28.5 s, so 30 s is the effective value. |
| PostgREST `max_rows` | 10,000 |
| Database size | 1.42 GB before today's migration, 1.31 GB after; cache hit 99.95 % heap / 99.85 % index |
| Rows | 64 users, 20 trees, 180k individuals, 433k events, 129k places, 466k citations, 94k relationships |
| Disk | `/data` 31.7 GB (29.8 GB free) after the 09-19 resize |
| Egress | **Not exposed by the management API.** The `edge_logs` `content_length` header is absent on chunked REST responses, so it cannot be summed from logs either. Read it in the dashboard: Settings → Usage → Egress. The one measurable proxy is below. |
| Storage egress (7 days, from `edge_logs`) | 251 MB over 660 `/storage/v1` requests (tree media) |

## Pipeline map

Each step: (a) once-per-record or repeated, (b) synchronous or backgrounded,
(c) cached or recomputed.

| Step | Where | (a) | (b) | (c) | Notes |
|---|---|---|---|---|---|
| GEDCOM parse | client (phone / browser tab), `packages/core/src/gedcom` | once per upload | sync in the tab, minutes on big files | rows written once, never re-parsed | `trees.import_status` + 20 s heartbeat + delete guard (09-16/17) |
| Store | `packages/core/src/supabase/import.ts`, batches of 500 | once | sync | — | the heaviest write path; index count matters here |
| Geocoding | pg_cron every minute → `geocode-pending` → Nominatim (there is **no GeoNames**) | once per place; answered misses stamped | background | `places.latitude/longitude`; cross-tree reuse by `raw` | 84,900 runs, 2,863 in the last 48 h, all 200. Its two reads were the #1 and #8 statements in the DB by total time — fixed today (below) |
| Nearby (web) reverse geocode | `nearby.web.tsx` | per position change | on render | **not cached** | small volume; leave |
| Sanborn | `sanborn-block.tsx` → `sanborn-lookup` | per place render | edge call on render | LOC hit cached in `sanborn_place_cache` | edge invocation per render is the only cost |
| NARA | pg_cron `*/10` → `nara-enrich` | once per person | background | `nara_documents`, `nara_enrichment_state`, monthly budget 7,000 | 133,890 people unexamined; candidate pick ~190 ms per run |
| VA burials, obituaries (Chronicling America) | pg_cron every 10 min | once per person | background | `person_register_links` + `register_ticks` | 888 / 889 runs, all 200 |
| AAD, Crossing library | `match-records` on import (202 + waitUntil) and 6-hourly sweep | once per tree, re-run on re-import | background | `passenger_candidates`, `person_register_links` | its five page loops were OFFSET-based; keyset as of today |
| Their World / Their Story | `generate-historical-context`, `generate-biography` | once per person per prompt version | **sync in the request** (Wikidata + loc.gov 8–30 s + Anthropic) | `enrichment_cache`; owner delete invalidates | auto-fires on tab open for every uncached deceased person. 903 cached rows; 14 model calls in the last 14 days. No per-tree budget. |
| Digest note, story arcs, synthesis | nightly `featured-today` warmer + on demand | once per day / per founder / per tree size | background (warm) or sync (miss) | `enrichment_cache`, `story_arcs`, `tree_syntheses` | 55 warmer runs, all 200 |
| Tree index (Tree, Explore, Generations, FSV rooms, …) | `fetchTreeIndex`, five keyset reads at 10k/page | **per session per tree** | sync | disk copy stamped with `imported_at` (IndexedDB on web) | 61k tree = **63 MB JSON** per cold fetch (12 MB people, 34 MB events, 7 MB places, 6 MB children, 4 MB families); all trees 177 MB. This is the egress driver, not AI. `library-cache.ts` keeps its own copy and can fetch it a second time. |
| Tree Health / Orphan Records | `precompute-audit.mts` every 10 min from ops-watch | once per import | background | `tree_health_findings`, `orphan_records` | fallback computes in the browser until the next tick |
| Family graph / relationships | `compute-relationships` edge fn | once per home person | **sync**, hits the edge runtime limit on large trees | `relationships` | still item 1 on the 09-17 list |
| Search | `search_people` (SECURITY DEFINER, trigram) | per keystroke | sync | — | 1,775 calls, mean 2.0 s, max 28.5 s — the next query to look at |

Every pg_cron job is proven live by `cron.job_run_details` (13 failures total,
all during the 09-17 Micro overload) and by `net._http_response` (469
responses in the last 6 h, all 200/202). `send-digest-emails` last ran
2026-09-13 13:00 UTC, on its weekly schedule.

## What was wrong, and what changed today

**1. The geocode worker was the most expensive thing in the database.**
Its pending-places read ran 83,141 times for 5.4 h of execution, reading
15,541 buffers a call to find, nearly always, zero rows — a sequential scan
of every place because nothing indexed `geocoded_at is null`. Its "already
resolved elsewhere" read (`raw = any(...)`) fell back to the trigram index:
7,706 calls at 932 ms. Now: partial index `places_pending_geocode_idx`
(9 buffers, was 7,071) and `places_raw_geocoded_idx` (index-only, 0.15 ms,
was 14 ms on a warm cache and 932 ms in production).

**2. Three generations of indexes on the same columns.** The 09-15 disk-IO
fix, the 09-15 incident fix and the 09-17 covering indexes each added a
`tree_id`-leading index on individuals, individual_events, places and
families. The covering index answers everything the two narrower ones did,
so eleven indexes (≈120 MB) were pure write amplification on the import path.
Dropped; a 10k-row tree-index page is still an Index Only Scan afterwards.

**3. Four migrations existed only on production** (the RLS finish-up of
09-17, the on-this-day index, the failed-import cleanup cron). Their files
were on the unmerged branch `claude/witness-login-error-iu5fg5`; they are in
`supabase/migrations/` now and `supabase migration list` shows no mismatch.

**4. Advisor findings**: the two FSV policies re-evaluated `auth.uid()` per
row; three `user_id` foreign keys had no index; two trigger functions had a
mutable `search_path`; and PUBLIC's default grant let `anon` execute every
SECURITY DEFINER function. `anon` now keeps exactly `get_invite` and
`get_share` (the join and shared pages call them before sign-in; verified
after the change). Remaining lints are by design (RPCs callable by
`authenticated`, ticket tables with no policy) or dashboard toggles (leaked
password protection).

**5. `match-records` paged with OFFSET.** Its citations read cost 142k
buffers a call on the 61k tree (3,397 service-role calls, 1,026 s). All five
loops use `fetchAllPages` keyset paging from `_shared/family/paginate.ts`
now; deployed 2026-09-19.

## The open items, and what happened to them (same evening)

1. **Tree index as a snapshot, not a query — done.** Migration
   `20260919210000_tree_index_snapshots.sql`: bucket `tree-index`
   (owner writes and reads, members read), `trees.index_snapshot_at`.
   `packages/core/src/query/treeIndexSnapshot.ts` writes one object per
   import (`<tree_id>/<stamp>.json`, the existing `TreeIndexSnapshot`
   shape) and reads it back through a signed URL. Writers: the importer
   itself (`importParsedGedcom` now returns the index it built from its
   own rows; `import.tsx` publishes it and seeds the device copy, so the
   first whole-tree screen after an import is instant) and
   `scripts/build-tree-index.mts --pending` on the ops-watch tick.
   `tree-index-cache.ts` reads snapshot → device copy → pages; the Library
   shares that cache instead of paging a second time. All 20 trees are
   snapshotted (150 MB in the bucket; the 61k tree is 53 MB, brotli'd 4×
   by the CDN — the project's upload limit was raised from 50 MB to 200 MB
   for it). Measured from a fast machine: 2.7 s for the snapshot vs 4.7 s
   for the pages on the 61k tree; the win in a browser on a phone is the
   ~25 requests and the database's json_agg that no longer happen.
   **Not live for users until the app is committed, `deploy-web` runs and
   an iOS build ships.** The worker side (snapshots, the bucket) is live
   and harmless to old clients.
2. **Compute tier — decision pending Rufus.** After item 1 reaches users,
   trial Medium (~$60, 4 GB shared) with the ops watcher's load and
   timeout signals as the gate; the recorded trigger (CPU > 60 % for an
   hour a day, or pool waits) stays the rule for going back up. The change
   is `PATCH /v1/projects/<ref>/billing/addons` or the Compute and Disk
   page; it restarts the database (~1–2 min).
3. **`search_people` — no change needed.** Timed as the owner on the 61k
   tree after the 09-17 trigram rewrite: 380 ms for "howe", 42 ms for
   "watertown", 18 ms for "mary smith". The 2 s mean was the pre-rewrite
   history in a never-reset `pg_stat_statements`; re-read it in a week.
4. **AI budget — tightened, not new.** A shared per-user daily pool
   already existed (`checkDailyLimit`, all generators): 1,000 a day,
   raised from 20 in July. Now 300 (~150 ancestors' worth of Their World
   + Their Story; a runaway loop stops at ~$4.50), and `generate-biography`
   counts against the shared pool instead of its own biography-only
   count. Seven functions redeployed. Per-user daily counts are on the
   dashboard snapshot (below).
5. **Relationships for large trees — done.** `rebuild-relationships.mts
   --pending` (every owner and member pointer with no rows) runs on the
   ops-watch tick; `home-person.tsx` records only the pointer for trees
   over 20,000 people when the edge function fails and says labels arrive
   within ten minutes, instead of walking 61k people on the phone.
   Precompute-on-import: the index is now published by the importer
   itself (item 1); Tree Health stays on the 10-minute tick.
6. **pg_stat_statements reset** at 19:20 UTC on 2026-09-19; the weekly
   query below now shows the current app.
7. **Egress** still needs a monthly manual read in the dashboard.
8. **Dashboard metrics — data side done.** `gtm.db_health_snapshot()` and
   `gtm.db_health_daily` (witness-dashboard migration 0017, applied) are
   filled by the dashboard's daily sync: database size, index size, cache
   hit, connections, the eight largest tables, top API statements since
   the last reset, every cron job's last run and 24 h failures, pipeline
   backlogs and coverage (snapshots, audits, relationships, geocode,
   NARA budget), AI generations by day and today's top users, tokens, and
   storage by bucket. The panel is the dashboard session's job.
9. Docs still say Micro in `scripts/ops-watch.mjs:23` and
   `packages/core/src/supabase/paginate.ts:40` (historical; harmless).

## Weekly review query

```sql
select round(total_exec_time::numeric/1000) total_s, calls,
       round(mean_exec_time::numeric) mean_ms, round(max_exec_time::numeric) max_ms,
       round((shared_blks_hit+shared_blks_read)::numeric/calls) blks_per_call,
       r.rolname, left(regexp_replace(query,'\s+',' ','g'),120) q
from extensions.pg_stat_statements p join pg_roles r on r.oid = p.userid
where dbid = (select oid from pg_database where datname = current_database())
order by total_exec_time desc limit 20;
```

`pg_stat_statements` has not been reset since 2026-07-01, so retired query
shapes (the pre-09-17 `family_children` join, OFFSET pages) still sit near
the top. Reset it once (`select extensions.pg_stat_statements_reset()`) at
the start of the next weekly review so the table shows the current app.
