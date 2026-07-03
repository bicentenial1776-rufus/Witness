# Handoff: Witness — Password-Protected Preview Site

## Overview
A single-page, password-gated teaser/preview website for **Witness — Family History Intelligence** (tagline "Witnesses to History", witnesslives.com). It is shared privately with early contacts — genealogy influencers, potential advisors, and beta users — to explain the product and invite feedback. It is **not** the public marketing site. The intended feeling is an exclusive, considered private invitation: warm, timeless, dignified — not a startup landing page.

The page has two states:
1. **Locked** — a minimal password gate.
2. **Unlocked** — a long-scroll page of eight stacked sections.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing the intended look, copy, and behavior. They are **not** meant to be shipped verbatim. The `.dc.html` file uses a small in-house runtime (`support.js`) to render an HTML template + a logic class; **do not port that runtime**. The task is to **recreate this design in the target codebase's environment** (e.g. React/Next.js, Astro, plain HTML/CSS, etc.) using its established patterns. If no codebase exists yet, a static site (plain HTML/CSS + a touch of JS, or Astro/Next) is the most appropriate choice — this is a brochure-style page with one small piece of interactivity (the password gate).

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, copy, and layout are all specified below and should be recreated faithfully. Exact hex values, font stacks, and the verbatim copy are all included.

---

## Design Tokens

### Colors
| Token | Hex | Usage |
|---|---|---|
| Ink (primary bg) | `#1C1917` | Dark section backgrounds, gate background |
| Ink deep | `#14110F` | `html/body` base background |
| Ink card | `#241E1A` | "What I'm Looking For" ask cards |
| Ink card 2 | `#2A2018` | Vision section feature cards |
| Parchment | `#F7F3EE` | Light section backgrounds |
| Parchment card | `#FBF8F3` | Query cards in "What It Does" |
| Parchment bright | `#F9F5F0` | Display headings on dark |
| Amber (accent) | `#B45309` | Primary accent — key terms, wordmark dot, buttons, dividers |
| Amber light | `#E0913A` | Accent on dark backgrounds (eyebrows, italic emphasis, numbers) |
| Amber pale | `#E9C9A0` | The italicized "Witness" word in the hero headline |
| Stone (body on parchment) | `#57534E` | Secondary body text on light |
| Stone dark | `#3A3532` | Query-card result text |
| Warm grey | `#78716C` | Card eyebrow labels |
| Muted parchment | `rgba(247,243,238,0.68–0.85)` | Body text on dark |

### Typography
- **Display / headings:** `'Playfair Display', serif` — Google Fonts, weights 400/500/600/700 + italic 400/500/600.
- **Body / UI:** `'Inter', sans-serif` — Google Fonts, weights 400/500/600.
- Section eyebrows: Inter, 13px, `letter-spacing: 0.34em`, `text-transform: uppercase`, weight 500, amber.
- Hero headline: Playfair 500, fluid `clamp(2.1rem, 5vw, 4.4rem)`, `line-height: 1.12`.
- Section headings: Playfair 500, `clamp(2rem, 3.6vw, 3.1rem)`.
- Vision headline ("Walk among them."): Playfair 600, `clamp(3rem, 7vw, 6rem)`, amber `#B45309`.
- Body copy: Inter 400, `clamp(16px, 1.3vw, 18.5px)`, `line-height ~1.7`.
- `::selection` = amber bg / parchment text.

### Spacing / layout
- Section vertical padding: `clamp(72px, 10vw, 140px)`; horizontal `clamp(24px, 6vw, 96px)`.
- Content max-width: 1240–1280px, centered (`margin: 0 auto`).
- Border radius: cards 15–16px; inputs/buttons 10px.
- Card grids use `display:grid; grid-template-columns: repeat(auto-fit, minmax(<260–340>px, 1fr)); gap: 22–24px` — this is the whole responsive strategy (see below).

### Responsive behavior
Fully fluid **without media queries**:
- All font sizes and section padding use `clamp()`.
- All multi-column layouts use `repeat(auto-fit, minmax(Npx, 1fr))`, so columns automatically restack to one column on narrow viewports.
- Hero uses `min-height: 94vh` with a centered flex column.
You may reimplement with breakpoints if the target codebase prefers them, but the clamp+auto-fit approach is intentional and works from ~360px to ultra-wide.

---

## The Password Gate

- **Behavior:** Client-side only. A single password field (no username), a submit button. Correct password reveals the page; wrong password shows a gentle message.
- **Password:** `witnesses` (compared case-insensitively, input trimmed).
- **Persistence:** On success, sets `localStorage['witness_preview_unlocked'] = '1'` and, on next load, auto-unlocks. Scroll resets to top on unlock.
- **Error message (verbatim):** "This preview is by invitation. Contact rufus@witnesslives.com to request access." (shown below the button; `rufus@witnesslives.com` in amber light `#E0913A`).
- **Gate layout:** Full-viewport ink background, centered. Wordmark `WITNESS` (Playfair 600, `letter-spacing: 0.28em`, 38px) + amber dot; eyebrow "Witnesses to History" (amber light, `0.42em` tracking). Below, max-width 360px column: micro-label "BY INVITATION", password input (translucent fill `rgba(247,243,238,0.04)`, 1px border `rgba(247,243,238,0.2)`, focus border amber, centered text), full-width amber submit button labeled "ENTER" (hover `#9A4708`).

