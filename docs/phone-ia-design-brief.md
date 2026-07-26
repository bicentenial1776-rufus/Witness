# Design brief: the phone IA

Third brief in the series (companions: home-screens, tree-health). This one records the
decisions from Rufus's 2026-07-25 phone-mockup session and binds the outside design work to
the codebase. The mockups explored a Home feed, a Tree tab, and an Explore library inside a
softer, bluer visual language; the decisions below adopt the structure and reject the skin.

## Decisions (Rufus, 2026-07-25 — settled, not open)

1. **One visual system everywhere: the warm letterpress.** No midnight-blue dialect. Phone
   uses the shipped broadsheet tokens — paper `#fbf9f5`, warm ink `#1a1815`, amber
   `#b0741f` / deep amber `#8a5a12` — with the letterpress manner: hairline rules, squared
   corners, mono eyebrows, Playfair display. The mock's layout survives; its palette,
   rounded cards, gradients, and blur do not.
2. **Tabs: Home · Tree · Explore · Map · Nearby.** Map and Nearby keep their own tabs.
   Research folds into the Tree tab. (The mock's "Me" tab: You/profile stays reachable as
   today rather than spending a fifth-plus slot; revisit only if usage argues otherwise.)
3. **The Family Stage and the Register live as a card on the Tree tab** — selecting it opens
   the feature (the stage, with the Register as its table of contents).
4. **No cards without data behind them.** Content that needs unbuilt capability is parked in
   docs/IDEAS.md, not teased in the UI. (Note: occupations, military, probate, and custom
   events ARE imported — since the July 5–8 migrations — so occupation- and service-themed
   content is supported today.)
5. **No "traced" metric.** The generation-progress bars and "62% traced" are dropped.
6. **The Featured hero is record-grounded** — generated from actual facts under the
   say-what-the-record-doesn't-say rules, produced by a cached daily job, never a live call.

## The screens

**Home — a vertical feed** (the earlier swipeable-carousel concept is superseded):

1. *Featured Today* hero — one ancestor, name/years/place in mono, a short story built from
   their actual records (digest engine picks; biography enrichment writes; cached daily).
2. *Curiosities nudge* — "3 curiosities in the Whitfield line · worth a look, nothing
   urgent." The surface voice for Tree Health: **a curiosity is a prompt, not a problem.**
   Tapping lands on the Tree tab's curiosities.
3. *On This Day* — an anniversary or historical moment tied to the tree (digest
   anniversaries + aliveDuring).
4. *Your Tree* stat strip — people · families · generations (no traced %).
5. *Pick up where you left off* — the resume feature made visible: last person/screen.
6. *Explore shelf* — horizontal cards, supported content only.

**Tree — the "about your tree" home** (never a tree drawing):

1. Header stats.
2. *Curiosities* — top prompts in the gentle voice; "See all" opens the FTAnalyzer Tree
   Check and Orphan Records workbenches (full forensic register, Mark fixed / Not an error).
3. *The Family Stage* card — opens the stage + Register.
4. *Research* — research briefs and the National Archives review queue (folded here from
   the old tab).
5. *Visual views* — Family Street View teaser (Coming Soon; Greg's project). Proximity/map
   entries are NOT duplicated here — Map and Nearby have their own tabs.

**Explore** — search, category chips, and the library grid; every card backed by live data:

- *The Atlantic Crossing* → ocean crossings (exists)
- *What's in a Name* → surname analytics (exists)
- *Called to Serve* → military events (imported) + Tree Health service-window inference
- *Mill & Loom* → occupation events (imported; needs a query/screen, data already present)
- Existing library remains the backbone (event catalog with live alive-counts, pins).

**Map · Nearby** — as shipped today, unchanged by this brief.

## Carried rules

Living people excluded from anything shareable; unknown-death ≠ living; `~` for
floor-not-fact; grey ink for unrecorded sex; drawers for detail on wide layouts; nothing on
Home may wait on an external API.

## Sequencing

The iPhone Family Stage (time falling down the screen, 46-year window, horizontal reading
line) is its own upcoming build with Rufus's layout to come; this brief only fixes where it
lives. The tab restructure is a separate migration from any single feature — plan it as its
own change so navigation doesn't churn twice.
