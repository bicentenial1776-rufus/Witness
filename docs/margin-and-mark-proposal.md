# Proposal: The Margin and the Mark

*Prompted by a reader letter, August 2026. Three asks, one bug, and what the
codebase makes cheap once they're built.*

---

## The letter

> I am having a great time reading the brief stories of my ancestors. How I wish
> there was a way to annotate this story. Just a box below to add what I have
> documented or just heard from family lore. For instance, my grandmother had
> twin siblings but the "story" says "no explanation for why 2 children were born
> in same yr" — most likely this is AI generated right? Also it would be helpful
> if there was some indication that I had already read the brief "story". Just a
> star in a corner or something. I keep coming back to a person and realizing
> I've been there before.
>
> Totally love what you have done! It has already solved some mysteries.

Four things are in that paragraph, and only two of them are feature requests:

1. **An annotation box** under the story — for what the reader has documented,
   and for what they've only heard.
2. **A read mark** — so a person they've already met looks different from one
   they haven't.
3. **A bug**: the story treated twins as an unexplained anomaly. This is not a
   model failure; it is a fact-assembly failure, and it is reproducible.
4. **A quiet accusation**: *"most likely this is AI generated right?"* The reader
   had to guess. Nothing on the Story panel says who wrote it.

The first two are the same insight seen twice: **Witness is a reading app, and
readers annotate and keep their place.** Both asks are about the reader's own
work sitting beside the record — which is exactly the seam the product already
owns and the one place it currently offers nothing.

## The doctrine check

Every guiding principle in the brief either permits these or actively wants them:

| Principle | Reading |
| --- | --- |
| **Witness never edits. The GEDCOM is sacred.** | An annotation is *not* an edit. It lives beside the record in Witness's own tables and never travels back to the source tree — the same standing as a Research Brief or a Tree Health ruling. The margin is not the manuscript. |
| **Anomalies are curiosities, not errors.** | This is the rule the twins bug is *obeying* — literally, in the system prompt. The fix is to stop manufacturing the anomaly, not to loosen the rule. |
| **AI enriches, it doesn't replace. The underlying data is the source of truth.** | An annotation is a second kind of truth — what the family holds. It has to be labeled as such and never quietly promoted to fact. |
| **Witness deepens over time, it doesn't exhaust itself.** | A read mark converts a tree of 400 people from a lookup table into something with a frontier. That is the strongest version of this principle available for free. |
| **Depth over breadth.** | Both features are small. Neither adds a screen to the tab bar. |

Nothing here needs an exception. That is unusual and worth noticing.

---

# Part 1 — The Margin (annotations)

## What it is

A note box under the Story panel on the Portrait (`apps/mobile/src/app/(app)/ancestor/[id].tsx`),
holding the reader's own knowledge of this person. Two kinds, chosen by the
writer, because the reader's letter already made the distinction:

- **Documented** — "I have the death certificate; she died at Worcester City
  Hospital, not at home."
- **Family lore** — "Grandma always said the twins were named for her aunts."

The distinction is not decoration. It is the same tiered honesty Tree Health
already runs on (computed verdicts / machine suspicions / human attestations),
and it decides everything downstream: what may enter an AI prompt, what may be
shared, what may count as evidence.

Suggested labels, in the app's voice: the section is **"The Margin"**; the empty
state reads *"What do you know that the record doesn't?"*; the two kinds are
**Documented** and **Family lore**.

## Data model

