# SPEC: Refresh that keeps the photos (and the six things Rufus's refresh surfaced)

*Rufus's scenario (2026-09-12): he exported a fresh GEDCOM from Family Tree
Maker, chose "Update from a newer file" on his Howe/Field tree, and the
refresh worked exactly as designed — briefs, verdicts, notes and the share
link came across. But every photo and record image vanished (1,556 files we
had just uploaded), the desktop overlay had to be re-run to put them back,
it died once on a Gateway Timeout, 296 people could not be matched by name,
and the first Life & Times he opened afterwards flashed "Invalid token"
before the story appeared. He will not be a one-off: FTM is the only
mainstream tool that exports media alongside the GEDCOM, and the people who
use it are exactly the serious researchers Witness is for.*

Status: **post-freeze candidate (Phase 2).** Nothing here ships before
`main@257c41a` is released. Builds on
[`docs/gedcom-media-design-brief.md`](../../docs/gedcom-media-design-brief.md)
(v1 model and CLIs) — this spec does not re-decide that model.

## What the code does today (traced 2026-09-12)

**Refresh.** `packages/core/src/pulse/refresh.ts` is import-then-swap: the new
file is imported as its own tree, then briefs, notes, corrections, NARA
verdicts, share links, printed findings and health marks move across, and the
old tree is deleted. `diffTrees` (`pulse/diff.ts`) pairs people **by xref
only**. FTM xrefs are stable across exports (5611/5611 on Rufus's file), so
this is fine FTM→FTM; Ancestry→FTM shows "5619 added / 5529 removed" because
the IDs changed, and the preview offers no fallback. Media is not in the carry
list at all — `media` and `media_links` rows are keyed by `tree_id`, the old
tree's rows go with it, and the bucket objects at
`{owner_uid}/{old_tree_id}/…` are orphaned.

**Media ingest.** Every import writes `media` rows (`pending`) and
`media_links` for all five GEDCOM attachment shapes. Only the desktop CLIs move
bytes (`ingest:ftm`, `overlay:ftm`). `overlay-ftm-media.ts` matches people by
name + years (`gedcom/personMatch.ts`), then `lib/ftm-media.ts:uploadMedia`
uploads sequentially, marks each row `complete` with `content_hash`, and
**throws on the first failed metadata update** — no retry, no resume beyond
"skip rows already complete." The upload profile is `primary` | `images` |
`all`; `images` takes person-level image attachments only. Citation-level
record images (level-3 OBJE under a SOUR) are imported as rows but never
linked to a person and never uploaded by the `images` profile.

**Reading.** `supabase/functions/read-media` (cron every 10 min) reads only
`upload_status = 'complete'` image formats; a `failed` reading is never
retried.

**Life & Times.** `ancestor/[id].tsx:useEnrichment` (lines 245–301) does a
cache lookup on mount that reads `data` and **ignores `error`**; on `'none'`
the Life & Times tab auto-invokes `generate-biography` (lines 1137–1147) and
`_shared/enrich.ts` (Their World). Both Edge Functions call
`db.auth.getUser()` with the caller's token and return `401 {error:
'Invalid token'}` on failure; `lib/research-brief.ts:invokeError` surfaces
that server string verbatim. The client is `autoRefreshToken: true` with a
60-minute JWT (`jwt_exp: 3600`); the refresh timer does not run in a sleeping
browser tab.

## Evidence from the account (tree `4d30ac68…`, 2026-09-12)

| Measure | Value |
|---|---|
| People | 5,619 (552 with no birth or death year) |
| Media rows | 4,432 — 1,556 `complete`, **2,876 `pending`** (2,627 jpg, 190 htm, 23 pdf, 10 doc, 7 docx, 7 txt, 3 j2k, 2 rtf) |
| People with photos after overlay | 840 |
| Overlay match | 5,323 of 5,619 (4,801 exact, 522 name-only); **296 unmatched**, 40 of them with photos |
| Overlay run | died at 405/1,556 on `Gateway Timeout` in the metadata update; succeeded on the 4th external retry |
| Media readings | 180 read, **9 failed** (never retried) |
| Enrichment cache | **1 row** for the whole tree (Elvira Wheeler, written 12:10 UTC) — every other ancestor pays a fresh generation on first open |
| Carried by refresh | 10/13 crossing verdicts, 2/3 corrections, home person, share link; 0 media |
| Health marks / syntheses / NARA candidates | 0 / 0 / 0 (nightly jobs had not yet rebuilt them) |

**Elvira Wheeler (I318, 1820–1901)** is the worked example. Nine events, all
placed and geocoded; wife in one family (4 children), child in another; a
good story. Yet 0 media in Witness against **40 attachments in the FTM
file** — every one a citation-level record image (1860 census `M2084`, MA
vital records `M2645`, 1901 death index `M2644`), all present as `pending`
rows, none linked to her, none readable. Her story was written from events
alone; the readings that enrich other people do not exist for her.

## Design

Six pieces, ordered by value per line of code. 1 is a bug fix that should
ship in the first post-freeze patch; 2–4 are the FTM-media workflow proper;
5–6 are cheap follow-ons.

### 1. Life & Times must not trust a stale token

Symptom: "Invalid token" flashes, then the story appears. Cause: the cache
lookup fails silently on an expired JWT, the tab concludes there is no story,
auto-generates, and the Edge Function rejects the same token. Cost: a paid
regeneration of a story that already exists, for every user who leaves a tab
open more than an hour.

- `useEnrichment` cache lookup: read `error`. On any error set a new state
  `{ name: 'unavailable' }` and **do not** fall through to generate.
- Before `functions.invoke`, `await supabase.auth.getSession()`; if the
  session's `expires_at` is within 60 s, `await supabase.auth.refreshSession()`
  first. Wrap in a tiny `withFreshSession(fn)` in `lib/supabase.ts` and use it
  for every Edge Function call in the app (biography, world, brief, read-media
  triggers, grave-captures).
- On a 401 from invoke, refresh once and retry once. Only then surface an
  error — and map `'Invalid token'` / 401 to *"Reconnecting… tap to retry"*,
  never the server string.
- Edge Functions keep returning 401; the message is fine server-side.

Acceptance: leave a web tab idle 65 min, open Life & Times on an ancestor with
a cached story → the story renders with no error and **no** `generate-*`
invocation in the function logs.

### 2. Refresh carries media

Media belongs to the file and the user, not to a tree row. Key it that way.

- `media` gains `owner_key = (user_id, content_hash)` semantics: on refresh,
  for every `complete` row in the old tree whose `gedcom_xref` also exists in
  the new tree, copy `storage_path`, `byte_size`, `content_hash`,
  `upload_status='complete'` onto the new tree's row and **move the bucket
  object** (`storage.move` to `{owner_uid}/{new_tree_id}/{new_media_id}.ext`)
  instead of orphaning it. Rows with no xref match but a `content_hash` match
  on the new tree (same bytes, renamed) carry the same way.
- `media_links` need no carry: the new import rewrote them from the file.
  What must survive is the **bytes**, which is exactly what the old carry
  dropped.
- Refresh preview gains a line: *"1,556 photos and documents will come
  across."* If the new file references media the old tree never uploaded, the
  preview says so and the post-refresh Home card (see 3) offers to bring them.
- The old tree's remaining bucket objects are deleted with the tree (today
  they leak).

Acceptance: refresh Rufus's tree with a re-export → `complete` count and
`people with photos` unchanged; bucket usage unchanged; overlay re-run reports
"0 added, N already present."

### 3. Bring-your-photos on the web app (the overlay, productised)

The desktop CLI is the prototype. The product step runs in the browser
(`app.witnesslives.com`), since phones cannot see an FTM Media folder.

- Home card after any FTM-shaped import (`SOUR FTM` in the header, or any
  `FILE` line with a real path): *"Your file names 4,432 photos and
  documents. Bring them in?"* → a folder picker (`showDirectoryPicker` /
  `<input webkitdirectory>` fallback).
- Matching is by **FILE path** first (full path, then basename), the same as
  `ftm-media.ts:selectFiles`. Name+years matching is only needed when
  overlaying onto a tree imported from a *different* file; the web step
  imports and attaches from the same file, so xref is exact. Keep
  `personMatch.ts` for the overlay-onto-other-file case and add a
  nickname/maiden-name fold (the 296 unmatched are dominated by these).
- Upload runs client-side in a worker, **8 files in flight, exponential
  backoff, per-file retry ×5**, writing `upload_status` per file. A failed
  file becomes `failed` with `last_error`, never a thrown script. Closing the
  tab and coming back resumes from the rows, not from a log.
- Resize on the client before upload: 2048 px long edge for the stored
  original of photos, 400 px thumbnail as a second object; record images
  (citation-level) keep full resolution because they are read by the model.
- Progress lives on the Home card ("1,203 of 4,432 · 2 failed · Retry") and
  the same row drives the read-media queue.
- GEDZIP (`.gdz`) is accepted as a single upload: it is a zip with the GEDCOM
  and the media folder inside.

### 4. Record images reach the person

The 2,876 pending rows are mostly citation-level census/vital-record scans —
the richest evidence in the file, and today invisible.

- Upload profile default becomes **`all` images**, not `primary`. Text-ish
  attachments (`htm`, `txt`, `rtf`, `doc`, `docx`) are extracted to text into
  the citation's note (per the design brief), not stored as files. `pdf`
  stored as-is, not read (yet).
- `media_links` already carries `citation_id`. Surface on the Portrait's
  sources tab: each source row shows its record image thumbnail; tapping
  opens the scan. Life & Times' RELATIVES/evidence brief gains
  *"record images: 1860 census, 1901 death index"* so the writer can cite
  them, and `read-media` is allowed to read citation-level images when the
  citation is attached to the person (cap 6 per person per run to bound cost).
- Acceptance on Elvira: sources tab shows three thumbnails; her regenerated
  story (prompt v3) references the 1860 household.

### 5. Retry failed readings; prime the story cache

- `read-media`: rows with `status='failed'` and `attempts < 3` are retried on
  the next tick with a 1-h backoff. Store `attempts` and `last_error`.
- After import/refresh, a `prime-stories` job generates biographies for the
  home person's **direct ancestors to four generations** (≈30 people) in the
  background, cache-first, over the following hour. Life & Times then opens
  instantly for the people a new user looks at first, and the token race in
  (1) has nothing to trigger.

### 6. Refresh preview: name+years fallback

For the Ancestry→FTM (or any cross-tool) switch, when xref pairing yields
<50 % matches, run `personMatch.ts` as a second pass and present the honest
number: *"Matched 5,189 by name and dates; 340 could not be paired — their
briefs and verdicts will not carry."* Today the preview says "5619 added /
5529 removed" and the user must trust a chat message that it's fine.

## Out of scope

- Ancestry's empty `FILE` lines: no bytes exist to bring; the Ancestry
  "download all media" path is a separate spike.
- iOS media upload from Files.app: possible with `expo-document-picker` on a
  folder, but the FTM Media folder lives on a Mac/PC; web first.
- Cross-tree hash dedupe (same photo in two users' trees) — later.

## Order of work

| # | Piece | Size | Ships |
|---|---|---|---|
| 1 | Fresh-token invoke + silent-cache fix | S (1 day) | first post-freeze patch |
| 2 | Refresh carries media | M (2–3 days, migration + refresh.ts + preview copy) | Phase 2a |
| 3 | Bring-your-photos web step (resumable, resized) | L (1–2 weeks) | Phase 2a |
| 5 | Reading retries + story priming | S (1–2 days) | Phase 2a |
| 4 | Record images on sources tab + in the brief | M (3–5 days) | Phase 2b |
| 6 | Name+years fallback in refresh preview | S (1 day) | Phase 2b |

Until 2 and 3 ship, the operator runbook stays:
`npm run overlay:ftm -- <ged> <Media dir> --tree-id <id> --write --images
--report <path>` in an external retry loop, then `--all` once (4) exists.
