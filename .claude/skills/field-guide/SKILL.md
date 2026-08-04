---
name: field-guide
description: Update the Witness Field Guide — the hidden, annotated-screenshot documentation at witnesslives.com/guide. Use after app UI changes to refresh affected pages, when new screenshots arrive to wire and annotate them, or to add a new screen's page. Keeps copy, callouts, and the manifest in sync with the app.
---

# The Witness Field Guide

Unlisted, screen-by-screen documentation of the Witness app: concise copy plus
pristine screenshots annotated with numbered callouts. Lives in
`apps/preview-site/guide/` and deploys with the site (Vercel, project
"witnesslives", auto-deploys on push to `main`). All guide pages carry
`<meta name="robots" content="noindex, nofollow">` and are linked from nowhere
public — keep it that way.

## Files

- `apps/preview-site/guide/manifest.json` — the source of truth: every page,
  the app source files it documents, its screenshots and their status
  (`pending` | `placed`), a backlog of unwritten pages, and
  `lastSyncedCommit` — the apps/mobile commit the current copy describes.
- `guide.css` — shared styles. Design tokens follow the preview-site system
  (ink `#1C1917`, parchment `#F7F3EE`, amber `#B45309`, Playfair Display +
  Inter). Do not invent new tokens.
- One HTML page per surface + `index.html` (the contents page).
- `shots/` — screenshots, phone-portrait PNG, named per the manifest.

## The annotation system (the load-bearing convention)

Screenshots stay pristine — nothing is ever drawn onto the image. Annotations
are HTML: numbered callout dots (`.co`) absolutely positioned over the image
with PERCENTAGE coordinates, paired with a `.legend` ordered list whose CSS
counter numbers match. A rectangular region uses `.cbox` (percent
left/top/width/height) with a `.co` pinned at its corner.

```html
<div class="figure">
  <div class="shot">
    <img src="shots/this-week.png" alt="This Week screen">
    <span class="co" style="left:50%; top:6.2%">1</span>
    <div class="cbox" style="left:6%; top:18%; width:88%; height:30%"><span class="co">2</span></div>
  </div>
  <ol class="legend">
    <li><strong>…</strong> explanation matching callout 1.</li>
    ...
  </ol>
</div>
```

A missing screenshot renders as `<div class="shot pending">…</div>` naming the
exact shot needed and its target filename — an honest placeholder, never a
broken image.

## Procedures

### A. Sync after app changes (the usual invocation)

1. Read `manifest.json`. Diff the app since the copy was last true:
   `git log --oneline <lastSyncedCommit>..HEAD -- apps/mobile/src packages/core/src`.
2. For each commit, match touched files against each page's `appSources`.
   Judgment beats globbing: a change to a lib (e.g. `parentage.ts`) can affect
   several pages' copy.
3. For each affected page: update the copy and legend text to describe the new
   behavior. If the change is visible in a screenshot, flip that shot's status
   back to `pending`, swap the `<img>` figure back to a `.pending` placeholder
   naming what to reshoot, and tell Rufus exactly which screens to reshoot and
   how to stage them.
4. Set `lastSyncedCommit` to the app HEAD the copy now describes.
5. Commit and push (see Deploy).

### B. Wire an arriving screenshot

1. Rufus drops PNGs in `apps/preview-site/guide/shots/` (or provides them in
   chat — then Write them there). Match each to its manifest entry by content,
   not just filename.
2. **Read the image** with the Read tool. Identify each element the page's
   legend describes and estimate its position as percentages of the image
   width/height (origin top-left). iPhone shots are ~9:19.5; the status bar
   occupies roughly the top 3%.
3. Replace the `.pending` div with the `.shot` figure: `<img>` plus one
   positioned `.co` per legend item, in legend order. Prefer dots just beside
   the element (not covering text); use `.cbox` when a whole region is the
   subject.
4. Set the shot's manifest status to `placed`. If the screenshot reveals the
   legend text was wrong or stale, fix the text — the image is the authority.
5. Visually re-read the final HTML for coordinate sanity (no dot at 0,0, no
   overlaps), then deploy.

### C. Add a new page

1. Copy the structure of `this-week.html` (masthead → nav → eyebrow → h1 →
   lede → "How you get here" → figure(s) → notes → foot).
2. Read the actual screen source under `apps/mobile/src/app/(app)/` first —
   the guide documents what the code does, not what anyone remembers. Note the
   distinction that recurs everywhere: featuring/scope affects *celebration*,
   never *visibility*.
3. Add the page to `manifest.json` (with `appSources` and pending shots), to
   the nav of the sibling pages, and to `index.html`. Remove it from the
   backlog if it was there.

### D. Deploy

Commit with the rest of the repo and push to `main`; Vercel redeploys the site
automatically. The guide's URL is https://witnesslives.com/guide/ — spot-check
it after deploy when the change was structural. No build step exists; what's
in the folder is what ships.

## Voice

Match the app's register: warm, precise, dignified; no bullet-point listicles
in body copy; short declarative sentences. Explain *meaning*, not chrome
("the amber enclosure is the marriage — a spouse's thread running past it is
widowhood"), and always say what absence means (no mark = not blood; no
parentage line = no recorded parents). The reader is family, not a customer.
