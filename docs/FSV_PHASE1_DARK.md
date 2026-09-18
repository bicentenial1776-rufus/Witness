# Family Street View, phase 1, in the dark — 19 September 2026

*For Rufus, to review, not to merge. From the design repo's side (Claude,
with Greg). Branch `fsv/phase1-dark`.*

Greg, on the evening the rooms were ready to show:

> "strategically, we need this to be previewed before actually rolled out,
> since this is an app people use daily now, perhaps dozens of people, and
> soon maybe hundreds."

The principle this branch holds to: **a feature that people use daily is
changed in the dark.** Nothing on it can reach a subscriber until somebody
turns it on for them by name, and it can be turned off for everyone in a
minute without a release.

## What is on the branch

Three things say yes before a door opens, and the first is a constant that
is false (`apps/mobile/src/lib/fsv-access.ts`):

1. **`FSV_ROOMS_ENABLED`** in `lib/features.ts` — `false`. While it is
   false nothing else here runs: no query, no read of the tree, no mark.
2. **An active seat**, as `usePurchases` reports it. Early access is for
   active subscribers.
3. **A row in `fsv_early_access`** for the user — the migration in this
   branch. The server-side list, and the **kill switch**: delete the rows and
   every door shuts, everywhere, at once.

What the door opens onto:

- **`app/(app)/rooms/[key].tsx`** — hidden, like the Field: no tab, and the
  only links to it are the marks below. Typed by address with access denied
  it shows one line, "This room is not open", and reads nothing.
- **`components/fsv-room-dom.tsx`** — the room page in a web-page panel, the
  way the Field shows the world, with a bar above it (the hour, the weather,
  the fire, the sound: the hall's four controls). It hands the household
  into the frame and reads the room's state back.
- **The mark** — `Go in ›` under `Family Graph ›` on the Portrait, and beside
  the graph's header. Rendered through `useFsvDoor`, which resolves to a shut
  door whenever access is not allowed, so the screens can render it
  unconditionally and it simply never appears.

What reads the family (`packages/core/src/fsv/`, pure, tested):

- **`household.ts`** — `fsvHouseholdRecord(index, familyId)`: the members by
  relation, the census days the record found them on (a residence or census
  event of the head or wife that year, the members with one that year in the
  same town), a thin day by the 13 September rule where the record has none,
  and **the living withheld whole**. It is the design repo's census read
  restated on the TreeIndex the app already holds.
- **`enterable.ts`** — `fsvCanEnter(record)`: not living, dated, placed, at
  least one day. The record's half of the rooms' rule; the room page decides
  the other half (which house, and whether the world has a room for it) when
  the door opens, from the same catalogue the world uses.

And the copy step: `apps/fsv/scripts/sync-world.mjs` now copies the room page
(`FSV_Census_Day.html`) in beside the world.

## What is proved, and what is not

**Proved, every build, in the design repo:** the exchange between an app
around the room and the room page — the household handed in, the room built,
its state reported back, the four controls — in `witness_standin/build/walk.js`,
which walks a Witness look-alike running this same `@witness/core` code,
over a `file://` frame (the stricter case). Core's own tests cover
`household.ts` and `enterable.ts`.

**Not proved:** anything on a device, or in Expo at all. I cannot run the
app from here. The DOM component and the screen follow `field.tsx` and
`fsv-world-dom.tsx` line for line where they can, and the rest is marked
untested in its own comment. The app's typecheck was run where it could be.

## Two gaps in the seam, said plainly

1. **The parser keeps no words from a census row.** A residence event in
   `@witness/core` has a date, a place, a label and a detail — not the
   `NOTE` ("Occupation: Boot Bottomer; Relation to Head: Wife") and not the
   source title ("1880 United States Federal Census"). So `household.ts`
   infers which census a row belongs to from the country and the year, takes
   relations from the family record, and writes no occupation. Greg's own
   file, read the design repo's way from the raw tree, has all three. The
   fix is a parser one — keep `note` and source titles on `GedcomEvent` — and
   it is yours to want or not.
2. **Which house a country and year get** is the world's catalogue rule and
   lives in the room page (`experiments/census_day/src/house_of.js`), not in
   core. A household that passes `fsvCanEnter` can still find no room when
   its country is one the catalogue makes no claim on; the page says so
   inside. If you want the mark to know that too, the claim table is data
   and can be exported.

## The ladder from here

1. This branch, reviewed. Flag off; nothing visible.
2. A TestFlight build for internal testers, with the flag on for that
   build and the two of us on the list. Greg walks it on an iPad.
3. The list opened to subscribers who opt in — an early-access toggle in
   their settings, theirs to switch off.
4. Everyone, after 3 has run quietly.

Two questions for you before rung 2, which the ladder needs answered
whether or not FSV exists: does the app have a **kill switch** for a
feature already shipped (this table is one; a remote flag would be
better), and does it have **error reports from users' devices**? If it has
neither, those come first.
