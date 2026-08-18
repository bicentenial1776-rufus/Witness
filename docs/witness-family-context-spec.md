> **BUILD STATUS (2026-08-18): SHIPPED on main, server-side pieces deployed.**
> One deviation from the locked spec: §5.2 assumed a react-native-skia stack
> "already established for Family Street View" — no such dependency exists in
> this repo (Street View is Greg's separate project), and skia cannot render
> on the web carrier, so the chart is plain positioned Views + trig. Zero new
> dependencies; layout, interactivity, and fact-card fallback are per spec.
> Everything else as locked: RelativeFact shared layer
> (packages/core/src/family/relatives.ts), weaving via client-assembled brief
> passed to generate-biography, two-tier historical context with v2 cache
> envelope + decline log (enrichment_type 'historical_context_decline').
> Existing cached enrichments are untouched (cache-forever design) — new
> generations get the new behavior; legacy prose renders via parser fallback.
> E2E-verified live: sibling weaving (Renaldo Webber, 7 siblings) and the
> general tier (Margaret of Wessex, 1072 invasion, sources=[]).