> **Security note for the developer:** this is a soft, invitation-level gate, not real security — the password is visible in client code. If the client wants genuine protection, gate it server-side (e.g. an edge/middleware Basic-Auth check or a serverless function that validates a shared secret and sets an httpOnly cookie) rather than in JS.

---

## Screens / Views (the unlocked page, top to bottom)

All sections are full-width; backgrounds **alternate** ink / parchment for rhythm. No bullet points anywhere. The whole unlocked wrapper fades in once (`@keyframes wv-fade`: opacity 0→1, translateY 12px→0, 0.7s ease).

### 1. Hero — dark (image)
- `min-height: 94vh`, `position: relative`, ink background.
- Full-bleed hero image (`assets/hero.png`), `object-fit: cover`, `object-position: 50% 38%`.
- Overlay gradient (top→bottom): `rgba(20,17,15,0.66) → 0.15 (32%) → 0.28 (58%) → 0.9 (100%)` for legibility.
- Top-left absolute: `WITNESS` wordmark (Playfair 600, 26px, `0.24em`) + amber dot.
- Centered: eyebrow "Witnesses to History"; headline **"Your ancestors witnessed history. _Witness_ lets you witness them."** — "Witness" is italic in pale amber `#E9C9A0`; line break before it. Text shadow for depth.
- Bottom edge: 3px amber gradient hairline (`transparent → #B45309 → transparent`).

### 2. The Problem — parchment
- Two columns (`minmax(340px,1fr)`).
- Left: eyebrow "THE PROBLEM"; large Playfair pull-quote **"You have thousands of ancestors. You can't answer the _simplest questions_ about them."** ("simplest questions" amber italic).
- Right: three paragraphs (verbatim):
  1. "A serious genealogist can spend years building a tree of five thousand people — and still have no way to ask it who was alive during a war, who lived in the town they're visiting, or which life among all those names was the most extraordinary."
  2. "Ancestry and FamilySearch are excellent at what they were built for: research and construction. But discovery, analysis, and meaning-making are afterthoughts. The tree grows, and the questions that would make it matter go unanswered."
  3. (ink color, emphasis) "Witness is the intelligence layer built for exactly that gap — the questions a family tree should be able to answer, and finally can."

### 3. What It Does — dark
- Centered header: eyebrow "WHAT IT DOES"; heading **"What Witness can tell you."**
- Grid of **six** parchment (`#FBF8F3`) query cards (`minmax(300px,1fr)`, gap 24px). Each card: a warm-grey uppercase category label, a Playfair question, then a divider and an amber "→" with the result (key figure in amber `#B45309`, weight 600). Cards:
  1. **Temporal** — "Who in my family was alive during King Philip's War?" → **1,046 ancestors**, with names, ages, and locations.
  2. **Geographic** — "I'm standing in this cemetery — is anyone here related to me?" → **3 confirmed matches** within 200 meters.
  3. **Remarkable Lives** — "Who was the most remarkable person in my family tree?" → **Catherine Marbury Scott**, half-sister of Anne Hutchinson, 1621–1687.
  4. **Branch Focus** — "My family identifies as Acadian — show me that branch." → **43 ancestors**, Grand-Pré to Quebec, the Grand Dérangement traced.
  5. **Research Brief** — "I've hit a brick wall. What should I research next?" → An AI research brief with **7 prioritized questions** and specific archives.
  6. **This Week** — "What should I know about my family this week?" → **Ebenezer Howe** was born on this day in 1743 and lived 81 years through the Revolution.

### 4. The Experience — parchment
- Centered header: eyebrow "THE EXPERIENCE"; heading **"Three moments where the tree comes alive."**
- Three columns (`minmax(300px,1fr)`). Each: amber index (01/02/03) + Playfair title; a small dark "chip" showing a concrete artifact; a descriptive paragraph.
  1. **The First Revelation** — chip: `1,046` (amber) "alive during King Philip's War". Copy about one question reordering how you see your family.
  2. **The Field Moment** — chip: green pulse dot + "GPS match · 38m · North Burial Ground". Copy about standing in a cemetery and a 4th-great-grandmother 38m away.
  3. **The Ancestor Encounter** — chip: "Catherine M. Scott · 1617–1687". Copy about a name becoming a life via a warm biography.

