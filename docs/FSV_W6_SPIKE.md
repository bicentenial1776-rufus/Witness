# The hidden door — the week-six trial

*2026-09-02. Written for Rufus, and for whoever opens this next. Part one is
the pull request description. Everything after it is the recipe: every
command in order, with nothing left to guess.*

---

## Part one — what this change is

There is now a hidden screen in the app that opens the walkable world.

It is not a tab. Nothing links to it. No other screen mentions it. The only
way in is to type its address. That is what the bridge brief asked for — the
week-six trial behind a hidden route rather than a tab — and it is the right
shape for something nobody has run yet.

The screen has two doors onto the same world.

**The main door** is the world carried inside the app. The world is one
self-contained web page, about three and a quarter megabytes, built in the
design repository. The app now ships that page as one of its own files and
shows it in a web-page panel. This is the first such panel in the app:
nothing here has used one before, and the app on the store was never built
with one. Its first run on a device is an experiment, and should be read as
one.

**The fallback door** is a single button that opens the hosted world in the
app's own built-in browser view — the same one the ancestor screen and the
field guide already use. It adds nothing to the app. If the main door comes
up blank, the session still yields a number. There is no hosted address yet,
so the button says so instead of pretending; one line at the top of the
screen is where that address goes, and the door starts working the moment
someone fills it in.

Both doors hand the world an address that switches its own measuring readout
on, because taking a number is the only reason the screen exists.

## Why it exists this week

Nobody has ever measured the world on a device inside the app. Not once.
Every number we have was taken on a Windows desk with a discrete graphics
chip, which tells us nothing about a tablet. The shell decision from August
says the walkable world lives inside the app if it clears a bar and lives in
a full-screen browser if it does not — and that decision has been waiting on
a number that could not be taken, because there was no door to take it
through. This change is the door, and nothing more.

## What it does not do

- It adds no part to the app and moves no version. The web-page panel is
  already in the toolkit the app is built from; the built-in browser view is
  already used in six places. No third-party web view was added.
- It changes nothing a reader can reach. The screen is unreachable unless
  you type its address, and no behaviour anywhere else in the app is
  altered. It does add weight to every build, though, and that should be
  said plainly: the web-page panel compiles into a small bundle of its own —
  one page and about a quarter of a megabyte of script — and the world
  itself, three and a quarter megabytes, is carried inside the binary
  whether or not anyone ever types the address. That is the true cost of the
  trial, and it is one of the reasons this is a branch to look at rather
  than something to merge.
- It does not feed the world from the tree. The world it opens is the baked
  demonstration file as it stands today. The live path is a later job.
- It does not check that sign-in or the subscription gate carry into the
  panel. That can ride along on the same build if there is time, but it is
  not what this is for.
- It touches nothing else in the app: one line of bundler configuration, one
  new screen, and the one new panel that line exists for. The copy step and
  the world's folder are exactly as the earlier branch left them — the app
  now reads the world out of that folder rather than keeping a second copy
  of its own, so nothing about the copy step changed.
- It commits no part of the world. The world's folder is the one this
  repository is told to ignore, and the app reads it from there, so there is
  no tracked file anywhere that a copy step writes three megabytes over.
  Nothing you can do with an ordinary commit puts the world in this history.
  The price of that is in step 3 below: copy the world in before you build,
  or the build stops.

## The bar

On whichever iPad is in your hand:

- **At least 50 frames a second** walking a settled stretch of the field.
- **At least 30 frames a second** through the transitions — crossing a
  threshold, stepping into a room.
- **No reload in ten minutes.** A reload is how iPadOS kills a page that has
  used too much memory. Read this reading from the report itself rather than
  from any one line in it: a walk that finishes and hands you all ten
  minutes is proof there was no reload, because a reload ends the walk. If
  the walk is killed there is no report at all — you come back to a world
  that has forgotten it was walking, and pressing copy gives you only the
  numbers as of that moment. That is the reload, and it is the same answer
  whichever way you get it.

  The world also tries to leave itself a mark at the start of the walk so it
  can name the minute it died on. That mark needs the small scratchpad the
  browser gives a page, which a page opened from a file is sometimes refused
  — and both routes in this recipe open the world from a file. If it was
  refused, you get the silence above instead of the detail, and nothing is
  wrong. So what you write down is the plain thing: did a complete
  ten-minute report come out, yes or no.

Three readings, one session. If the first fails, the readout carries four
dials — sharpness, shadows, ground cover, and how far the fog lets you see —
and the honest question then is which dial rescues it and at what cost to
the look.

