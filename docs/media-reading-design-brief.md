# Reading the media — design brief

*2026-09-06. Status: planned, not built. Rufus: "The new media has lots of photos of notes, stories, etc. If we used the OCR we built for At the Stone, we could extract that data and use it for story formation. It would have to run at first, then only when new media appears with refreshes."*

## What we have

The overlay put 1,747 media rows on the Howe/Field tree, linked to 848 people. By type: about 1,500 images (most portraits, but also letters, notes, clippings, record pages, house and headstone photos), 190 `.htm` clippings (Find a Grave memorials and county-history bios), 23 PDFs, and a dozen Word and text files. Every row carries a content hash, and every image's bytes are in the private `tree-media` bucket. Today all of it is a picture: the app shows it and knows nothing about what it says.

At the Stone already does the hard part. `read-headstone` downloads photos from a private bucket with the admin client, sends them to Claude as base64 images, gets back a structured reading with a confidence, and hands the user a confirm-or-walk-back. That function is the template.

## The rule that keeps this honest

**A reading is evidence, never a fact.** Readings live in their own table with the model and prompt version that produced them and a confidence. They never write into a person's record. Where a reading says something the record does not, the story may quote it as "a note in the family file says", and a finding may surface it, but the record is untouched until the user acts, the At the Stone pattern. Witness is never the source of truth.

**The living-person rule holds.** A document linked only to living people is read for the owner's eyes and never enters a story prompt. Names of living people inside any transcript are never quoted in generated text.

## Data model

`media_readings` — one per media row, keyed by `content_hash` so a file is read once for life.

| column | meaning |
|---|---|
| media_id, tree_id, user_id | ownership, same RLS shape as media |
| content_hash | the unit of "already read" |
| kind | `portrait` · `group` · `house` · `headstone` · `document` · `letter` · `clipping` · `record` · `map` · `other` |
| transcript | the text, verbatim where legible, `[illegible]` where not |
| summary | two or three sentences in plain words |
| mentions | jsonb: names, dates, places the reader found, each with the span it came from |
| confidence | high / medium / low, the reader's own estimate |
| status | `pending` → `read` → `confirmed` or `rejected` by the owner; `failed` with a reason |
| model, prompt_version, read_at, confirmed_at | provenance |

Text-bearing files (`htm`, `pdf`, `txt`, `doc`, `docx`, `rtf`) get a reading too, with `kind` set from the source and `confidence: high`, since no OCR is involved.

## The queue

The same shape as the geocoding worker. A media row with `upload_status = complete` and no reading for its hash is pending. A `read-media` edge function reads a batch of twenty on a pg_cron schedule every fifteen minutes, guarded by the cron secret like the other workers. Because the queue is "complete uploads without a reading", it needs no trigger: the first run drains the backlog over a few hours, and after that a refresh or a new overlay adds pending rows and the next tick reads only those. A "Read now" button on the You screen kicks a run for the impatient.

Cost: Claude Sonnet reads an image for roughly a cent or two. The first pass over the document class of this tree is a few dollars; portraits are classified but not transcribed, so they cost the cheap call only. After that, pennies per refresh.

## Phases

**Phase 1 — the text we already have.** Extract text from the `.htm` clippings, PDFs, and Word files. No OCR, no model call except a short summary and mention-extraction pass. This alone puts 190 Find a Grave and county-history bios into readings. Prove the story value here first.

**Phase 2 — classify and read images.** `read-media` with a two-part prompt: classify the image into a kind, then transcribe only when the kind carries text. Portraits, houses, and group photos get a kind, a one-line description ("a studio portrait of a young woman, c. 1900"), and no transcript. Headstones route to the existing reader.

**Phase 3 — the story reads the readings.** `loadPersonFacts` in the shared enrichment module gains a block of reading lines for the subject: confirmed readings first, then high-confidence ones, each labelled "From a document in your file (a letter, 1911):". The biography and story-arc prompts get the same rule the relatives got: weave where it adds texture, quote sparingly, never let a reading contradict the record. "Their story, drawn from N sources" counts them. The findings spine gains `fromMediaReading`, so "a clipping in your file mentions a farm in Oakham" arrives on the Home issue the way a crossing does.

**Phase 4 — the owner's hand.** In the photo viewer, a "What it says" panel beneath the image shows the transcript with its confidence and two buttons, "That's right" and "Not quite", the At the Stone verdict pair. Confirmed readings are what the story trusts first. The Sources tab lists a person's documents beside their citations.

## Acceptance

Run on the Howe/Field tree and report: readings by kind, the share of images classed as documents, transcript quality on ten hand-picked samples spanning typed, printed, and handwritten material, and one story generated before and after for a person with a letter in the file. Handwriting from the 1800s will read imperfectly; the confirm step exists for that, and low-confidence readings never reach a prompt unconfirmed.

## Sequencing

After the Civil War register's next step. Phase 1 is a day; Phases 2 and 3 together a day; Phase 4 a half. The overlay's `--images` and `--all` profiles already put the bytes where the reader needs them.
