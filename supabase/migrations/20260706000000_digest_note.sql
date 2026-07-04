-- Phase 5: weekly digest. Each digest entry carries a 2-sentence AI note of
-- historical context; notes are anniversary-agnostic so a cached note stays
-- fresh whenever the ancestor resurfaces in a future week. Same cache table,
-- same daily budget, new enrichment type.

alter type enrichment_type add value if not exists 'digest_note';
