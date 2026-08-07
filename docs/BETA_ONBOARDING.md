# Onboarding a beta tester

Someone replies to the invitation. This is the whole process.

## 1. Create the account

From `packages/core`:

```bash
npm run create-beta-user -- their@email.com "Their Name"
```

It prints a generated password. That's what you send them.

Several at once — positional pairs, or a CSV of `email,Name` per line:

```bash
npm run create-beta-user -- a@example.com "Ada Lovelace" b@example.com "Alan Turing"
npm run create-beta-user -- --file testers.csv
```

Each run:

- creates a **confirmed** Supabase auth user (they never see a confirmation
  email — they get a password from you instead),
- comps the account with a **lifetime `premium` entitlement**, so no paywall
  and no trial clock on either iOS or web,
- prints the credentials to send.

Duplicates are reported and skipped rather than aborting the batch, so
re-running over a partly-done list is safe. Pass `--no-grant` to create an
account without comping it.

### Requires

In `packages/core/.env` (gitignored):

| Var | Where from |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | already there |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase projects api-keys --project-ref bdjsahbjptpcmouqozvs` → the `service_role` entry |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | already there |
| `REVENUECAT_SECRET_API_KEY` | already there — the **v1** key; `_V2` 403s on these endpoints |

## 2. Send them the email

Template below. It assumes the **web app**, which is where a tester with a
password and no TestFlight invite naturally lands.

---

**Subject:** Your Witness Lives access

Hi NAME,

Your account is ready. Here's everything you need to get started.

**Signing in**

Go to **https://app.witnesslives.com** — it runs in your browser, so there's
nothing to install.

```
Email:    EMAIL
Password: PASSWORD
```

That's a generated password — once you're in, feel free to set your own via
"Forgot password?" on the sign-in screen. Your account is already set up with
full access, so you won't be asked to pay or to start a trial at any point.

**Bringing your tree in**

First time through there's a short intro, then you'll land on Home, with the
main sections down the left-hand side — Home, Tree, Explore, Map and Nearby.

Home will show a card reading **"Bring your family in."** Witness reads a
GEDCOM file — the universal family-tree format that every major platform
exports. That card opens a step-by-step walkthrough for getting one out of
Ancestry, FamilySearch, MyHeritage, Findmypast, or desktop software. If you
already have a `.ged` file to hand, choose **"I already have my file"** to go
straight to the upload.

From there it's:

1. **Choose GEDCOM file** — your browser's file picker opens; pick the file and
   Witness reads it and tells you what it found.
2. **Bring them into Witness** — this makes a copy inside Witness. Nothing
   changes on Ancestry or wherever the file came from.
3. **Find me in the tree** — pointing Witness at your own record is what lets it
   work out how you're related to everyone else, so it's worth doing straight
   away.

Then have a wander — it'll remember where you left off between visits. I'd
genuinely value your read on where it helps and where it gets in the way; the
rough edges are the useful part.

Thanks for taking a look,
Rufus

**If you'd rather use it on your iPhone or iPad**

Search for **WitnessLives** on the App Store — it's a free download, and you
sign in with the same details as above. Your tree and your access are tied to
the account, not the device, so anything you've already done on the web is
simply there.

One reason to do your *first* import on the phone rather than in the browser:
the iOS app also keeps an encrypted copy of your original GEDCOM, locked with a
key that never leaves your device, and gives you a recovery code so you can get
the file back later. Save that code when it offers it. The web version can't do
this, so if you've already imported on the web and want the backup, just import
the same file again on the phone.

To get your file there: email it to yourself or drop it in iCloud Drive, then
wherever it lands — Mail, Files, Downloads — tap it, tap Share, and choose
Witness. It opens straight into the import, ready to go.

It'll ask for location the first time you open **Nearby**, and for
notifications if you want the weekly digest. Both are optional and neither
affects anything else.

---

## Notes

**No TestFlight invite is needed.** WitnessLives is live on the App Store, so
testers install it like any other app.

**Web and iOS differ in one visible way**: the encrypted-original vault is
iOS-only. `SecureStore` has no browser equivalent, so on web the vault is
absent rather than downgraded — no recovery-code step at all, and the You tab
reads "No encrypted copy of the original file — import it again to store one."

**The intro screens run on both.** They're gated on the profile's onboarding
flag, not the platform.

## Undoing a comp

```bash
curl -X DELETE \
  "https://api.revenuecat.com/v1/subscribers/<supabase-user-id>/entitlements/premium/revoke_promotionals" \
  -H "Authorization: Bearer $REVENUECAT_SECRET_API_KEY"
```

## Why the entitlement takes two API calls

RevenueCat's identity is the Supabase user id — the app calls
`Purchases.logIn(session.user.id)` on both platforms, and entitlements are not
platform-scoped, so a single grant covers iOS and web. But the promotional
grant 404s with `7259 subscriber not found` for someone who has never opened
the app, and only the **public** SDK key can create a subscriber; the secret
key is rejected on that endpoint. So: create the subscriber, then grant.
