# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Hard rules

- **Never call `Alert.alert` directly** — react-native-web stubs it to a silent no-op. Use `showAlert` / `showDestructiveConfirm` from `src/lib/alert.ts` (web variants use `window.alert` / `window.confirm`).
- **Expo modules often stub out on web.** `expo-file-system`'s `File`, `Alert`, and others are console-warn no-ops there. Before using a native-flavored API on a screen that renders on web, check its `.web` behavior; add a `.web.ts` variant or platform branch (e.g. the import screen reads the picker's browser `File` via `arrayBuffer()` on web).
- **One visual system.** Letterpress + Broadsheet tokens in `src/constants/theme.ts` — no new colors, no gradients, squared corners, hairline rules. All record data (dates, years, counts, distances) renders in mono via `RecordText`.
- **Web ≥900px is the Broadsheet carrier**, gated by `useBroadsheet()`: pages wrap in `PageShell` + `Masthead` (`src/components/broadsheet/`), the left rail mirrors the four phone tabs (Home · Tree · Explore · Map — phone-ia brief decision 2, amended 2026-08-08: Nearby folded into Map as its NEAR ME mode, `/nearby` on web; the freed fifth slot stays deliberately empty), and the phone tab bar takes over below 900px. Detail-on-wide is a right-slide drawer, rendered outside PageShell.
- **A screen that navigates to itself with a different subject keys on a PATH param** (`family-stage/[key]`, `ancestor/[id]`), never a query param — expo-router does not treat query-param changes as a new screen.
- **Tree-scoped tables need explicit `tree_id` filters.** RLS is per-user, not per-tree; a query without the filter silently mixes trees for multi-tree users.
- Living-person rules: nothing shareable may include a living person; unknown death ≠ living; `~` marks floor-not-fact ages; grey ink for unrecorded sex.

# Data-model facts

- GEDCOM import (`src/app/(app)/import.tsx` → `packages/core/src/supabase/import.ts`) is **not idempotent** — every import creates a new tree; there is no merge/update path yet.
- The active tree is the user's **largest** by `individual_count` (`src/lib/active-tree.tsx`); there is no switcher UI yet.
- Tree deletion loops the `delete_tree_batch` RPC until done, then invalidates the geography, relationship, curiosities, and tree-index client caches (see `you.tsx`).
- `reuse_geocodes` copies coordinates from any tree sharing the same raw place string; the pg_cron worker geocodes the rest.

# Verifying changes

- Typecheck: `npx tsc --noEmit`. Web bundle: `npx expo export --platform web`. iOS simulator: use the `verify` skill in `.claude/skills/`.
- Web smoke tests: install Playwright in the session scratchpad, serve `dist/` with an SPA fallback (any 404 → index.html), sign in with the test credentials in `packages/core/.env`. Headless map testing needs `--enable-unsafe-swiftshader`.

# Deploying the web app

Production Vercel deploys must be run by Rufus (the permission classifier blocks agent-run `vercel` commands). Stage everything, then hand off:

1. `npx expo export --platform web`
2. Copy into a directory **outside the repo**: `dist/*`, `public/maplibre-gl-*.mjs`, `public/og-share.png`, `web-deploy/*` (vercel.json + api/)
3. `sed` the favicon link to `/favicon.ico?v=2`
4. Rufus runs: `npx vercel link --project witness-app --scope notata --yes && npx vercel deploy --prod --yes`
5. Verify: live `entry-*.js` hash matches local `dist/index.html`.
