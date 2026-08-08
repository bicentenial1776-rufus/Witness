# Design brief: making the app cohere

Fourth brief in the series (companions: home-screens, tree-health, phone-ia). The first
three each designed a surface. This one is about the gaps between them.

Written 2026-08-07 against `main` at `c0f8a1f`, from a navigation-graph trace of
`apps/mobile/src` — every `router.push` target, counted — rather than from
`PROJECT_BRIEF.md`. Where the brief and the code disagree, the code is recorded here.

Rufus's read, which prompted this: *"the building of it became opportunistic rather than
cohesive and integrated."* That is the finding, and the trace supports it.

---

## The diagnosis

**Every road leads to the Portrait. Almost every door out of it leads to another person.**

`ancestor/[id]` takes **28 inbound links** — more than every other route combined. It is
the universal destination and the phone-IA brief says so explicitly. Before this cleanup it
led onward to other people, to an era query via the tags, and to the relationship path, and
it rendered NARA candidates inline. What it had no way to reach was **their place, their
household, or their findings** — the three things the other five families of screens are
about.

Six families of screens push into it:

| Family | Screens |
|---|---|
| Prompted discovery | Home hero, digest, Query Library, Moments, query results |
| The household | Family Stage, Register, relationship |
| Place | Map, Nearby, places, region, place detail, origins, migrations, crossings |
| Rigor | Tree Health, orphan records, Archives |
| Search | Explore — by name, by place |
| Import | import, import guides, getting-to-work |

Each arrival carries a *reason* — you came from a draft-card match, from a health finding,
from a map pin, from an aliveDuring count. The Portrait discards the reason and renders the
same family register every time.

Six features can put a user in the room. The room knows about almost none of them. **That is
why the app feels like unrelated parts — structurally, they are.**

### The spine specified in PROJECT_BRIEF was never built

`PROJECT_BRIEF.md` §Branch Focus / Identity Lens: *"User designates a heritage branch…
entire product reorients around that lens — queries, historical context, map,
notifications."*

`grep -ri 'branchFocus\|branch_focus'` → **zero hits.** Nor do these exist:

- The Recognition Feature
- Family Constellation View
- Annual Family Wrapped
- Inheritance Transfer
- Cemetery GPS / BillionGraves
- Wikidata, Chronicling America

Every unbuilt feature on that list is a **connective** one. Every shipped feature is a
**vertical** one. The ribs shipped and the spine was descoped — the eclectic feeling is the
predictable result, not bad luck.

### Two shelves competing for one job

The Archives screen is on the Explore shelf **and** the Tree shelf. That duplication is the
tell: Explore means *wander*, Tree means *work*, NARA is both, so it was filed twice — which
means neither shelf has a clear job. Meanwhile Ocean Crossings is the fifth card down on the
wander shelf and Tree Health is at the bottom of the work shelf. Nothing is ranked by how
much it matters.

### The one thing already doing it right

`src/lib/research-ledger.ts` aggregates Tree Health, orphan records, and the Archives into a
single *"Your findings · 43 decisions so far"* band. It is the only code in the app that
treats several features as one thing. ~200 lines, works well, used on exactly one screen.
Both approaches below are arguments for generalizing it.

---

## The orphans

| Screen | Status | Inbound | Note |
|---|---|---|---|
| `/ascent` | **Dead** | 0 | Delisted from Explore 2026-07-25, never deleted. Screen + `components/ascent/` (three components used by nothing else) shipped in every bundle. Superseded by Tree Health. |
| `/kindred` | Curio | 1 | Spouses who share an ancestor. Startling fact, appears nowhere else — not a health finding, not on either spouse's Portrait, not on the map. |
| `/crossings` | Curio | 1 | The most narratively loaded event in most American trees, shelved fifth of six, unconnected to the map or to `/migrations`, which computes the same journeys. |
| `/archives` | Leaks | 2 | The only screen whose cards link *out* of Witness (NARA catalog, Ancestry) and never *in*. `nara-candidate-card.tsx` has no router import at all. |
| `/orphan-records` | Curio | 1 | Belongs to the research ledger, which is more than the others can say, but reached only by scrolling to the bottom of the Tree tab. |
| Street View | Announced | 0 | A "COMING SOON" row at the bottom of Tree. Not an orphan — a tenant with a lease. Check the promise still matches the plan (see `street-view/`, branch `feat/street-view`). |

The curios share one diagnosis: **they are findings that the app files as destinations.** A
computed fact about the tree gets a card on a shelf and a screen of its own, and a finding
that lives on its own screen can only be found by someone who already went looking for it.

---

## Who this is for

The amateur genealogist who uses Witness regularly but not as their main tool. Their main
tool is Ancestry — that is where they edit, attach, and build. They come here on a Sunday
afternoon with twenty minutes, having done nothing since last time, and the question in
their head is **"what's here that I didn't know last week?"** — not "let me open the tool
that finds kindred couples."

They never navigate on purpose. They arrive and expect to be handed something.