```sql
-- supabase/migrations/2026XXXXXXXXXX_annotations.sql
create type annotation_kind as enum ('documented', 'lore');

create table annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The pointer: fast joins, current tree. Rewritten on Refresh.
  individual_id uuid not null references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  -- The identity: survives a re-import even if the row above is rebuilt.
  gedcom_xref text not null,
  kind annotation_kind not null default 'lore',
  body text not null check (length(body) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index annotations_user_individual_idx on annotations (user_id, individual_id);
create index annotations_tree_idx on annotations (tree_id);

alter table annotations enable row level security;

create policy "Users manage their own annotations" on annotations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Three decisions worth defending:

**Carry both keys.** `individual_id` is the working pointer; `gedcom_xref` is the
identity. `tree_health_rulings` (xref-keyed, user-scoped) survives any number of
uploads with no help at all; `tree_health_marks` (tree-keyed) dies with each
cascade, by design. **Annotations must be in the first camp.** A reader who types
three paragraphs of family lore and loses it on their next GEDCOM Refresh will
not type them again. Carrying `gedcom_xref` alongside the FK means the Refresh
path can rewrite the pointer via the existing planner and, if the row is ever
orphaned, the note is still recoverable by xref rather than gone.

**Many notes per person, not one.** A single editable blob invites the reader to
overwrite what they wrote in March. Append-and-edit, newest first, is both
kinder and closer to how a research log actually accretes.

**Living people are allowed.** A note is private to its author and never shared;
the living-person doctrine constrains *publication*, not the reader's own
notebook. The constraints are enforced at the two exits (prompt assembly, share
payload), not at the front door.

## Carrying across a GEDCOM Refresh

`packages/core/src/pulse/refresh.ts` already moves the researcher's own work
across an import-then-swap: Research Briefs, NARA verdicts, share links, and
graduated Tree Health marks. Annotations are the most obviously carryable rows
in the schema — they are pure human work that nothing in the new file recreates.

The plumbing exists: `annotations` matches `CarryableRow` (`{ id, individual_id }`)
exactly, so `planCarryForward` takes it with no new code. The work is four lines
in `fetchCarryables`, one `applyCarry` call, and one number added to
`RefreshPreview` (`strandedAnnotations`) so the cost warning names them out loud —
the established rule is that stranded work is announced before the swap, never
discovered after.

## Where it appears

| Surface | Treatment |
| --- | --- |
| **Portrait, under the Story panel** | The box itself. Ships first; everything else is optional. |
| **Portrait, when no story is generated** | The Margin should not be gated behind an AI generation — a reader may know a great deal about a person whose story they never asked for. Show it in the Story panel regardless of enrichment state. |
| **The register lists** | A small mark next to a name that carries notes — the same visual grammar as `LineageMark` (`src/components/lineage-mark.tsx`). |
| **A Margin index** | A screen listing every note, newest first, each tapping through to its person — modeled directly on `research/index.tsx`. This is where the feature stops being a scratchpad and becomes a body of work. |
| **Broadsheet (web ≥900px)** | Inherited free via `PageShell` + the detail drawer, provided the input is a plain `TextField` (`src/components/text-field.tsx`) and not a native-only control. |

## The move that makes it more than a text box

**Annotations become inputs to the story.** Once a reader has written *"her
brother's twins, born 12 March 1850"*, the biography can be told again knowing
it. In `supabase/functions/generate-biography/index.ts` the facts array is
assembled from documented events; annotations join it as a clearly-fenced
section with its own rules, in the same style as the existing `RELATIVES` block:

```
FAMILY KNOWLEDGE (supplied by the reader, not from the GEDCOM):
- [documented] She died at Worcester City Hospital, not at home.
- [lore] The twins were named for her aunts.

