# Family sharing — the invite model, a design brief

*2026-08-30. The V2 roadmap's "Family sharing / invite model" made concrete.
Four decisions are Rufus's, made today: (1) v1 members are **read-only
companions**, (2) a **family plan at $29.99/year unlocks the seats**, (3) every
member gets **their own home person** — their own point of view on the shared
tree, (4) this session produces the brief, not the build. The five open
questions at the end were answered the same day — nothing here is
undecided.*

## What this is

One subscriber — the family's researcher — has done the work: the import, the
geocoding, the confirmations, the stories. Family sharing lets that person
hand the finished thing to the people it's *about*. Ruth opens Witness and
sees Rufus's tree not as a spectator but from her own seat: "your 8th
great-grandfather," her Nearby, her weekly issue. The brief's own metaphor —
a timeshare in time, transferable to the people who come after — finally gets
its mechanism.

**v1 members read; they do not write.** No imports, no refreshes, no deletes,
no verdicts, no corrections. The curated tree *is* the product; a companion
seat is a subscription to the researcher's work.

## The current model, honestly

A scout pass over the codebase (2026-08-30) established the ground truth:

- **Access control is uniformly single-owner.** ~25 tables enforce
  `auth.uid() = user_id`; the schema comment says so as doctrine
  (`20260702003638_gedcom_schema.sql:161`). There is no membership concept,
  no role, no join table anywhere.
- **`tree_id` filtering is a client convention, not a database guarantee**
  (`apps/mobile/AGENTS.md`; `20260818150000_search_people.sql:8-10`). Today a
  missing filter mixes your own trees. Under sharing, the same bug class
  would mix *someone else's* tree into yours — the invariant has to harden.
- **Entitlement gates the whole app per-account**: the router guard at
  `_layout.tsx:78` and the server-side `checkEntitlement()` in
  `functions/_shared/enrich.ts` both key on the *caller's own* RevenueCat
  subscriber id. There is no notion of "entitled through someone else."
- **Members can't see each other.** `profiles` holds no name or email and is
  self-only readable.
- **`share_links` is not the invite mechanism.** It is deliberately the
  opposite on every axis: snapshot not live, one ancestor not a tree, 90-day
  expiry, never a living person. Its *patterns* (128-bit hex token,
  `security definer` accessor, no anon select) are worth copying; the table
  is not.

## The design

### 1. Membership: `tree_members`

```sql
create table tree_members (
  tree_id        uuid not null references trees (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  role           text not null default 'companion' check (role = 'companion'),
  home_person_id uuid references individuals (id) on delete set null,
  display_name   text,          -- what the owner sees on the roster
  invited_by     uuid not null references auth.users (id),
  joined_at      timestamptz not null default now(),
  primary key (tree_id, user_id)
);
```

The owner stays `trees.user_id` — ownership is not a role, it's the column
that already exists. `role` is a check-constrained single value today so v2
("contributor": notes, verdicts) is an `alter` not a migration. Members read
the roster for their own trees; the owner reads and deletes rows for trees
they own. `display_name` is captured at accept time because `profiles`
carries no name and shouldn't be forced to grow one for this.

A member is just an account — Ruth keeps her own tree and her own imports;
the shared tree simply appears in her tree list. `active-tree.tsx` already
supports multiple trees per user and persists the choice per-account; the
shared tree rides that switcher for free.

### 2. Read access: additive SELECT policies, writes untouched

A `stable security definer` helper:

```sql
create function is_tree_member(p_tree_id uuid) returns boolean ...
  -- exists(select 1 from tree_members where tree_id = p_tree_id
  --        and user_id = auth.uid())
```

Then one **additional permissive SELECT policy** per table the companion
experience reads: `using (is_tree_member(tree_id))`. Every existing
`auth.uid() = user_id` policy — including every INSERT/UPDATE/DELETE — stays
exactly as it is. Read-only v1 falls out of the policy shape itself: there is
no write path to guard because none is opened.

Phase the policies in by surface, not all 25 tables at once: start with the
tables the reading experience touches (`individuals`, `individual_events`,
`families`, `family_children`, `places`, `relationships`, `sources`,
`citations`, `research_briefs`, `story_arcs`, `tree_syntheses`, `findings`,
`historical` enrichment, `curiosities`). Hold back the work-surface tables
(`tree_health_marks`, `tree_health_rulings`, `nara_candidates`,
`corrections`, `ancestor_notes`) pending the open question below.

**The footgun audit is a prerequisite, not a follow-up.** Before the first
member policy ships, every client query on a member-readable table must be
verified to filter by `tree_id` (the QUERY_AUDIT method exists; rerun it with
this lens). A missing filter today shows you your own other tree; after this
migration it shows you your cousin's.

### 3. Perspective: the member's own home person

`tree_members.home_person_id` is the member's seat. On first entry the
companion onboarding asks the one question that matters — **"who are you?"** —
a search over the tree (the find-yourself moment; likely a living person,
which is fine: companions are family, and the living-person exclusion is a
*public*-sharing rule that does not apply inside the family).

Relationship computation already runs server-side
(`compute-relationships` edge function, admin writes) and the `relationships`
table is per-user by RLS — so per-member perspective is the existing
machinery pointed at a different home person: the function computes from the
member's `home_person_id` and writes rows owned by the member. The weekly
issue is deterministic and client-computed per tree; with the member's
relationship rows in place, their edition reads from their seat without new
server state.

### 4. Billing: family plan + promotional seat entitlements

