// Deletes the calling user's account — the final step of the in-app
// delete-account flow (App Store guideline 5.1.1(v): an app with account
// creation must let the account be deleted from inside the app).
//
// The client drains trees FIRST via delete_tree_batch, the same batched path
// tree deletion has always used: the auth-cascade delete would blow statement
// timeouts on a full account, and delete_tree_batch checks auth.uid(), so the
// drain must run as the user anyway. This function is the small remainder:
// verify the caller from their JWT, refuse if the heavy rows are still there,
// sweep any leftover tree rows and the storage folder, then delete the auth
// user — profiles, share_links, library_pins, findings and friends all
// cascade from auth.users.
//
// Reached through the gateway's default JWT check (verify_jwt on): the app
// invokes it with the signed-in user's token, which is also the identity —
// nobody can delete an account but its own bearer.

import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'gedcom-files';
// delete_tree_batch drains individuals 400 per call; anything at or under one
// slice is cheap enough to cascade here rather than bounce the caller.
const DRAIN_THRESHOLD = 400;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('signed-in user required', { status: 401 });

  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
  } = await asUser.auth.getUser();
  if (!user) return new Response('signed-in user required', { status: 401 });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // The client's drain loop should have left nothing heavy. If it somehow
  // did (a killed app mid-drain, a very large straggler), refuse with a
  // signal the client understands and retries the drain on — deleting the
  // user here would either time out or half-complete.
  const { count, error: countError } = await admin
    .from('individuals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if (countError) return Response.json({ error: countError.message }, { status: 500 });
  if ((count ?? 0) > DRAIN_THRESHOLD) {
    return Response.json({ error: 'trees_not_drained', remaining: count }, { status: 409 });
  }

  // Leftover tree rows (and their small remainders) cascade cheaply now.
  const { error: treesError } = await admin.from('trees').delete().eq('user_id', user.id);
  if (treesError) return Response.json({ error: treesError.message }, { status: 500 });

  // The vault bucket has no cascade from auth.users — sweep the user's
  // folder so no orphaned ciphertext outlives the account that owned it.
  const { data: objects } = await admin.storage.from(BUCKET).list(user.id, { limit: 1000 });
  if (objects && objects.length > 0) {
    const { error: storageError } = await admin.storage
      .from(BUCKET)
      .remove(objects.map((object) => `${user.id}/${object.name}`));
    if (storageError) {
      return Response.json({ error: storageError.message }, { status: 500 });
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

  return Response.json({ done: true });
});
