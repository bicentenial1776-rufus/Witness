# Design brief: the Witness home screens

You are designing the home experience for **Witness** (witnesslives.com) — a family-history intelligence app. The user imports a GEDCOM file (their family tree) and Witness answers questions their tree-building tools never could: who was alive when, where the family actually lived, what records exist, what's worth researching next. The product voice is warm, dignified, editorial — "a broadsheet newspaper about your family," not a dashboard. Serif display (Playfair Display), mono record-text (IBM Plex Mono), sans body (Inter); paper/ink/amber palette.

## The assignment

A set of **4–6 home screens**, each satisfying one distinct objective, presented as:
- **iPhone / iPad:** a horizontally swipeable pager (one screen per page)
- **Web ≥900px:** a carousel within the existing "Broadsheet" layout (left rail navigation, masthead, ledger rows, margin column; detail opens in right-hand drawers, not new pages)

Each screen leads with one hero data story and at most 2–3 supporting elements. Screens are overviews — they **deep-link into existing detail screens** (ancestor page, map, research briefs, query library) rather than duplicating detail. Do not design detail views.

## Data available to every screen

All data comes from the user's own tree unless marked otherwise. Two cached indexes load once per session (~1–3 s first load on a large tree), after which everything derived from them is **instant and free** — design freely against these:

**Tree index (people & families)**
- Every individual: full name, given/surname, sex, birth year, death year, living flag
- Every family: spouses, marriage year, children in birth order; parent/child maps both directions
- Derived analytics (all instant): most descendants; most grandchildren; largest sibling groups; ancestors reachable by multiple paths (pedigree collapse); ancestors who are also in-laws; same-surname marriages; likely duplicate people; longest-lived / died-youngest / died-in-infancy; average lifespan by century and by surname; mortality by decade; family clusters by region; places a family held across generations; families spanning countries; the most distantly-related pair in the tree; how well-documented each family line is

**Geography index (places & events)**
- Every place, with coordinates for the geocoded ones (typically 95%+ once the background geocoder finishes); every event (birth/death/marriage/residence…) with year and place
- Derived (instant): region rollups (state/province/country); ancestors in a region or at a place; busiest places, filterable by era; migration paths between places; **nearby ancestors** relative to the device's current location (distance in km/mi)

**Time intelligence** (cheap calls, ~100–300 ms)
- "Who was alive during [year range / historical event]" with age-at-the-time
- The weekly digest engine: scores this week's anniversaries (birth/death/marriage dates falling this week across history), picks a featured life, builds "while they lived" context

**Research state** (cheap calls)
- Query library: a server catalog of saved questions with **live result counts** and user pins
- Research briefs: user's open/resolved research threads (markdown bodies)
- Documentation depth: sources & citations per person — which ancestors are evidence-rich vs. thin

**External records** (slow, arrives-later — never block a screen on it)
- National Archives (NARA) candidate documents matched to places/people, via server proxy; treat as an async "new matches found" signal, not synchronous content

**Account & activity**
- Share links the user has created (snapshot cards for non-living ancestors, revocable)
- Digest email opt-in; subscription/entitlement state

## Realities to design for

1. **Scale range:** the same screens must work for a 12-person starter tree and a 5,000+-person, 13,000-event tree. Every screen needs a designed sparse/empty state that still gives a reason to return.
2. **Loading:** first session load shows indexes building (~1–3 s); after that, screens render instantly. One skeleton pass, not per-widget spinners.
3. **Geocoding in progress:** a fresh import geocodes in the background over hours; a progress state exists ("N of M places located so far") and geography-led screens should degrade gracefully until done.
4. **Living people:** shown to the owner, but treated with discretion — never featured in anything shareable or public.
5. **No realtime push:** freshness comes from re-querying on focus. "What's new" content (new NARA matches, newly geocoded places, this week's anniversaries) changes on the scale of hours-to-weekly, and screens should be honest about that cadence.
6. **Budget per screen:** at most the two cached indexes plus 1–2 cheap queries. Nothing on the home screens may wait on NARA or any external API.

## What to deliver, per screen

- The objective (the one question this screen answers)
- Hero data story — name the exact capability from the catalog above
- Supporting elements (max 2–3), likewise named
- Sparse-tree state and loading state
- Refresh cadence and what "new since last visit" means here, if anything
- Tap-through destinations (which existing screen each element opens)
- Layout notes for the two carriers: phone/iPad page, and broadsheet carousel panel
