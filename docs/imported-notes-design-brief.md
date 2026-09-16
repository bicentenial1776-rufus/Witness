# Imported notes — a design brief

*2026-09-16. Prompted by Rich Douglass, whose 61,773-person PAF export
arrived without the notes he had written on people over decades. His research
had told him notes were not part of the GEDCOM standard; they are, and his
made the trip. Witness read them and dropped them. This brief is the plan to
stop doing that. Four decisions at the end are Rufus's and still open; the
build waits on them.*

## What this is

A person-level GEDCOM note (`1 NOTE` directly under an individual, inline or
as a pointer to a shared `NOTE`/`SNOTE` record) comes through the import and
appears on that ancestor's page as **"From your file"** — read-only, in the
file's own order, kept apart from Betsey's box. Alongside it, one cosmetic fix
that rides the same change: custom-fact labels that arrive URL-encoded
(`Death+of+sister+`, `Will%2FProbate`) decode to plain text.

## The ground truth (scout pass, 2026-09-16)

- **The spec has always had notes.** GEDCOM 5.5 / 5.5.1: `NOTE` under a
  person, family, or event, either inline (continued over `CONT` / `CONC`
  lines) or a pointer to a top-level `NOTE` record. GEDCOM 7.0: the same,
  with shared records renamed `SNOTE`. Every genealogy program exports them.
- **The parser already reads them.** `packages/core/src/gedcom/parser/individual.ts:155`
  collects every `NOTE` / `SNOTE` on a person, resolves shared-record
  pointers (`parser/records.ts`), and `parser/tree.ts` stitches `CONT` /
  `CONC` back into whole text. Each parsed person carries `notes: string[]`.
- **The import discards them.** `packages/core/src/supabase/transform.ts`
  never reads `notes`, and `individuals` has no column for them. Parsed and
  dropped in the same breath.
- **Event-level notes survive.** A `NOTE` under an `EVEN` / `OCCU` becomes
  the event's `detail`. Rich's tree has 1,652 of these — obituaries, will
  extracts, a "Circumstances of Death" — which is how we know his export
  included notes at all. (His original file is not on our servers: the vault
  is iOS-only, and even there it is encrypted with a key only his device
  holds. "We cannot read it" applies to support too.)
- **Two artifacts in his file, neither ours to fix:** 34 details are cut at
  exactly 253 characters, mid-word — whatever wrote the file clipped at the
  255-character line limit instead of continuing on `CONC`; nothing in our
  parser, transform, or schema truncates. And 230 labels are URL-encoded,
  the fingerprint of Ancestry.com's GEDCOM export, so his data passed
  through Ancestry at some point before or after PAF.

## Why a separate table, not the annotation box

