# Historical record registers — data

One directory per register. `register.json` is the catalog row (key,
display name, variant A/B/C, provenance label, coverage caveat, config —
exposure windows and places, match knobs, deep-link template, the "?"
explainer text). `records.csv` holds Variant A/B rows; `events.csv` holds
dated/placed record events. Keep the raw source text beside the parsed
files, the immigrant-ships rule: **no record fact is authored here** —
every row cites the public-domain transcription it came from, and
copyrighted compilations are finding-aid links only.

Seed with:

```bash
cd packages/core
npx tsx scripts/seed-register.ts ../../data/registers/<key>
npx tsx scripts/match-registers.ts --tree <treeId> --report
```

See `docs/historical-record-registers.md` for the framework and
`docs/witness-historical-record-registers-package.md` for the build spec
and the per-register sources.