Rules:
- Treat "documented" items as facts of the record.
- Treat "lore" items as family memory: attribute them ("the family remembers
  that…"), never state them as established fact, and never build a further
  inference on top of one.
- Never contradict a reader-supplied fact with a weaker inference of your own.
```

This closes the loop the letter opened: the reader saw a wrong story, and the
only useful ending is that they can *fix* it. Which requires the next thing.

## What it needs that doesn't exist yet: regeneration

`enrichment_cache` is `unique (individual_id, enrichment_type)`, inserted by the
service role, with **no user delete policy** — the schema comment is explicit
that a story is "generated once server-side, then served from here forever."
There is today no path, in any screen, to a second telling of a story.

That was defensible when the story was a pure function of the GEDCOM. It stops
being defensible the moment the reader can add facts — and it is already the
reason this particular reader is stuck with a paragraph about twins.

**Proposal: "Tell it again."** A link under a generated story that deletes the
cache row and regenerates. Implementation: an `if (body.regenerate)` branch in
`generate-biography` that deletes via the admin client before the cache-hit
check — the existing entitlement gate and `DAILY_LIMIT` counter then apply
unchanged, so a regeneration costs a generation, which is both fair and
self-limiting. No new function, no new table, no client-side delete policy.

Offer it in two places: standing, under any story; and prominently, right after
a note is saved — *"Tell their story again, with what you know?"*

## Where annotations must not go

- **Share links.** `createAncestorShareLink` builds a snapshot payload of curated
  event lines. Notes stay out of it by default. A per-share opt-in ("include my
  note") is a reasonable later addition — family lore is precisely the part
  people want to send to a cousin — but the default is out.
- **Digest emails.** Same reasoning; the digest is machine-authored and leaving
  the device.
- **Anything touching a living person that leaves the app.** Unchanged doctrine.

## Getting them out again

`packages/core/src/export/csv.ts` already exists, with RFC 4180 escaping and
formula-injection neutralisation — built for exactly this kind of hand-back. An
**annotations CSV** (person, xref, years, kind, note, written) is perhaps thirty
lines using `toCsv`, and it matters more than it looks: it is the answer to
"what if I stop paying" and "how do I get this into RootsMagic." A GEDCOM
`NOTE`-tagged snippet export is a natural sibling and stays honest with the
never-edits doctrine — Witness hands the reader a file; it does not touch theirs.

**Effort:** migration + Portrait UI + list/edit/delete ≈ 1–2 days. Refresh
carry-forward ≈ half a day. Prompt integration + regeneration ≈ half a day.
Margin index + CSV ≈ 1 day.

---

# Part 2 — The Mark (read status)

## The question under the question

"A star in a corner" is easy. Deciding *what earns the star* is the whole design.

Three candidates:

1. **Visited the Portrait.** Cheapest, and nearly useless — the reader passes
   through Portraits constantly on the way to somewhere else, so within a week
   everything is starred and the signal is gone.
2. **The story was on screen.** Matches the letter exactly ("I had already read
   the brief story"). Fires when the Story panel is open with a ready story.
3. **Explicitly marked read.** Honest, and nobody will do it.

**Recommendation: (2), with a dwell condition** — the Story panel open, a story
in `ready` state, and ~4 seconds elapsed. That is defensible enough to
distinguish "I read this" from "I bounced," and it needs no new gesture.

Note the useful side effect: because the mark attaches to *the story*, a person
with no story generated is never marked, and the tree gains an honest three-state
reading — **not written · written, unread · read**. That is a far better map of a
tree than a binary, and the pedigree chart already renders the first distinction
(`has_story` accents the tile border in `src/components/pedigree-chart.tsx`).

## Local or server?

Server. Two reasons: the web app and the phone are both shipped and the same
person uses both, and the complaint is specifically about *returning* — the exact
case a device-local record fails. `resume.ts` is device-local and correctly so
(a resume point is a session's tail); a reading history is not.

```sql
create table story_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  individual_id uuid not null references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  gedcom_xref text not null,
  first_read_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (user_id, individual_id)
);

create index story_reads_tree_idx on story_reads (tree_id);

alter table story_reads enable row level security;

create policy "Users manage their own reads" on story_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Writes are fire-and-forget upserts, in the established style of
`recordEditionPieces` in `src/lib/edition-ledger.ts` — a failed write costs a
star, never a screen. Reads are one query per tree into an in-memory `Set`,
cached exactly like `relationship-cache.ts` / `tree-index-cache.ts`, and
invalidated in the same place tree deletion invalidates the others (`you.tsx`).

## The 30-call-site problem

`/ancestor/[id]` is reached from roughly thirty places — Explore search, the
register, the digest, Home's cards, the place and query drawers, Kindred,
Crossings, Origins, Migration, Near Me, the Family Stage, Tree Health, the
pedigree chart. Threading a prop through all of them is the wrong shape.

Instead: a `useReadMarks()` hook over the cached `Set`, plus one small
`<ReadMark person={id} />` glyph component beside `LineageMark`. Then ship it to
**four surfaces first**, not thirty:

1. **Explore people search** (`(tabs)/explore.tsx`) — the literal scene of the
   complaint: a list of Henrys, and no way to tell which one you already read.
2. **The Portrait register** — parents, siblings, children.
3. **The pedigree chart** — it already distinguishes `has_story`; adding "read"
   makes it a reading map of the family.
4. **Home** (`(tabs)/index.tsx`) — so the edition can stop leading with someone
   you read on Tuesday.

The remaining surfaces then take one line each, whenever they're touched.

## The feature hiding inside the fix

Once read state exists, *unread* becomes a first-class thing to sort and filter
by, and that is worth more than the star:

- **"You haven't met them yet"** — an Explore card listing people with a story
  written but unread, or with enough record to be worth writing.
- **Home prefers the unread.** `featured-today` and the weekly digest can rank
  down anyone recently read. This is the single cheapest improvement available
  to the feed's freshness.
