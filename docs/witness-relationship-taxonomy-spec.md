# Relationship Taxonomy

Status: spec, 2026-08-25. Supersedes the two-tier `LineageTier` in
`apps/mobile/src/lib/relationship-cache.ts` and the blood-only row filter in
`packages/core/src/family/precompute.ts`.

## 1 · Two fields, always

Every person in a tree carries **two** relationship facts relative to the home
person:

| Field | Values | Purpose |
|---|---|---|
| **tier** | `direct` · `blood` · `distant` · `none` | The broad, glanceable category. Drives the lineage mark, the featured-scope setting, and family filters. |
| **label** | a specific phrase, e.g. `3rd cousin twice removed` | The precise reading. Shown wherever a person's name appears with room for it. |

`none` is the one tier with **no label**. Absence of a label *is* the reading:
this person is in your file, not in your family.

The tier is derived from the label's construction, never stored independently —
one calculation, two views of it.

## 2 · The four tiers

### Direct — your line
Ancestors and descendants: the people you descend from, and who descend from
you. A parent-link chain in one direction, plus yourself.

*Invariant:* the path from you to them uses only parent→child edges, all
travelled in the same direction.

### Blood — kin off the line
Everyone who shares an ancestor with you but isn't on your line: siblings,
aunts and uncles, nieces and nephews, cousins at any degree, and every half-
variant of those.

*Invariant:* the path from you to them climbs to a common ancestor and
descends again, using only parent↔child edges. Unbounded — a 9th cousin is
Blood, not Distant.

### Distant — connected by marriage
Everyone reachable when the path is allowed **exactly one marriage edge**.
Three shapes:

| Shape | Path | Example |
|---|---|---|
| **A · married into your line** | blood → marriage | *wife of your 3rd great-grandfather* |
| **B · your spouse's kin** | marriage → blood | *your wife's grandmother* (`mother-in-law`, `brother-in-law`, …) |
| **C · step-family** | blood → marriage → blood | *stepmother*, *stepbrother*, *your stepmother's father* |

*Invariant:* exactly one spouse edge in the path. Shape C is additionally
bounded — the blood run on the far side of the marriage may be **at most two
steps** (a parent, child, or sibling of the married-in person, and their
parent or child). Past that, a connection stops being a family fact and
becomes graph trivia.

Two marriage edges is never Distant. Your brother's wife's father is `none`.

### No Relation — in the file, not in the family
No qualifying path exists. Unattached branches, a spouse's spouse's people, a
research tree merged in whole. No label, no mark, no row stored.

## 3 · Precedence

Resolved in this order. **Blood always beats marriage** — this reverses today's
behaviour, where the spouse check at `relationship.ts:187` returns before the
ancestor climb and a cousin you married is labelled only "wife."

1. Self → `direct`, label `you`.
2. Direct ancestor or descendant → `direct`.
3. Common ancestor exists → `blood`.
4. Exactly one marriage edge, within the shape rules → `distant`.
5. Otherwise → `none`.

Where two readings both hold, the earlier one wins the tier and the label, and
the later one is appended after an em dash:

> `3rd cousin — also your wife`

Endogamous trees make this common; `kindred.ts` already finds about a dozen
such couples on the 5,532-person Howe/Field tree.

Where two *blood* paths both hold (pedigree collapse), the existing rule
stands: fewest total steps, then the smallest generation gap.

## 4 · The taxonomy

Blood terms are **generated**, not enumerated — the table below shows the
generator's output shape, and the generator is already correct in
`relationship.ts`. Distant terms are **composed** (§5).

### Direct

| Term | Rule | Tier |
|---|---|---|
| you | self | direct |
| father · mother · parent | 1 up | direct |
| grandfather · grandmother · grandparent | 2 up | direct |
| great-grandfather … | 3 up | direct |
| *N*th great-grandfather … | 4+ up (`N = depth − 2`) | direct |
| son · daughter · child | 1 down | direct |
| grandson · granddaughter · grandchild | 2 down | direct |
| great-grandson … | 3 down | direct |
| *N*th great-grandson … | 4+ down | direct |

