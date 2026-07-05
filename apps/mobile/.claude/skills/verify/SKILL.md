---
name: verify
description: Build, launch, and drive the Witness Expo app in the iOS simulator to verify mobile changes end-to-end.
---

# Verifying the Witness mobile app

The app runs as a **native dev client** (`com.witnesslives.witness`, built with expo-dev-client) on the iOS simulator (usually an iPhone 16, often already booted — check `xcrun simctl list devices booted`). Launch it with `xcrun simctl launch booted com.witnesslives.witness` after starting Metro (`npx expo start --port 8081`); it reconnects to the last dev server. If it ever needs a rebuild (native module or app.json config change): `LANG=en_US.UTF-8 npx expo run:ios` — CocoaPods fails without the UTF-8 locale in non-interactive shells, and the first deep link into a fresh install shows an "Open in Witness?" iOS dialog only the user can click. Route deep links use the `mobile://` scheme (app.json `scheme` is still "mobile" — rename to "witness" needs a rebuild). Expo Go remains installed and still works via `exp://127.0.0.1:8081`. The test user signs in automatically in dev: `apps/mobile/.env` (gitignored) sets `EXPO_PUBLIC_DEV_AUTOLOGIN=1` plus dev credentials, which the sign-in screen honors under `__DEV__`. Live trees: Howe/Field Family Tree (5,495 people, id `c7a063aa-9ae5-4fef-be15-fb30f3835d78`) and Sample Family Tree (6 people).

There is no tap automation (AppleScript clicks are blocked without accessibility permission) — anything requiring a tap must be reached by deep link or observed indirectly. A stale JS bundle can persist across `openurl` calls: `xcrun simctl terminate booted host.exp.Exponent` first to force a fresh load. Dark mode: `xcrun simctl ui booted appearance dark|light`.

## Launch

```bash
cd apps/mobile
npx expo start --port 8081 &            # if 8081 is taken, check: curl -s localhost:8081/status
xcrun simctl openurl booted "exp://127.0.0.1:8081"
```

If `@witness/core` changed, rebuild it first (`npm run build` in packages/core) — the app resolves core from `dist/`.

## Drive

No tap automation is available; drive with deep links (expo-router paths work through Expo Go's `/--/` prefix):

```bash
xcrun simctl openurl booted "exp://127.0.0.1:8081/--/digest?treeId=c7a063aa-9ae5-4fef-be15-fb30f3835d78"
xcrun simctl io booted screenshot /tmp/screen.png   # then Read the PNG
```

Edits hot-reload; give it ~5s after saving before re-screenshotting.

## Live data checks

For query-layer verification without the UI, write a `.mts` script (must be `.mts` — tsx treats scratchpad `.ts` as CJS and top-level await fails) importing from `packages/core/src`, using `scripts/env.js` `loadEnv()/requireEnv()` and the `WITNESS_TEST_USER_EMAIL/PASSWORD` credentials in `packages/core/.env`, then run with `npx tsx` from `packages/core`.

## Gotchas

- Supabase Edge Function calls fail quietly in-app until the function is deployed (`supabase functions deploy <name>`) — deploys and `supabase db push` require user approval.
- Toggles/buttons can't be exercised without a tap tool; verify their logic via the code path a deep link or app relaunch triggers, and say so in the report.