- **A reading count.** *"You've read 38 of 214 stories."* Small, and precisely
  the "deepens over time" principle made visible.

**Effort:** migration + cache + hook + write path ≈ 1 day. Four surfaces ≈ half a
day. Unread card / feed ranking ≈ 1 day.

---

# Part 3 — The bug the letter found

## Root cause

Reproducible, and not a hallucination in the usual sense. In
`supabase/functions/generate-biography/index.ts`, children are fetched as:

```ts
await db.from('individuals').select('full_name, birth_year, living').in('id', childIds)
```

…and rendered into the prompt as `Children: 6 — including Ada Howe (b. 1850),
Alice Howe (b. 1850), …`. **Year granularity only.** Two children born on the
same day arrive at the model as two children born in the same year, with no
possible way to tell twins from a data error.

The system prompt then does exactly what it was told:

> *"If the facts contain an apparent inconsistency, treat it as a curiosity of
> the record, never as an error to correct."*

So the model dutifully remarks that the record offers no explanation. The rule is
right; the facts were impoverished before they reached it.

The galling part: **Witness already knows about twins.**
`packages/core/src/query/treeHealth.ts:245` defines `TWIN_WINDOW_DAYS = 2` and
line 575 skips sibling-spacing findings inside that window. The Tree Check would
never have flagged this family. The biography path simply never asked.

And the dates are there — `individual_events` carries `date_month` and `date_day`
(schema lines 87–90); the biography path just doesn't read them for children.

## Fix

1. **Fetch children's birth events, not just years.** Join `individual_events`
   for `birth` with `date_year/date_month/date_day`, and render the full date
   where known: `Ada Howe (b. 12 March 1850)`.
2. **Say "twins" out loud.** Group same-parent siblings whose birth dates fall
   within `TWIN_WINDOW_DAYS` and label them: `Ada Howe and Alice Howe (twins,
   b. 12 March 1850)`. The constant is already exported-adjacent in core; the
   Edge Function should share the rule, not re-invent it.
3. **Add one prompt line:** *"Siblings born in the same year are ordinary —
   twins, or one birth early and one late in the year. Never remark on the
   record's silence about them."*
4. **Do the same for the subject's own dates and for spouses** while in there —
   the same year-only impoverishment applies everywhere `individuals.birth_year`
   is used as a prompt fact.

**Effort:** a few hours. **This should ship on its own, ahead of everything else
in this proposal** — every story generated between now and then bakes the defect
into a permanently cached row.

Which raises the obvious consequence: **fixing this requires regeneration.** The
thousands of stories already cached still say what they said. "Tell it again"
(Part 1) is not just an annotation feature; it is the only path to repairing
already-generated stories after any prompt improvement, ever. That makes it the
highest-leverage half-day in this document.

## And the accusation

*"most likely this is AI generated right?"* — a reader who loves the product had
to guess where its central artifact came from. The Story panel's label reads
`Story · drawn from 3 sources`; nothing says who wrote it. The FAQ mentions
"AI-written stories" in a living-persons answer, and the paywall advertises
"AI-written biographies" — but the story itself is silent.

**Proposal:** a provenance line under every generated story, in mono, at small
size:

> *Written from your record by AI · Claude Sonnet · 14 August 2026 · Witness
> never invents facts.*

`enrichment_cache` already stores `model` and `created_at`; this is a display
change and a select. It costs nothing, it is *true*, and — given "Privacy is a
feature" is already a marketing pillar — honesty about authorship is the same
argument in a different coat. It also makes "Tell it again" legible: a reader
who knows a machine wrote it understands why it can be asked to try again.

---

# Part 4 — What else the structure makes cheap

Ranked by (value ÷ effort), given the code as it stands.

1. **Corrections become Findings.** `@witness/core/findings` + the `findings`
   table give every feature one typed emission into the edition. An annotation
   that corrects the record is exactly the kind of thing the front page should
   print — *"You added what the record didn't know about Ada Howe."* One new
   `Finding` source; the edition, back issues, and carry-forward all come free.
2. **Annotations seed Research Briefs.** `openResearchBrief` is already one call
   from the Portrait. A lore note ("the family says they came from Cork") is the
   best possible brief seed the app could have, and it comes from a human.