Two consequences that constrain every decision below:

1. **A shelf of six equal cards is the wrong shape.** It asks them to choose, and choosing
   requires already knowing what each card does.
2. **A queue of 443 open findings is also the wrong shape.** It is a chore list, and this is
   a hobby done for pleasure. This is the FTAnalyzer trap and we ported FTAnalyzer's checks.

---

## Approach A — The Ledger

*The unit is a finding. Witness is a workbench.*

Generalize `research-ledger.ts` from three sources to all of them. One typed record — a
finding with a subject person, a kind, a source feature, and a status — emitted by every
feature. Tree Health emits findings. NARA emits findings. Kindred, Crossings, Migrations,
and the Query Library emit findings. The feature screens survive as **filtered views of one
store** rather than six unrelated destinations.

- The Portrait grows a *Findings* section under the family register: this person's health
  flags, archive candidates, kindred marriage, the queries they appear in. **The sink
  becomes a hub.**
- Home leads with the ledger: `17 waiting on you · 43 decided`.
- Kindred and Crossings stop being shelf cards and become finding kinds.
- Every finding carries the reason you arrived, so the Portrait can say *"you're here
  because of a 1917 draft card."*

**For:** the pattern is already proven in our code; mostly server-side (a table plus one
adapter per feature); makes Tree Health the engine rather than a shelf item; gives Street
View a natural landing later — a chapter is a finding with a place.

**Against:** a ledger turns a hobby into a chore list. The live tree produces 443 findings;
a home screen opening with *"443 waiting on you"* is a scold and the Sunday amateur closes
it. If we take this route the ledger must be capped, ranked, and framed as invitation — the
discipline `ledgerHeading()` already demonstrates.

**Shape:** backend-led · **Screens touched:** Portrait, Home, six feature screens ·
**New user-facing concepts:** one · **Reversible:** yes

---

## Approach B — The Issue

*The unit is a story. Witness is a periodical about your family.*

The strongest argument is that **we have already built this visually and not structurally.**
The design system is called Broadsheet. There is a component named `Masthead`. The type is
serif with mono record-text and hairline rules. The app *looks* like a newspaper and is
*organized* like a toolbox, and that mismatch is a large part of the eclectic feeling — the
visual language keeps promising an editor's judgment the IA never delivers.

- Home becomes **this week's issue**: a lead story, two or three shorter pieces, a standing
  column. The digest, featured-today, and the Tree-tab curiosities already generate exactly
  this material.
- Each feature becomes a **desk with an editorial slot**. Tree Health files *one* finding
  this week, not 443. Archives files its best candidate. Kindred files a piece when it finds
  something.
- The Portrait's return path is *"next in this issue"* — a far more natural door than back.
- The Library becomes the archive of **back issues**, which is nearly what it is already.
- Explore stops being a shelf of six equal cards and becomes **the index**.

**For:** it answers "what's here that I didn't know last week?" directly, because that is
what a periodical is *for*. Twenty minutes on a Sunday is an issue-sized visit; a queue is
not. Rationing becomes a feature — one finding a week is inviting where 443 is oppressive.
It gives Crossings and Kindred a job: they are wonderful stories and poor tools. And it
makes the subscription legible — you pay for an issue to arrive.

**Against:** a periodical must publish. A small tree, or one not re-imported in six months,
may have nothing new, and an issue with no stories is worse than a shelf. **This needs an
honest answer before we commit:** either a deep backlog the editor draws from (329 library
queries and 443 findings — the backlog is real), or an issue that is candid when it's thin.

**Shape:** editorial / front-end-led · **Screens touched:** Home, Explore, Portrait, Library
· **New user-facing concepts:** one · **Reversible:** less so — it changes what the app is

---

## Also considered — The Lens

Branch Focus from `PROJECT_BRIEF.md`: the reader picks a branch and the product reorients.
This is the document's own proposed spine.

Argued against **as the spine**, for two reasons. It hides data, and an amateur who doesn't
understand why the map lost half its pins reads that as a bug. And it fails exactly where
it's needed most — a mixed or shallow tree has no dominant branch to detect, so the users
with the least cohesive experience get the least help.

It is an excellent **filter** on top of either approach above ("show me only the Howes" on a
ledger; "an issue about the Acadian line"), and that is where the idea should be spent, once
there is a spine for it to sit on.

---

## Decisions (Rufus, 2026-08-07)

1. **Do the approach-independent cleanup first**, then re-read the graph with the sink
   fixed and choose the spine. The cleanup is right under either approach.
2. **The spine: B (The Issue) built on A's plumbing** — decided the same evening, after
   seeing the cleanup on device. The Ledger is the data model, the Issue is the framing,
   and an editor needs a backlog to edit. The app doesn't feel eclectic for want of a
   queue; it feels eclectic for want of a *subject*.
