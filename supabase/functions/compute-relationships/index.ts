// Precomputes the relationships cache for a tree, server-side so the walk
// survives the app backgrounding (which killed the on-device compute on
// 2026-08-06 and 2026-08-15). Orchestration mirrors setHomePerson() in
// packages/core/src/family/homePerson.ts — upsert-then-prune, so there is
// never a zero-rows window and concurrent runs converge. The compute
// itself is the enforced-verbatim port in ../_shared/family/.
//
// Auth: the caller's own JWT; every read and write goes through the
// RLS-scoped client, preserving the "users manage their own relationship
// rows" design (migration 20260705020000) — no service-role writes.

import { authenticate, corsHeaders, json } from '../_shared/enrich.ts';
import { computeRelationshipRows, fetchFamilyGraph } from '../_shared/family/precompute.ts';

const INSERT_BATCH = 500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: { treeId?: unknown; homePersonId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  const { treeId, homePersonId } = body;
  if (typeof treeId !== 'string') return json(400, { error: 'treeId is required' });
  if (homePersonId !== undefined && typeof homePersonId !== 'string') {
    return json(400, { error: 'homePersonId must be a string' });
  }

  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  // RLS proves access: a tree that is neither owned nor shared with the
  // caller simply isn't found. Which of the two it is decides where the
  // home-person pointer lives — the tree row for the owner, the caller's
  // own tree_members row for a family companion (each member computes
  // their own point of view; design brief §3).
  const { data: tree, error: treeError } = await ctx.db
    .from('trees')
    .select('id, user_id, home_person_id')
    .eq('id', treeId)
    .maybeSingle();
  if (treeError) return json(500, { error: `Reading tree failed: ${treeError.message}` });
  if (!tree) return json(404, { error: 'Tree not found' });
  const isOwner = tree.user_id === ctx.userId;

  let homeId: string | null;
  if (isOwner) {
    if (homePersonId) {
      const { error } = await ctx.db
        .from('trees')
        .update({ home_person_id: homePersonId })
        .eq('id', treeId);
      if (error) return json(500, { error: `Setting home person failed: ${error.message}` });
    }
    homeId = homePersonId ?? tree.home_person_id;
  } else {
    const { data: membership } = await ctx.db
      .from('tree_members')
      .select('home_person_id')
      .eq('tree_id', treeId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (!membership) return json(404, { error: 'Tree not found' });
    if (homePersonId) {
      // The member's own row, through the RLS-scoped client — the column
      // grant on (home_person_id, display_name) is exactly this write.
      const { error } = await ctx.db
        .from('tree_members')
        .update({ home_person_id: homePersonId })
        .eq('tree_id', treeId)
        .eq('user_id', ctx.userId);
      if (error) return json(500, { error: `Setting home person failed: ${error.message}` });
    }
    homeId = homePersonId ?? membership.home_person_id;
  }
  if (!homeId) return json(400, { error: 'Tree has no home person' });

  const started = Date.now();
  const graph = await fetchFamilyGraph(ctx.db, treeId);
  const rows = computeRelationshipRows(graph, homeId).map((row) => ({
    tree_id: treeId,
    user_id: ctx.userId,
    home_person_id: homeId,
    ...row,
  }));

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error } = await ctx.db
      .from('relationships')
      .upsert(rows.slice(i, i + INSERT_BATCH), {
        onConflict: 'tree_id,user_id,home_person_id,individual_id',
      });
    if (error) return json(500, { error: `Caching relationships failed: ${error.message}` });
  }

  // Prune rows keyed to any other home person — re-read the pointer so a
  // racing run that changed the home person after us wins. The delete is
  // RLS-scoped, so it only ever touches the caller's own rows.
  let currentHome = homeId;
  if (isOwner) {
    const { data: treeNow } = await ctx.db
      .from('trees')
      .select('home_person_id')
      .eq('id', treeId)
      .maybeSingle();
    currentHome = treeNow?.home_person_id ?? homeId;
  } else {
    const { data: memberNow } = await ctx.db
      .from('tree_members')
      .select('home_person_id')
      .eq('tree_id', treeId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    currentHome = memberNow?.home_person_id ?? homeId;
  }
  const { error: pruneError } = await ctx.db
    .from('relationships')
    .delete()
    .eq('tree_id', treeId)
    .neq('home_person_id', currentHome);
  if (pruneError) return json(500, { error: `Pruning old relationships failed: ${pruneError.message}` });

  return json(200, {
    cachedAncestors: rows.length,
    people: graph.people.size,
    ms: Date.now() - started,
  });
});