`ancestor_notes` (Betsey's box, 2026-08-20) is the obvious home and the wrong
one. Three facts from the code settle it:

1. It is **one row per user per person** (`unique (user_id, individual_id)`,
   8,000-character cap). Rich's people carry several notes each, and PAF
   notes run long.
2. The refresh path (`packages/core/src/pulse/refresh.ts`) **carries**
   `ancestor_notes` across a re-import by re-pointing rows — it treats them
   as the reader's own words, which they are. Imported notes are the
   opposite: they must be **regenerated** by the new file, never carried. One
   table holding both would have to tell them apart on every refresh.
3. Companions (family sharing, 2026-08-30) get **no policy** on
   `ancestor_notes` — it is a work surface. Imported notes are part of the
   record, so they can follow the reading tables' policy instead.

Different lifecycle, different visibility, different cardinality: different
table. The payoff is that **the refresh code needs no changes at all** — new
file in, new notes in, old tree retires with its old notes under the cascade.

## The build

### 1. Schema — one migration

```sql
create table individual_notes (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  individual_id uuid not null references individuals (id) on delete cascade,
  position      smallint not null default 0,   -- order in the file
  content       text not null
);
create index individual_notes_individual_idx on individual_notes (individual_id);
create index individual_notes_tree_id_idx on individual_notes (tree_id);
create index individual_notes_user_id_idx on individual_notes (user_id);
```

- **No length cap.** The 8,000 on `ancestor_notes` is for a typing box; a
  file is what it is.
- **RLS mirrors `individuals`** in the consolidated single-SELECT shape of
  the 2026-09-15 disk-IO migration: `(select auth.uid()) = user_id or
  tree_id in (select member_tree_ids())` to read; owner-only insert /
  update / delete with `is_tree_owner(tree_id)`. (Decision 1 below can
  narrow this to owner-only.)
- **Cascades from `individuals`**, so `delete_tree_batch` and the refresh's
  `retireTree` need nothing new.
- `database.types.ts` is hand-maintained (the `import_status` commit edited
  it directly); the new table goes in by hand.
- Applied through the Supabase MCP tool and then captured into
  `supabase/migrations/` as the 2026-09-15 migration was, so the repo keeps
  carrying every migration the database has.

### 2. Parser — one small change

Notes need nothing. The label fix goes in `parseDetailedEvent`
(`parser/individual.ts:43`): decode `TYPE` — `+` to space, then
`decodeURIComponent` inside a try/catch (a stray `%` must never fail an
import), trim. A test beside the existing custom-facts test in
`gedcom/__tests__/parseGedcom.test.ts:106`.

Out of scope, noted for later: family-level notes (`NOTE` under `FAM`).
`parser/family.ts` does not read them today and there is no family page to
show them on.

### 3. Transform and import

- `transform.ts`: `ImportPayload` gains `individualNotes:
  IndividualNoteInsert[]`, built from each parsed person's `notes` with
  `position` as the index. Empty strings are already filtered upstream.
- `import.ts:146`: `['individual_notes', payload.individualNotes]` joins the
  table list directly after `individual_events` (it depends only on
  `individuals`). Progress totals, batch splitting, retry, and the
  "where it stopped" error all pick it up unchanged — that is what the
  table list is for.
- Tests: `supabase/__tests__/transform.test.ts` (notes land with the right
  individual id, in order) and `supabase/__tests__/import.test.ts` (the
  table appears in the write sequence).

### 4. The ancestor page

`apps/mobile/src/app/(app)/ancestor/[id].tsx` — a read-only block in the
story panel, **above** Betsey's box (the file's voice, then the reader's),
rendered only when the person has notes:

- Eyebrow `FROM YOUR FILE` in mono per the visual system; body in serif;
  several notes separated by a hairline rule, in `position` order.
- Long notes clamp at roughly eight lines with a "Read the rest ›" toggle —
  some of Rich's will be pages long.
- One query, `individual_notes` by `individual_id` ordered by `position`,
  loaded with the other per-person reads — never through the tree index;
  these are page-scoped.
- Both carriers, phone and Broadsheet, since it sits inside the same panel.
- **Not** passed to `shareStory`, and **not** read by the story writer — the
  posture Betsey's box set on 2026-08-20: the story stays documented-facts-
  only. (Event-level notes already reach the story arc through `detail`;
  that is existing behavior and this brief does not change it.)

### 5. Getting Rich's notes in

Once shipped, he uploads the same file. `findRefreshTarget` matches on tree
name when there is no vendor tree id, and his tree is named after the file,
so the import screen offers **"Update from a newer file"** as the primary
path. The numbers on that route for a 61k tree:

- The refresh preview runs `fetchTreeHealthData` on both trees — the fetch
  PR #23 moved to keyset pagination, so it now answers where it used to time
  out.
- `retireTree` loops `delete_tree_batch` at 400 people per call under a hard
  cap of 400 calls: about 155 for his people plus 23 for places. Fits — but
  a 150,000-person tree would not. `you.tsx` already scales that cap to the
  tree (the 2026-09-15 import commit); `refresh.ts` should too. One line,
  included here.
- The 34 notes truncated at 253 characters come in truncated. That is the
  file; only a fresh export from his software can restore them.

### 6. Sequence

1. Migration and `database.types.ts`
2. Transform, import, tests
3. Parser label decode and test
4. Ancestor page block
5. Typecheck, core tests, web export; OTA update. No edge-function deploy —
   nothing server-side reads the new table.
6. Rich re-imports

Roughly a day, most of it the page block and its tests. Nothing here touches
PR #23's files, so it lands independently.

## Decisions for Rufus

1. **Do companions see imported notes?** Planned: yes — they are record, not
   work. A no makes the RLS owner-only, like `ancestor_notes`.
2. **Living people.** The page is already owner-gated and share links never
   carry notes, so the plan leaves imported notes on living people visible to
   the owner. Keep, or hide entirely?
3. **Placement** — above Betsey's box (planned) or below it?
4. **Refresh preview** — add "N notes from your file" to the pulse summary,
   or leave the preview alone for v1?