Sex-unknown people take the neutral form (`parent`, `child`) — already handled.

### Blood

| Term | Rule (a = your steps up, b = their steps down) | Tier |
|---|---|---|
| brother · sister · sibling | a=1, b=1 | blood |
| half-brother · half-sister · half-sibling | a=1, b=1, one shared parent | blood |
| uncle · aunt | a=2, b=1 | blood |
| great-uncle · great-aunt | a=3, b=1 | blood |
| *N*th great-uncle · *N*th great-aunt | a≥4, b=1 | blood |
| nephew · niece | a=1, b=2 | blood |
| great-nephew · great-niece | a=1, b=3 | blood |
| *N*th great-nephew · *N*th great-niece | a=1, b≥4 | blood |
| *N*th cousin | a=b≥2, `N = a − 1` | blood |
| *N*th cousin once/twice/*M* times removed | a,b≥2, `M = |a − b|` | blood |
| half- forms of every row above | one shared parent at the junction | blood |

### Distant

| Term | Composition | Tier |
|---|---|---|
| husband · wife · spouse | your spouse | distant |
| father-in-law · mother-in-law · parent-in-law | parent of your spouse | distant |
| brother-in-law · sister-in-law · sibling-in-law | sibling of your spouse, **or** spouse of your sibling | distant |
| son-in-law · daughter-in-law · child-in-law | spouse of your child | distant |
| your wife's *{blood term}* | shape B past parent/sibling/child — *your wife's grandfather* | distant |
| wife of your *{blood term}* · husband of your *{blood term}* | shape A | distant |
| stepfather · stepmother · stepparent | parent's spouse who isn't your parent | distant |
| stepson · stepdaughter · stepchild | spouse's child who isn't yours | distant |
| stepbrother · stepsister · stepsibling | stepparent's child | distant |
| step-grandfather · step-grandmother | grandparent's spouse who isn't your grandparent | distant |
| step-grandson · step-granddaughter | stepchild's child, or child's stepchild | distant |
| your stepmother's *{blood term}* | shape C, within the two-step bound | distant |

## 5 · Composition grammar for Distant

Given a blood label `B` produced by the generator, and the marriage edge's
position in the path:

- **Marriage last** (shape A) → `wife of your {B}` / `husband of your {B}`.
  Unbounded: *wife of your 6th great-grandfather* is a perfectly good reading.
- **Marriage first** (shape B) → the idiomatic in-law term for the six
  English ones (father-, mother-, brother-, sister-, son-, daughter-in-law);
  otherwise `your wife's {B}`. Coinages like "grandmother-in-law" are worse
  than the possessive they replace, so they are not minted.
- **Marriage in the middle** (shape C) → the idiomatic step- term when English
  has one; otherwise `your {stepparent term}'s {B}`, and only within the
  two-step bound.

Sex of the married-in person picks husband/wife; unknown sex takes `spouse of
your {B}`.

This is the whole of it. Two operators and a bound cover more ground than any
published list, because the blood generator underneath them is unbounded.

## 6 · Adoption, step, and foster

**Decision: tier by family, qualify in the label.** An adopted child is on the
line; the label says how.

| Link type | Tier | Label |
|---|---|---|
| birth | as computed | unqualified: `father`, `son` |
| adopted | as computed (direct/blood) | `adoptive father`, `adopted son`, `adoptive grandmother` |
| foster | as computed (direct/blood) | `foster father`, `foster son` |
| step | distant | `stepfather`, `stepson` |

Where a person has both a birth and an adoptive parent recorded, the birth
parent's label takes the `birth ` qualifier (`birth mother`) so the two are
distinguishable.

Adoptive and foster links participate in the blood climb; the *qualifier* is
carried on the specific edge that was typed, so an adoptive father's own
father is `adoptive grandfather`, not `grandfather`.

### Where the link types come from

The data is already half-collected and entirely unread:

- `family_children.father_relation` / `mother_relation` exist
  (`supabase/migrations/20260705030000_ancestry_extensions.sql:13`) and the
  importer writes them from Ancestry's `_FREL`/`_MREL`
  (`packages/core/src/supabase/transform.ts:217`). **Nothing reads them** —
  `fetchFamilyGraph` selects only `family_id, individual_id`.
- Standard GEDCOM parentage typing is not parsed at all: `PEDI` on `FAMC`
  (5.5.1 and 7: `BIRTH` · `ADOPTED` · `FOSTER` · `SEALING` · `OTHER`) and the
  `ADOP` event's `FAMC`/`ADOP` sub-tag. `individual.ts:117` reads `FAMC` as a
  bare pointer and drops its substructures.

Normalize both into one enum on the graph edge, modelled on GEDCOM X's
parent-child fact types: `birth` · `adopted` · `step` · `foster` · `guardian` ·
`sociological` · `surrogate` · `unknown`. Everything outside
`birth`/`adopted`/`foster`/`step` collapses to `unknown` and is treated as
birth, so an unfamiliar value never demotes a relationship.

### The multi-parent problem

`wire()` (`graph.ts:54`) gives each person one father slot and one mother slot,
first family wins. With link types this becomes a *ranking*, not a race: a
`birth` link outranks `adopted`, which outranks `foster`, which outranks
`unknown` — and a `step` link never claims a parent slot at all. Without this,
a step-parent recorded in the first-encountered family silently becomes a blood
ancestor.

## 7 · Confidence

Unchanged in kind, now surfaced. `known` · `partial` · `none`, where `partial`
means the record can't decide something the label asserts — chiefly full vs
half at a junction where the unshared parent is unknown
(`relationship.ts:141`).

A `partial` label renders with its qualifier softened rather than dropped:
`possibly a half-brother`. Today the prefix is silently omitted and the doubt
never reaches the reader.

`none` means no qualifying path — tier `none`, no label.

## 8 · What changes

**Data.** `relationships` gains `tier text not null` and `link_qualifier text`;
`is_direct_ancestor` / `is_direct_descendant` / `is_collateral` stay as
derived columns for the queries that already read them. Distant rows are now
**stored** — `computeRelationshipRows` currently drops everything that isn't
blood (`precompute.ts:113`), which is why married-in people carry no label in
every list view. Expect the row count on the Howe/Field tree to roughly double
from 2,093.

`none` stores nothing. Absence remains the marker.

**Core.** `RelationshipResult` gains `tier` and `qualifier`; the spouse
early-return moves below the blood checks; the in-law block is replaced by the
composition grammar. Both mirrored copies under
`supabase/functions/_shared/family/` must stay byte-identical — `portSync.test.ts`
enforces it.

**App.** `LineageTier` becomes `'direct' | 'blood' | 'distant'` (the comment at
`relationship-cache.ts:89` already claims three tiers). `LineageMark` gains a
third glyph — `link` for Distant — and still renders nothing for `none`.

**Settings.** "Who gets featured" grows from two options to three: *Direct
line* · *Blood relatives* · *Blood and married-in*. Default stays Direct.

**Guide.** `apps/preview-site/guide/concepts.html` §2 currently teaches three
categories with the third defined by absence; it becomes four, and the mark
legend gains a row.

**Story context.** `relatives.ts` computes its own narrower family circle
(siblings and aunts/uncles only, straight from `family_children`) — a second
source of truth that can disagree with the cache. Out of scope here, flagged
for a later pass.

## 9 · Open questions

- **Divorce and remarriage.** The schema records marriages, not their ends. A
  former spouse is currently indistinguishable from a current one. Do we want
  `former husband`, and does a step-parent survive the marriage that made them
  one?
- **Living people.** Distant rows will include many living in-laws. House
  doctrine keeps living people out of AI prompts; confirm they may appear in
  labels and marks.
- **Featuring default.** Should "Blood and married-in" ever be the default for
  a tree where the home person's line is thin?