**Greg names the iPad in the pull request.** Three documents currently name
three different tablets, and a pass or a fail means nothing until one of
them is the one we meant. The readout prints whatever chip the browser is
willing to name, so the report will say what it actually ran on either way.

## What was checked, and where it stops

On Windows, with the install fix that is stacked underneath this change:

- The app's type check reports **four errors before this change and four
  after** — the same four, all of them the pre-existing stylesheet-import
  errors that are on the main line too. None new.
- The app's linter reports **119 problems before and 119 after**, 74 of them
  errors. It names neither new file.
- An iPad bundle was exported on Windows, which is as close to a build as
  this machine can get. The world came through it whole — three and a quarter
  megabytes, and its checksum is identical to the built page in the design
  repository, so it is the same file down to the byte, not merely the same
  size. The web-page panel compiled into its own small bundle alongside. So
  the world does travel inside the app, and it travels unchanged.
- The world is carried the same way the app already carries its typefaces:
  as a file that lives outside the app's own folder but inside this
  repository, which the bundler has been reading from since the app was
  built. So the arrangement is not new ground, only a new file.

What that does **not** prove, and only your Mac and your tablet can: that
the panel actually paints the world once it is on the device. Everything up
to the device is checked; the device is yours.

---

## Part two — the recipe

Ten steps, about half an hour of your time if nothing argues. Every command
is meant to be typed exactly as written.

### 1. Take the changes

```bash
git fetch origin
git checkout fsv/w6-spike
```

This branch sits on top of two others that are also waiting for you: the one
that gives the world a home in this repository, and the one-line fix without
which the install does not finish on Windows. Both are merged in here, so
this one branch is all you need to try it.

### 2. Install

From the top of the repository:

```bash
npm install
```

One thing to expect rather than worry about: this rewrites the lock file the
first time, because the earlier branch added a folder to the workspace and
the lock was never regenerated for it. Your repository will look dirty
straight after installing, and that change belongs to that branch's review,
not to this one. Leave it alone, or put it back with

```bash
git checkout -- package-lock.json
```

### 3. Copy the world in

**Do this before you build. The build stops without it.**

The world is not kept in this repository — it is three and a quarter
megabytes and it is rebuilt every time it changes, so carrying it would grow
the history by that much every time. It is copied in instead:

```bash
npm run world:sync -w @witness/fsv
```

That looks for a checkout of the design repository next to this one, or
wherever an environment setting points. If it finds one it copies the world
into the world's folder in this repository and prints where it put it. If it
does not, it stops and tells you what it looked for.

**If you have no checkout of the design repository**, Greg sends you the
single built page and you put it here by hand, making the folder if it is
not there:

```
apps/fsv/public/world/witness_fsv_demo.html
```

That folder is the one this repository is told to ignore, so nothing you put
in it can be committed by accident, and there is nothing to undo afterwards.
The app reads the world from there and carries it inside the binary.

If you skip this step the build stops at the screen that wants the world,
with a message about not being able to resolve it. That is on purpose: the
alternative was to commit a small stand-in page at that path so the build
always succeeds, and a stand-in is a page that looks like the world right up
until you measure it. Come back here and run the copy step.

### 4. Generate the iPad project

From the app's own folder:

```bash
cd apps/mobile
npx expo prebuild -p ios --no-install
```

### 5. Install the iPad parts

Your own notes require a text-encoding setting on this step, without which
the installer crashes on Ruby 4 with a message about normalization not being
appropriate for one of the older text encodings. The setting, exactly as
your notes give it:

```
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
```

So:

```bash
cd ios
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
cd ..
```

### 6. First quick build, on your device

