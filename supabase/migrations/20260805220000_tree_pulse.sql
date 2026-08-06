-- Tree Pulse: the report of what a research session changed, kept on the
-- tree it produced so the Research screen can show it without recomputing a
-- diff against a file that no longer exists.
--
-- Stored as jsonb rather than modelled out because it is a rendered artefact,
-- not a queryable entity — nothing joins to it, nothing filters on it, and its
-- shape follows the TreePulse interface in packages/core/src/pulse/diff.ts.
-- Only the latest survives per tree; a refresh overwrites its predecessor,
-- which is the same lifetime the screen promises ("your last session").

alter table trees
  add column last_pulse jsonb,
  add column last_pulse_at timestamptz,
  -- The tree this one replaced, kept only so a refresh is traceable in
  -- support. Nulled by the FK if that tree is ever hard-deleted.
  add column refreshed_from uuid references trees (id) on delete set null;

comment on column trees.last_pulse is
  'Latest TreePulse report (see packages/core/src/pulse/diff.ts). Rendered artefact, not queried.';

-- Existing RLS on trees already scopes select/update to the owning user, so
-- these columns inherit it. No new policy is needed, and adding one keyed on
-- anything other than user_id would widen access rather than narrow it.