3. **Tree Health attestations.** The Tree Health design brief already reserves a
   tier for human attestations. An annotation *is* an attestation; a note on a
   flagged person answers a Tier-B suspicion in the reader's own words, sitting
   naturally beside the existing `tree_health_rulings` ("not an error") verdict.
4. **The Margin as a screen.** A reverse-chronological log of everything the
   reader has written — their research notebook. `research/index.tsx` is the
   template. This is the surface that makes annotations feel like an asset rather
   than a scratchpad, and it is the strongest retention artifact in the proposal.
5. **Reading history feeds the feed.** Beyond suppressing the recently-read:
   *"You read about her sister last week"* is a real editorial connection Home
   can draw, and `resume.ts` already proves the pattern of showing a reader their
   own trail.
6. **Notes on places and events, not only people.** `place/[placeId]` and
   `query/[eventId]` are the two other screens readers dwell on. An `anchor`
   column (`kind`, `target_id`) on `annotations` from day one costs nothing and
   makes this an afternoon later instead of a migration.
7. **Notes in the share card, opt-in.** The lore is the shareable part. The
   snapshot payload already carries arbitrary `lines`.
8. **A reading streak / progress instrument.** *"38 of 214 stories read."* Fits
   the orientation-instruments doctrine (one dimension, never a tree diagram).
9. **Voice notes.** The target user is 55+, and lore is spoken before it is
   written. Transcribe on device, store the text as an annotation. Genuinely
   valuable, genuinely more work — and it wants the V3 photo/document
   intelligence sprint rather than this one.

**Deliberately not proposed:** writing annotations back to Ancestry or
FamilySearch (explicitly deferred, and the never-edits doctrine is load-bearing),
and any inference that silently promotes lore to fact.

---

# Sequencing

**Slice 1 — Honesty (½ day).** Twins fix; full birth dates in prompts;
provenance line under every story. Ship alone, immediately.

**Slice 2 — Tell it again (½ day).** Regeneration path with the daily limit
applied. Unlocks repair of every already-cached story, and every future prompt
improvement.

**Slice 3 — The Mark (1½ days).** `story_reads` + cache + hook + four surfaces.
Smallest of the two reader asks, and the one that changes daily use most.

**Slice 4 — The Margin (2–3 days).** `annotations` + Portrait UI + Refresh
carry-forward + prompt integration.

**Slice 5 — The Margin as a body of work (2 days).** Index screen, CSV export,
findings emission, unread card.

Roughly a week and a half of build for all five. Slices 1 and 2 are worth
shipping this week regardless of what happens to the rest.

## Open questions

1. **Does the mark need a manual override?** ("Mark unread," or a star the reader
   sets themselves.) Recommendation: not in v1 — see whether anyone asks.
2. **Do lore annotations enter prompts by default, or opt-in per note?**
   Recommendation: default in, with a per-note "keep this out of the story"
   toggle. Most readers write a note *because* they want the story to know.
3. **Free or paid?** Both features are cheap to run and are retention, not cost.
   Recommendation: free, including for lapsed subscribers — a reader must always
   be able to reach their own writing. Only *regeneration* touches the AI budget,
   and the existing entitlement gate already covers that.
4. **Reader research.** This is one letter. Before Slice 4, worth asking the beta
   group directly — the annotation ask is the kind of thing that's either
   universal or singular, and one letter cannot distinguish them.

## Downstream chores

- FAQ entries for both features (`src/constants/faq.ts`).
- Field Guide pages at witnesslives.com/guide (the `field-guide` skill) once the
  UI lands.
- Privacy copy: notes are user data inside the encrypted-tree story, and
  `delete-account` must cascade them (it will, via the `auth.users` FK).
- A reply to the reader. Draft:

> Thank you — and you found a real bug. Twins were reaching the story writer as
> two children born in the same year with no dates attached, so it flagged them
> as unexplained. It knows what twins are elsewhere in the app; the story path
> simply wasn't asking. That's being fixed, and stories will become re-tellable
> so the ones already written can be corrected. You're right that it's
> AI-written, and the app should have said so on the page rather than leaving you
> to guess — it will.
>
> Notes under the story, and a mark on the ones you've read, are both being
> built. Thank you for writing; this letter is the whole reason for both.

---

*Proposal drafted 19 August 2026, from a reader letter. Companion to
`docs/cohesion-design-brief.md` and `docs/tree-health-design-brief.md`.*