With the iPad attached and unlocked:

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios --device
```

Pick your iPad from the list. This is the fast, unpolished build. It is
slower than the finished-quality one and its numbers are pessimistic, but
the graphics work is the same, so it is the right first reading.

### 7. Open the hidden screen

The app is running. Leave it running. On the iPad, open Safari, type this
into the address bar and go:

```
mobile://field
```

If the app opens on its own developer launcher instead of on the field,
open the app first and let it finish loading, then type the address again.
In a finished-quality build there is no launcher and the address goes
straight to the screen.

You should see the world fill the screen, with a thin bar at the bottom of
it. If instead you see a black rectangle, or the app's own background, the
main door did not load. Please write down which of the two it was, then use
the button in that bottom bar — the fallback door — so the session still
yields a number. It only works once somebody has filled in a hosted address;
if nobody has, part five below is the way to get a number today.

### 8. Switch measuring on

The readout is off by default and off means off. Two ways in:

- **Three taps** within about three quarters of a second, in the top-left
  corner of the world — roughly a thumb's width square.
- **The letter M**, if a keyboard is attached.

A panel appears in that corner: frames a second now and the worst frame in
the last ten seconds, triangles, draws, sharpness, the size of the drawing
area, and whatever the browser will say about the graphics chip.

### 9. Walk for ten minutes

Press:

```
Walk 10 minutes
```

Then put the iPad down and leave it alone. The world drives itself — it
rides the self-driving tour that crosses the field and goes into a room,
started again each time it ends — because walking is a keyboard job and
turning is a drag, and a tablet with no keyboard cannot do either. Every
minute is written down: average and worst frames a second, triangles, draws,
where the walker was, and how the dials were set.

Touching the screen stops the walk early. That is deliberate — it is the way
out — but it also ends the measurement, so leave it be.

### 10. Copy the numbers and paste them

When it finishes, press:

```
Copy the numbers
```

That puts the whole report on the clipboard as plain text. Paste it into the
pull request.

**The third reading — did the page reload — is the shape of what you get,
not a line inside it.** A report with all ten minutes in it means the page
did not reload, because a reload would have ended the walk; the report says
so on its first line and you can take that line at its word. If instead you
come back to a world that has forgotten it was walking — the button offering
to walk ten minutes again, and copying giving you a few lines of numbers as
of right now rather than ten minutes of them — then the page reloaded, and
that is the answer even though nothing says the word. The world does try to
leave itself a mark so it can name the minute it died on, but that mark
needs the small scratchpad a browser gives a page, and a page opened from a
file is sometimes refused it. So please write down which of the two you got,
in a sentence, alongside the paste.

---

## Part three — the official number

The quick build's numbers are pessimistic. The number we would quote is from
the finished-quality build, installed the way a reader would get it. That is
your call on time — the quick build is what this week aims at — but if you
want it, it is your own release pipeline, unchanged, with the build number
bumped first:

```bash
npx expo prebuild -p ios --no-install
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install && cd ..
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 xcodebuild \
  -workspace ios/Witness.xcworkspace -scheme Witness -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath <path>.xcarchive archive -allowProvisioningUpdates
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 xcodebuild -exportArchive \
  -archivePath <path>.xcarchive -exportPath <path> \
  -exportOptionsPlist ExportOptions.plist
xcrun altool --upload-app -f <path>.ipa -t ios \
  --apiKey 3L6KTSQN4U --apiIssuer <issuer id>
```

Then install through TestFlight, and run steps 7 to 10 again on that build.
Label the report so we know which build it came from.

The signing, the team, the upload key and the issuer identifier are all
yours and only exist on your machine. Nothing in this recipe can be run
without them.

## Part four — reading the world's own log

The world writes to its own log — errors from the graphics layer, the
readout's own notes. To see that log while it runs on the iPad, attach
Safari's Web Inspector from your Mac:

1. On the iPad: Settings, then Apps, then Safari, then Advanced, and turn on
   Web Inspector.
2. On the Mac: Safari, then Settings, then Advanced, and turn on the menu
   for web developers.
3. Connect the iPad to the Mac with a cable and trust it.
4. Open the field screen on the iPad. On the Mac, in Safari's Develop menu,
   the iPad appears, and under it the app, and under that the world.

The screen already asks the panel to allow this, so it works in the
finished-quality build too, not just the quick one.

## Part five — the fifteen-minute version, no app at all

If the build is more time than you have this week, there is a shorter path
that still answers most of the question. The world runs on the same browser
engine and the same graphics path inside the app as it does in Safari, so
frames a second, triangles and draws all carry over. What it cannot tell us
is the memory ceiling inside the app — that is exactly the reload reading,
and only the app can give it.

1. Greg sends you the single built page — by AirDrop, or by mail.
2. On the iPad, open it from the Files app. It opens in a page view with no
   address bar, which is precisely why the readout has a three-tap corner
   switch.
3. Three taps in the top-left corner.
4. Press "Walk 10 minutes", put it down, come back.
5. Press "Copy the numbers" and paste the report into the pull request. The
   same rule as step 10 applies here, and for the same reason: ten minutes
   in the report means it survived; no report at all means it did not.

If a hosted address exists by then, open that in Safari instead and add
`#measure` to the end of it, which switches the readout on without the taps.

---

## What we are asking for, in one line

One pasted report from inside the app, or — if the main door comes up blank
— one pasted report from the fallback door plus one line saying what the
main door did instead.