3. **The Lens is a filter, not a spine.** Not revived as the organizing idea.
4. **Orientation instruments over a tree diagram.** The "I always know where I am" quality
   of a pedigree chart is provided by one-dimensional instruments instead of a 2-D map:
   a *path* (the relationship lede opens the person-by-person chain — already shipped),
   a *compass* (generation depth + branch side in the identity span), and a *running head*
   (house of the parents, position in the birth order). The discipline: everything stays
   one-dimensional; the moment something fans out in two dimensions it is the me-too tree
   diagram sneaking back in, and Ancestry already does that better.

## The spine, v1 — shipped 2026-08-07, same branch

**A's plumbing, client-side first.** `packages/core/src/findings/` defines the unified
`Finding` — id, source, subjectIds, one editorial sentence — with mappers from every
emitting feature (Tree Health, NARA, crossings, migrations), plus the Issue's arithmetic:
`issueOf(date)` (ISO-week edition number and label) and `pickWeekly(items, seed)` (FNV-1a —
deterministic, so the week's picks are the same on every device without a server). The
planned Postgres `findings` table uses this row shape; until it lands, findings assemble
from the session caches and the tables that already persist (marks, rulings, candidates).

**B's front page.** Home is this week's issue: a dateline (`NO. 32 · THE WEEK OF AUGUST 3`),
**The lead** (the digest hero), then each desk files ONE piece — **From the Tree Check**
(a single weekly-picked curiosity, the open count demoted to a mono footnote), **From the
Archives** (the waiting count, one line), **The pattern** (one crossing or migration for
the week, picked from the cached geography index). On This Day, the stat strip, resume,
and the Library shelf carry on as standing furniture. A thin week simply prints fewer
pieces — no desk fabricates.

**The Portrait's third door opened.** *From the Tree Check* on the person: the audit's
open findings naming them, same session-cached run and marks/rulings filter as the
workbench (`getPersonCuriosities` in `curiosities-cache.ts`), so a decision there
disappears here. Home warms the audit cache on focus, so the Portrait usually filters
work already done. The compass ships in the identity span (`gen 7 · father's side`,
direct line only — a cousin's generation_distance measures the common ancestor, which
would read as a lie about the cousin), and the running head sits above the family
register. Findings persistence (the Postgres table), back-issue permanence, and the
Recognition/Wrapped desks remain open work.

## The cleanup — approach-independent (shipped 2026-08-07)

Each of these is correct under A, under B, and under doing nothing else.

1. **Deleted `/ascent` and `components/ascent/`.** Dead since 2026-07-25, still in every
   bundle. `docs/ascent-taxonomy.md` and `ascent-vo-script.md` moved to `docs/archive/`.
2. **Gave the Portrait its onward doors.** The birthplace in the mono span is now a link to
   `/place/[placeId]` — everyone else who was there, one tap away. The family register ends
   with *"See this household as a length of time"* → `/family-stage/[key]`.
3. **Made NARA candidate cards link to the person.** A matched draft card that can't take
   you to the man it belongs to is a broken promise.
4. **Took Archives off the Explore shelf.** Explore wanders, Tree works. On both means
   neither shelf has a job. The counts already live on the Tree tab's row, so nothing was
   lost; the now-unused NARA fetch came out of the Explore screen with it.
5. **Collapsed Kindred, Crossings, Origins, and Migrations into one *Patterns* entry**
   (`/patterns`). Four curios read as clutter; one thing with four kinds of finding reads as
   a feature. Also the dress rehearsal for both approaches — the first time a screen in this
   app presents several features as one.

### Two things the cleanup had to fix underneath

- **`stageKeyForPerson()`** (`packages/core/src/query/familyStage.ts`). Stage keys are the
  household *head's* id — the spouse with the most marriages, ties to the husband — so a
  wife's own id matched no key, and the screen's fallback silently landed the reader on the
  root family instead of hers. The resolver walks head-then-spouses and returns null when a
  person heads nothing, which is the caller's cue to show no link at all. Three tests.
- **The broadsheet rail's `EXPLORE_ROUTES`.** Following a card off the Explore shelf
  highlighted nothing in the rail, which read as having left the app rather than gone one
  level down.

### Deferred, with the reason

**The Portrait's third door — this person's Tree Health findings — is not built.** Findings
are computed client-side from the whole tree index on every visit to `/tree-health`; only
the *rulings* and *marks* are persisted. A per-person link would mean running the full audit
on the Portrait, which the pagination work (`docs/` perf notes) says costs ~11s on an 8.6k
tree. That door needs a persisted `findings` table — which is precisely Approach A. It is
the strongest concrete argument for building A's plumbing regardless of which spine wins.

## Deliberately not in the cleanup

- **No new tabs.** The five-tab IA (`phone-ia-design-brief.md` decision 2) stands.
- **No new visual language.** Letterpress + Broadsheet tokens only, per the same brief.
- **No Home reshape yet.** That belongs to the spine decision, not to the cleanup.
- **No tree editing, ever.** Unchanged (`PROJECT_BRIEF.md` §Features Explicitly Deferred).