### 5. What Makes It Different — dark
- Eyebrow "WHAT MAKES IT DIFFERENT"; heading **"Witness deepens over time. _It doesn't exhaust itself._"** (second sentence amber italic).
- Four blocks (`minmax(260px,1fr)`), each with a 1.5px top divider `rgba(247,243,238,0.16)`, amber number, Playfair title, two-sentence description:
  1. **Branch Focus** — designate a heritage; the whole product reorients around it.
  2. **Research Brief Generator** — every brick wall becomes a structured research document.
  3. **Annual Family Wrapped** — a December summary of the family's year in history; a returning ritual.
  4. **The Inheritance Transfer** — the archive built to be handed on, with a letter, as a gift.

### 6. The Vision — Family Street View — dark (atmospheric)
- The emotional peak. Same hero image reused as a **low-opacity (0.22) atmospheric background** with a radial amber glow + ink gradient over it (distinct from the full-bleed hero).
- Centered: eyebrow "THE VISION · FAMILY STREET VIEW"; giant Playfair amber headline **"Walk among them."**; a single paragraph (verbatim): "Every genealogy tool ever built asks you to look at your family tree from the outside. Witness inverts that entirely. Family Street View puts you **inside** the tree — walking from house to house through the generations, your ancestors present in the rooms around you, the time slider aging them in real time as you move through their world."
- Three dark cards (`#2A2018`, 1px amber border `rgba(180,83,9,0.5)`): **The Room**, **The Time Slider**, **The Back Door** (copy in the HTML).
- Closing line, centered, Playfair italic amber: "A proof of concept exists. The production version ships shortly after launch."
- **Note:** the original content brief listed 7 sections; this Vision section was added at the client's request to feature Family Street View prominently. Keep or drop per client direction.

### 7. About the Project — parchment
- Optional circular photo (150px) on the left (currently an empty placeholder — see Assets).
- Eyebrow "ABOUT THE PROJECT"; large Playfair first-person statement: "I'm Rufus Howe. I've spent years building a family tree of over 5,000 people — and kept running into the same frustration: the tools are excellent for building, and poor for discovering." + a supporting paragraph; then "witnesslives.com" in amber.

### 8. What I'm Looking For — dark
- Centered eyebrow "WHAT I'M LOOKING FOR"; large heading **"I'd value your perspective."**
- Three amber-accented ask cards (`#241E1A`, border `rgba(224,145,58,0.3)`): **01 Twenty minutes**, **02 Early access**, **03 Introductions** (copy in HTML).
- Closing Playfair italic line: "This preview is shared by invitation. Thank you for taking the time."; email `rufus@witnesslives.com` (amber light).
- Footer: `WITNESS` wordmark + amber dot + "witnesslives.com".

---

## Interactions & Behavior
- **Password submit:** on `<form>` submit (Enter or button), trim + lowercase the input, compare to `witnesses`. Match → set localStorage flag, set unlocked state, scroll to top. No match → show the invitation error message.
- **Auto-unlock:** on load, if the localStorage flag is set, render unlocked directly.
- **Reveal animation:** unlocked wrapper fades/rises in once (0.7s).
- **Hover states:** submit button darkens to `#9A4708`; input border turns amber on focus.
- **Smooth scroll:** `scroll-behavior: smooth` on `html`.
- No other JS. No data fetching. No external APIs.

## State Management
Two pieces of state: `unlocked: boolean` and `error: boolean`. Triggers: form submit toggles them; `localStorage` seeds `unlocked` on mount. Trivial — a single `useState`/signal in the target framework.

## Assets
- **`assets/hero.png`** — the hero oil painting (a present-day silver-haired man in a dark jacket, viewed from behind, standing among his mid-1800s New England ancestors by candlelight; the man is faintly translucent). Used full-bleed in the Hero and at 0.22 opacity in the Vision section. **Included in this bundle.** Client-supplied; swap if a higher-res master exists.
- **About-section photo:** optional portrait of Rufus Howe — **not yet provided**; leave a placeholder or omit.
- **Fonts:** Google Fonts — Playfair Display + Inter (see the `<link>` in the HTML `<head>`/helmet). Self-host for production if preferred.
- No icon library is used; the only "icons" are CSS dots/arrows and a green pulse dot.

## Files
- **`Witness Preview Site.dc.html`** — the design prototype (HTML template + logic class). The authoritative reference for copy, colors, and layout. Read the markup for exact inline styles and full copy.
- **`support.js`, `image-slot.js`** — in-house runtime + the optional photo-slot web component used by the prototype. Included for completeness only; **do not port these** — recreate their effect natively (the photo slot is just an `<img>` placeholder).
- **`assets/hero.png`** — hero image.

### Screenshots
The `screenshots/` folder contains a high-res reference capture of each section, top to bottom:
- `01-section.png` — Hero
- `02-section.png` — The Problem
- `03-section.png` — What It Does (six query cards)
- `04-section.png` — The Experience
- `05-section.png` — What Makes It Different
- `06-section.png` — The Vision (Family Street View)
- `07-section.png` — About the Project
- `08-section.png` — What I'm Looking For

### How to preview the prototype as-is
Serve the folder over a static server (the files use relative paths and the runtime fetches `support.js`), open `Witness Preview Site.dc.html`, and enter the password `witnesses`.
