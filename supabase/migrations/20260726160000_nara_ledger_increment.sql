-- Atomic month-ledger increment for the NARA worker (2026-07-26 audit):
-- the read-modify-write in nara-enrich set an absolute value, so
-- concurrent runs clobbered each other and undercounted spend against
-- the paid 10,000/month quota. The worker now reports only its own
-- calls and the database adds them.

create or replace function bump_nara_calls(p_month text, p_calls integer)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into nara_api_calls (month, calls) values (p_month, p_calls)
  on conflict (month) do update set calls = nara_api_calls.calls + excluded.calls
  returning calls;
$$;

-- Service role only — clients have no business in the ledger.
revoke execute on function bump_nara_calls(text, integer) from public, anon, authenticated;
