# GEDCOM media — design brief

*2026-09-05. Status: v1 built (parser, tables, bucket, desktop CLIs, Portrait strip). Overlay onto an existing tree built the same evening.*

## Why

Ancestry's GEDCOM names every photo and record image (1,832 OBJE in Rufus's export) but ships empty FILE lines. Family Tree Maker's export ("Include Media files") writes real paths into its Media folder — 4,444 objects, 1.2 GB, for the same tree. The photos are the prize: the family's faces, the census pages, the Find a Grave clippings. Witness had no way to take them.

## What a GEDCOM says about media

| Context | GEDCOM shape | Count (FTM export) |
|---|---|---|
| Person's portrait | `1 _PHOTO @M..@` (FTM proprietary) or `1 OBJE` + `2 _PRIM Y` (Ancestry) | 614 |
| Attached to a person | `1 OBJE @M..@` | 1,251 |
| Attached to a fact | `2 OBJE` under BIRT/DEAT/RESI… | 44 |
| Record image behind a citation | `3 OBJE` under the fact's `2 SOUR` | ~16,000 |
| Attached to a family / marriage | `1 OBJE` on FAM, `2 OBJE` under MARR | 0 in this file |

The parser reads all five (`packages/core/src/gedcom/parser/`), and `media.test.ts` pins the shape.

## Model

- `media` — one row per OBJE record (or inline OBJE), keyed `(tree_id, gedcom_xref)`. Carries the GEDCOM's file path and title, the format, and `upload_status` (`pending` until bytes land, then `complete` with `storage_path`, `byte_size`, `content_hash`).
- `media_links` — one row per attachment, exactly one subject (`individual_id` | `family_id` | `individual_event_id` | `citation_id`), `is_primary` for portraits. A couple's photo links to both people.
- Bucket `tree-media`, private, objects at `{owner_uid}/{tree_id}/{media_id}.{ext}`. Owner read/write; family-sharing members read (migration 20260905180000).

Import writes the rows on every GEDCOM import, mobile included — a phone import records what the file names and leaves every row `pending`. Only the desktop CLI moves bytes.

## Desktop CLI (v1)

```
npm run ingest:ftm -- <tree.ged> <Media folder> [--upload] [--tree-id <id>] [--images|--all]
```

Dry run by default: parses, matches FILE paths to the folder (full path first, then basename), and reports selected / missing / unreferenced counts and bytes. `--upload` imports the GEDCOM as a **new tree** and uploads the selected files; `--tree-id` resumes uploads for a tree this CLI already imported. Profiles: primary portraits (default), `--images`, `--all`. Originals are uploaded as-is; no resizing yet.

## Display (v1)

Portrait page, below the stone: "PHOTOS FROM YOUR TREE FILE", a horizontal strip of the person's own attached images, portrait first, uploaded-only, signed URLs. Quiet on the saved field copy.

## Overlay onto an existing tree (v1)

```
npm run overlay:ftm -- <tree.ged> <Media folder> --tree-id <existing tree> [--write] [--images|--all] [--report <path>]
```

Rufus's real tree carries verdicts, notes, stones, and family shares; a re-import orphans them. The overlay leaves the tree alone and attaches the FTM file's photos to the people already there. FTM's export has no `_UID`, so people are matched by name and years (`packages/core/src/gedcom/personMatch.ts`): tiers run strict to loose (name + both years, nickname-folded, name + birth, name only), each tier only pairs keys unique on **both** sides, and years or sexes that conflict are never paired. Two "Israel Hill 1719–1777" on the FTM side stay unmatched rather than guessed; `--report` lists them.

First run against the Howe/Field tree (5,611 FTM people vs 5,529 in Witness): 5,189 matched (4,663 on name + both years, 519 on name alone), 1,758 of 1,865 person-level attachments land, 549 of 606 portraits.

v1 carries **person-level** media only (portraits and photos on the person). Idempotent: media rows key on `(tree_id, gedcom_xref)`, links are skipped when the pair exists, completed uploads are left alone.

## Not built, decided direction

- Fact- and citation-level record images (the 16k) need event/citation matching on the existing tree, then surface beside the source on the Portrait's sources tab.
- `.htm` clippings (190, Find a Grave and book bios) as text into notes, not as files.
- Resizing (2048 web + 400 thumb), hash dedupe across trees.
- A "Send to Witness" companion for the MacKiev pitch grows from these CLIs.
