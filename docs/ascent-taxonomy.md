# The Ascent — what every term means

Plain-English definitions for every concept on the Ascent screen. Each entry has
a **definition** (written to be usable verbatim in help text) and a **on the
chart** note (the visual encoding, for help screens and animations). Source of
truth for the underlying model is `packages/core/src/family/treeHealth.ts`.

---

## The Ascent

**Definition:** A picture of your family tree as a climb. You start at the
bottom — you — and scroll upward through your parents, grandparents, and
beyond, eight generations in all. The higher you climb, the older the records
get and the more gaps appear. The Ascent shows you exactly where your tree is
strong, where it's thin, and where to dig next.

**On the chart:** The whole screen. It opens at the base (your circle) and you
scroll up to ascend. The header shows which generation you're currently
looking at.

## Home person

**Definition:** The person the whole tree is measured from — usually you.
Every relationship label ("3rd great-grandmother") and every slot on the
Ascent is counted from the home person.

**On the chart:** The amber circle at the base of the ladder, marked "You,"
with your name and birth year.

## Generation

**Definition:** One step up the ladder. Generation 1 is your parents,
generation 2 your grandparents, generation 3 your great-grandparents, and so
on up to generation 8 — your 6th great-grandparents. Each generation doubles
in size: 2 parents, 4 grandparents, 8 great-grandparents… 256 people at
generation 8.

**On the chart:** One row of the ladder, with its name, its era, and a
segmented bar — one segment per ancestor who should exist at that level.

## Ancestor slot

**Definition:** A specific position an ancestor should occupy. Everyone has
exactly one father's-father's-mother, whether or not you know who she was. The
Ascent tracks all 510 slots across eight generations and reports on each one.
(Genealogists call this numbering an *ahnentafel*; the app never shows that
word to users.)

**On the chart:** A single segment in a generation's bar.

## Filled

**Definition:** A slot is *filled* when your tree names someone for it. Filled
doesn't mean proven — it means you have a candidate.

**On the chart:** A colored segment (brown for filled-but-unverified, green
for verified). The row's count reads "12 of 16 found."

## Verified

**Definition:** A filled slot is *verified* when the parent-child link that
puts the person there is backed by a source or confirmed by you. Verified is
the difference between "the tree says so" and "we checked."

**On the chart:** A green segment. The Pulse card shows the overall verified
percentage.

## Empty (a gap)

**Definition:** A slot with no one in it — an ancestor who existed but whom
your tree doesn't yet name. Every empty slot is a research opportunity.

**On the chart:** A dim, near-black segment.

## Era

**Definition:** The years a generation was born into, so the ladder reads like
time travel: "births c. 1820–1860." Computed from the real birth dates in that
generation; when no dates are recorded, it's estimated at roughly 30 years per
generation and shown as an estimate.

**On the chart:** The small label on each generation row.

## Line

**Definition:** One branch of your ancestry, named for the surname at its head
— the Howe line, the Field line. The Ascent anchors four lines at your
grandparents and follows each one upward, because gaps and breakthroughs
almost always belong to a particular line, not the tree as a whole. (Names
like "Ebenezer Fobes" and the "Fobes line" in design mockups are sample data —
Fobes is a surname, not a chart concept.)

**On the chart:** Chips and labels naming the surname, e.g. "⚑ Fobes — wall."

## Frontier

**Definition:** The point on a line where solid ground ends — the first
generation, climbing upward, where something needs your attention. Every line
has a frontier state:

- **Wall** — the line hits an empty slot: an ancestor no one has named yet.
  The classic genealogy "brick wall."
- **Verify** — the line continues, but on an unproven link. The next step is
  confirming a connection, not finding a person.
- **Clear** — the line runs verified all the way through generation 8.
  Nothing needs attention.

**On the chart:** Chips on the generation row: an amber "⚑ *surname* — wall"
chip, a neutral "*surname* — verify link" chip. Clear lines earn a golden
thread (below).

## Pedigree collapse

**Definition:** When the same ancestor appears in more than one slot — which
happens whenever two of your ancestors were related to each other (common in
small towns and close-knit communities, and occasionally a sign of two records
that should be untangled). It means two branches of your tree literally
converge into one person.

**On the chart:** A "◈ collapse — 2 lines" chip; the shared person is drawn at
every slot they occupy.

## Beacon

**Definition:** The place where an hour of research buys the most tree. A
beacon marks a frontier ancestor whose story, once cracked, opens the most new
ground — scored by how many lines converge there times how many generations
sit dark above it. The Ascent shows at most three, ranked, each with a
one-line explanation of why it matters ("Converges 4 lines; wall at gen 6 → 2
generations of potential discovery").

**On the chart:** An amber-highlighted segment plus a white card with the
ancestor's name, the why-statement, and a "Generate Research Brief" button.

## Golden thread

**Definition:** A line that runs verified from you all the way through
generation 8 — an unbroken, proven chain into the deep past. The label names
the line and how far back it reaches: "— Scott thread continues, verified, to
1621 —."

**On the chart:** A gold ribbon of text at the summit of the ladder.

## The Pulse

**Definition:** The one-glance summary of your whole tree's health: what
percentage of your 510 ancestor slots are filled, what percentage of those are
verified, how many beacons are lit — and the single beacon where your effort
matters most right now.

**On the chart:** The card at the base of the ladder, beneath your circle.

## Research brief

**Definition:** A focused, AI-generated starting plan for one ancestor: what's
known, what's missing, and which records to look for. Beacon cards offer one
directly because beacons are, by construction, where a brief pays off most.

**On the chart:** The button on beacon cards and the Pulse card.

---

## Notes for help-file and animation authors (not user-facing)

- **V1 honesty:** verification isn't computed yet — every filled slot
  currently reports *unverified* (green never appears) until the
  connection-confirmations feature lands. Golden threads therefore can't
  occur in V1 either. Write help copy so this isn't contradicted.
- Frontier detection in V1 is approximate (it scans whole generations, not
  strictly one line's subtree), and beacon why-statements are
  template-generated. Numbers in mockups are illustrative.
- Suggested animation beats, in model terms: fill (empty → filled), prove
  (filled → verified, brown → green), converge (two segments merging into one
  person = collapse), ignite (a beacon lighting when a wall is detected), and
  thread (gold line drawing upward when a line goes clear through gen 8).
