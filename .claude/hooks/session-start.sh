#!/bin/bash
# SessionStart hook for Claude Code on the web: put the container in a state
# where the checks in apps/mobile/AGENTS.md ("Verifying changes") run at once.
# Local sessions already have their own node_modules and are left alone.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Chromium is pre-installed in the web container; a fresh download would
# just fail against the network policy.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# One install covers every workspace (packages/*, apps/*). `npm install`
# rather than `npm ci` so a cached container skips work it already did.
npm install --no-audit --no-fund

# @witness/core exports from dist/, so the app's typecheck and web export
# fail with stale or missing types until it is built (docs/tech-stack.md).
npm run build --workspace @witness/core
