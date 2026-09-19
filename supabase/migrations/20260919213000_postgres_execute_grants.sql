-- 20260919200000 revoked EXECUTE from PUBLIC on the SECURITY DEFINER
-- functions so anon lost the implicit grant. The management API, the ops
-- watcher and the DB canary run as `postgres`, which is not the owner of
-- these functions and also relied on PUBLIC — EXPLAIN on search_people
-- answered "permission denied" the same evening. Grant the operator role
-- explicitly; anon stays where 20260919200000 left it.
grant execute on function public.carry_tree_sharing(uuid, uuid) to postgres;
grant execute on function public.cleanup_stale_failed_tree_imports(interval) to postgres;
grant execute on function public.delete_tree_batch(uuid, boolean) to postgres;
grant execute on function public.get_invite(text) to postgres;
grant execute on function public.get_share(text) to postgres;
grant execute on function public.get_waiting_seat() to postgres;
grant execute on function public.handle_new_user() to postgres;
grant execute on function public.is_tree_owner(uuid) to postgres;
grant execute on function public.member_tree_ids() to postgres;
grant execute on function public.recount_tree(uuid) to postgres;
grant execute on function public.reuse_geocodes(uuid) to postgres;
grant execute on function public.search_people(uuid, text, integer, integer) to postgres;
