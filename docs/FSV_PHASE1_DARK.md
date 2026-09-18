# Family Street View, phase 1, in the dark — 19 September 2026

*For Rufus, to review, not to merge. From the design repo's side (Claude,
with Greg). Branch `fsv/phase1-dark`, PR #27.*

Greg, on the evening the rooms were ready to show:

> "strategically, we need this to be previewed before actually rolled out,
> since this is an app people use daily now, perhaps dozens of people, and
> soon maybe hundreds."

The principle this branch holds to: **a feature that people use daily is
changed in the dark.** Nothing on it can reach a subscriber until somebody
turns it on for them by name; it can be turned off for everyone in a minute
without a release; and when a room fails on somebody's iPad, we hear.

## What is on the branch

Three things say yes before a door opens, and the first is a constant that
is false (`apps/mobile/src/lib/fsv-access.ts`):

1. **`FSV_ROOMS_ENABLED`** in `lib/features.ts` — `false`. While it is
   false nothing else here runs: no query, no read of the tree, no mark.
2. **An active seat**, as `usePurchases` reports it. Early access is for
   active subscribers.
3. **A row in `fsv_early_access`** for the user — the migration in this
   branch. The server-side list.

**The kill switch is that table.** The app has no remote flags (read
tonight: no flags table, no remote config, no expo-updates), and this
feature does not need one: delete the rows and every door shuts,
everywhere, at once, with no release. One row per tester to open; `delete
from fsv_early_access` to close.

**The error report is a table too.** The app has no crash or error
reporting (nothing named Sentry or Crashlytics anywhere), and this feature
does not wait for one. Each time a door is opened, the room screen writes
one row to `fsv_room_log` (the second migration): `opened` with the
milliseconds it took; `no-room` when the world has no house for that
household; `timed-out` when nothing came back in twenty seconds, which is
what a black panel looks like from the app's side; `failed` when the panel
caught an error. The write is fire-and-forget and the room never waits on
it. A user can write their own rows and read none. Nobody's family is in
it: a family key is an id in a tree only that user's device can resolve.
Sentry for the app as a whole is a separate choice, yours, and not on
FSV's path.

What the door opens onto:

- **`app/(app)/rooms/[key].tsx`** — hidden, like the Field: no tab, and the
  only links to it are the marks below. Typed by address with access denied
  it shows one line, "This room is not open", and reads nothing.
- **`components/fsv-room-dom.tsx`** — the room page in a web-page panel, the
  way the Field shows the world, with a bar above it (the hour, the weather,
  the fire, the sound: the hall's four controls). It hands the household
  into the frame, reads the room's state back, and says how the opening
  went. When the world has no room for a household the bar says so in
  words.
- **The mark** — `Go in ›` under `Family Graph ›` on the Portrait, and beside
  the graph's header. Rendered through `useFsvDoor`, which resolves to a shut
  door whenever access is not allowed, so the screens can render it
  unconditionally and it simply never appears.

What reads the family (`packages/core/src/fsv/`, pure, tested):

- **`household.ts`** — `fsvHouseholdRecord(index, familyId)`: the members by
  relation, the census days the record found them on, a thin day by the 13
  September rule where the record has none, and **the living withheld
  whole**. It is the design repo's census read restated on the TreeIndex the
  app already holds. A household with no marriage date takes the head's
  birth and twenty-five; one with no marriage place takes the head's
  earliest placed event: `program.ts`'s own rules.
- **`enterable.ts`** — `fsvCanEnter(record)`: not living, dated, placed, at
  least one day. The record's half of the rooms' rule; the room page decides
  the other half (which house, and whether the world has a room for it) when
  the door opens, from the same catalogue the world uses.

And one change to the parser, the only thing on the branch that touches
what the app already does: **a residence or census event keeps its words.**
`GedcomEvent.detail` carries the event's note ("Occupation: Boot Bottomer;
Relation to Head: Wife") and its source titles ("1880 United States Federal
Census"), through the import transform and the tree index. Nothing else
reads `detail`; the existing tests pass. With it, a day is a day a census
counted, and the row's own relation and occupation reach the room.
Measured on Greg's file against the census record the design repo prepared
for it: doors 512 → 1,373 of 1,431 households; days agreeing 594 → 732.

And the copy step: `apps/fsv/scripts/sync-world.mjs` now copies the room page
(`FSV_Census_Day.html`, 5 MB) in beside the world, so the page ships inside
the app and a fix to a room is a release. A hosted address for it
(`apps/preview-site` deploys to Vercel and could carry it) is a later
improvement, not a phase-1 need.

## What is proved, and what is not

**Proved, every build, in the design repo:** the exchange between an app
around the room and the room page — the household handed in, the room built,
its state reported back, the four controls — in `witness_standin/build/walk.js`,
which walks a Witness look-alike running this same `@witness/core` code,
over a `file://` frame (the stricter case). Core's own tests cover
`household.ts`, `enterable.ts` and the parser change.

**Not proved:** anything on a device, or in Expo at all. I cannot run the
app from here. The DOM component and the screen follow `field.tsx` and
`fsv-world-dom.tsx` line for line where they can, and the rest is marked
untested in its own comment. The app's typecheck was run: the branch adds
no errors to the five the tree already has (CSS side-effect imports).

## One gap in the seam, said plainly

**Which house a country and year get** is the world's catalogue rule and
lives in the room page (`experiments/census_day/src/house_of.js`), not in
core. A household that passes `fsvCanEnter` can still find no room when
its country is one the catalogue makes no claim on; the page says so
inside, the bar says so above it, and the log records `no-room`. If you
want the mark to know that too, the claim table is data and can be
exported.

## The ladder from here

1. This branch, reviewed. Flag off; nothing visible.
2. Both migrations run; the two of you on the list. Still nothing visible.
3. A TestFlight build for internal testers, with the flag on for that
   build. Greg walks it on an iPad (30 fps sustained on an iPad Air 4 at
   1×, no web-content reclaim over ten minutes: your bar of 31 August).
   `fsv_room_log` says what the walk saw.
4. The list opened to subscribers who opt in — an early-access toggle in
   their settings, theirs to switch off.
5. Everyone, after 4 has run quietly.
