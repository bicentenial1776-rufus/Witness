# Operator Ledger

A one-page snapshot of Witness usage for the operator: accounts and last
sign-ins (Supabase Auth), trees imported, the `usage_events` log, and the
`ai_usage_daily` cost ledger (docs/usage-monitoring-design-brief.md).

The page cannot query Supabase itself, so it is rebuilt from a snapshot:

```bash
cd packages/core
set -a; . .env; set +a            # needs SUPABASE_SERVICE_ROLE_KEY
node scripts/operator-ledger/pull.mjs /tmp/snapshot.json
node -e "const fs=require('fs');const t=fs.readFileSync('scripts/operator-ledger/template.html','utf8');const d=fs.readFileSync('/tmp/snapshot.json','utf8').replace(/<\//g,'<\\\\/');fs.writeFileSync('/tmp/witness-operator-ledger.html',t.replace('__SNAPSHOT__',d))"
open /tmp/witness-operator-ledger.html
```

The built page carries every account's email address. Keep it local, or
redact before publishing anywhere.
