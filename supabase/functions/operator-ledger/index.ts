// The operator ledger's data feed — one JSON snapshot of who has an
// account, who has signed in, what they imported, and what the AI
// features cost (docs/usage-monitoring-design-brief.md). Read by the
// unlisted page at witnesslives.com/operator (apps/preview-site/operator).
//
// The usage feeds were built with one reader in mind — the operator, via
// the service role — and this function keeps that posture: it runs with
// the service role, but only after the caller's JWT resolves to a user on
// the operator allowlist. Everyone else gets 403 with nothing in it,
// including the count of accounts. The allowlist is OPERATOR_USER_IDS
// (comma-separated auth user ids) when that secret is set, otherwise
// Rufus's own account.
//
// Reached through the gateway's default JWT check (verify_jwt on), from a
// browser page, hence the CORS handshake.

import { createClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_OPERATORS = ['40280733-18a8-4c28-96d1-ac32db92673d']; // bicentenial1776@gmail.com
const LEDGER_WINDOW_DAYS = 30;
const PAGE = 1000; // the API's max_rows

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function operators(): Set<string> {
  const raw = Deno.env.get('OPERATOR_USER_IDS');
  const ids = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_OPERATORS;
  return new Set(ids);
}

// Walks a query past the API's row cap. The builder is called per page so
// each call is a fresh query — a PostgREST builder can't be re-ranged.
// deno-lint-ignore no-explicit-any
async function all<T>(build: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(405, { error: 'GET or POST' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'signed-in user required' });

  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
  } = await asUser.auth.getUser();
  if (!user) return json(401, { error: 'signed-in user required' });
  if (!operators().has(user.id)) return json(403, { error: 'not the operator' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const since = new Date(Date.now() - LEDGER_WINDOW_DAYS * 864e5).toISOString();

    const [ledger, events, trees, members, readings, media] = await Promise.all([
      all<Record<string, unknown>>(() =>
        admin
          .from('ai_usage_daily')
          .select('user_id, kind, model, input_tokens, output_tokens, created_at')
          .gte('created_at', since)
          .order('created_at')
      ),
      all<Record<string, unknown>>(() =>
        admin
          .from('usage_events')
          .select('user_id, event_name, properties, created_at')
          .order('created_at')
      ),
      all<Record<string, unknown>>(() =>
        admin
          .from('trees')
          .select(
            'id, user_id, name, individual_count, family_count, place_count, gedcom_bytes, provider, imported_at, import_status',
          )
          .order('imported_at')
      ),
      all<Record<string, unknown>>(() =>
        admin.from('tree_members').select('tree_id, user_id, role, joined_at')
      ).catch(() => [] as Record<string, unknown>[]),
      admin.from('media_readings').select('id', { count: 'exact', head: true }),
      admin.from('media').select('id', { count: 'exact', head: true }).eq('upload_status', 'complete'),
    ]);

    const users: Record<string, unknown>[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      users.push(...data.users);
      if (data.users.length < 200) break;
    }

    return json(200, {
      asOf: new Date().toISOString(),
      windowDays: LEDGER_WINDOW_DAYS,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        created: u.created_at,
        lastSignIn: u.last_sign_in_at,
        provider: (u.app_metadata as Record<string, unknown> | undefined)?.provider,
      })),
      trees: trees.map((t) => ({
        id: t.id,
        user: t.user_id,
        name: t.name,
        people: t.individual_count,
        families: t.family_count,
        places: t.place_count,
        bytes: t.gedcom_bytes,
        provider: t.provider,
        imported: t.imported_at,
        status: t.import_status,
      })),
      members,
      events,
      ledger,
      counts: { readings: readings.count, media: media.count },
    });
  } catch (err) {
    console.error('operator-ledger:', err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