- **New product**: `family_annual` at **$29.99/year** (Rufus, 2026-08-30 —
  supersedes the brief's $34.99), granting the existing `premium` entitlement
  to the owner. Standard upgrade path from the $19.99 individual plan via
  RevenueCat product change; per the pricing standard: free download, annual
  sub, 1-month trial, and the app price is never the sub price.
- **Seats ride RevenueCat promotional entitlements.** When a member accepts
  an invite, the server grants their RC customer a promotional `premium`
  entitlement (the exact mechanism the `comp-subscription` skill already
  uses). This is the load-bearing simplification: **every existing gate —
  the router guard, Superwall, `checkEntitlement()` on every edge function —
  works unchanged**, on native and web, because the member simply *is*
  entitled. No "entitled-via" plumbing anywhere.
- **The cost of that simplification is reconciliation.** Promotional
  entitlements don't lapse when the owner's plan does. A small worker (the
  pg_cron pattern already in the codebase, or an RC webhook on the family
  product) revokes seat entitlements and `tree_members` rows when the
  family plan expires or a member is removed. Grant and revoke must be one
  transaction-shaped operation in a single edge function so the roster and
  RevenueCat can't drift apart silently.
- **Seat math**: family = **5 accounts total** (owner + 4 companions),
  enforced at accept time server-side. Note what a seat really is: full app
  access — a companion can import their own tree too. That's not a leak;
  it's the product being generous, and it's priced in ("up to 5 accounts").

### 5. The invite

```sql
create table invites (
  token       text primary key,          -- 32 hex chars, expo-crypto pattern
  tree_id     uuid not null references trees (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id),
  accepted_at timestamptz,
  revoked_at  timestamptz
);
```

Single-use, 7-day, revocable, owner-only visible (no anon select — same
posture as `share_links`). Flow:

1. Owner, on the You screen's new **Family** section: "Invite family" →
   creates a token, opens the OS share sheet with
   `https://app.witnesslives.com/join/{token}` and a sentence of copy in the
   house voice.
2. The `/join/:token` web page (share-page pattern: validate
   `^[0-9a-f]{32}$` before anything reaches HTML) shows who's inviting and
   to what — "Rufus has invited you into the Howe family tree" — then routes:
   signed-in → accept; new → sign up (App Store link on iOS devices).
3. **`accept-invite` edge function** (admin client, one transaction's worth
   of work): validate token liveness → count seats → insert `tree_members` →
   grant the RC promotional entitlement → stamp `accepted_by/at`. Any
   failure leaves no partial state.
4. The member lands past the paywall (they're entitled) into the companion
   onboarding: a short variant that skips the GEDCOM import narrative and
   ends at "who are you?"

### 6. What companions see and don't, v1

| Surface | Companion? | Why |
|---|---|---|
| Home (weekly issue), Portrait, stories, Explore, Family Stage, Register, Map, Nearby | **Yes** — from their own seat | The reading experience is the product |
| Living people | **Yes** | Family context; the exclusion is a public-share rule |
| Tree Health workbench, NARA verdicts, At the Stone, corrections, notes | **No** (hidden, not disabled-looking) | Work surfaces; write-shaped even when reading |
| Import / GEDCOM Refresh / tree delete / Ancestry link | **No** | Owner-only by definition |
| Creating public share links | **No in v1** — fast-follow | Wants a small policy think (a companion sharing the owner's ancestor) but it's the growth loop; revisit early |
| Grave photos, story exports | Read where the Portrait needs it | Needs a membership-aware storage SELECT policy (buckets are `{user_id}/…`-keyed); GEDCOM vault stays owner-only (client-encrypted; companions never need it) |

Every write affordance the companion doesn't get should be *absent* from
their render, not grayed out — the companion app is a clean reading edition,
not a locked workbench.

## Phasing

- **Phase 1 — the ground** (server only, invisible): `tree_members` +
  `invites` + `is_tree_member()`; SELECT policies on the reading tables; the
  `tree_id` filter audit; `accept-invite` / `remove-member` edge functions;
  RC `family_annual` product + promotional-seat grant/revoke +
  reconciliation worker. Verifiable end-to-end with two test accounts before
  any UI exists.
- **Phase 2 — the doors**: You-screen Family section (roster, invite, remove);
  `/join` web page; companion onboarding + home-person pick; per-member
  `compute-relationships`; hide the write surfaces for companions; the
  family-plan paywall/upgrade copy.
- **Phase 3 — the finish**: storage policies for photos; Nearby/Map polish
  from the member seat; Field Guide page; witnesslives.com + ASC copy (via
  the claims audit — nothing aspirational ships as present tense); companion
  share links if the fast-follow is taken.

## The five open questions, answered (Rufus, 2026-08-30)

All five were put to Rufus the same day the brief was written; nothing
remains open before Phase 1.

1. **Margins: confirmed facts only.** Confirmed crossings, graves, and
   archive matches flow through to companions — they're already woven into
   stories and Portraits and are the curated product. Notes, open verdicts,
   and the Tree Health workbench stay hidden (the table above stands).
2. **Seats: 5 accounts total** — owner + 4 companions, as written.
3. **Removal: seat + access revoked, own data kept.** The shared tree
   vanishes from the removed member's switcher and their entitlement ends;
   a tree they imported themselves survives but sits behind the paywall
   until they subscribe. No grace period, no data deletion.
4. **Trial: yes, the standard 1-month trial, seats grantable during it.**
   The trial shows the actual product — family can be invited day one.
   Seats revoke with the entitlement if the trial lapses unconverted (the
   reconciliation worker's normal path, no special case).
5. **Comp roster: family becomes seats, the rest stay comps.** Ruth and
   June convert to real seats on the family plan once it exists; Katie,
   Kharisma, Greg, and Betsey remain promotional comps — those are
   influencer/tester relationships, not family members on the tree.
