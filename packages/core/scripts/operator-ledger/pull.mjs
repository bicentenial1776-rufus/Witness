import { createClient } from '/Users/rufushowe/Witness/node_modules/@supabase/supabase-js/dist/index.mjs';
import ws from '/Users/rufushowe/Witness/node_modules/ws/index.js';
import { writeFileSync } from 'node:fs';
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: ws } });
const all = async (q) => { const out = []; for (let f = 0;; f += 1000) { const { data, error } = await q.range(f, f + 999); if (error) throw new Error(error.message); out.push(...data); if (data.length < 1000) break; } return out; };
const since = new Date(Date.now() - 30 * 864e5).toISOString();
const ledger = await all(c.from('ai_usage_daily').select('user_id, kind, model, input_tokens, output_tokens, created_at').gte('created_at', since).order('created_at'));
const events = await all(c.from('usage_events').select('user_id, event_name, properties, created_at').order('created_at'));
const trees = await all(c.from('trees').select('id, user_id, name, individual_count, family_count, place_count, gedcom_bytes, provider, imported_at').order('imported_at'));
const users = []; for (let page = 1;; page++) { const { data, error } = await c.auth.admin.listUsers({ page, perPage: 200 }); if (error) throw new Error(error.message); users.push(...data.users); if (data.users.length < 200) break; }
const members = await all(c.from('tree_members').select('tree_id, user_id, role, joined_at')).catch(() => []);
const readings = await c.from('media_readings').select('id', { count: 'exact', head: true });
const media = await c.from('media').select('id', { count: 'exact', head: true }).eq('upload_status', 'complete');
const snapshot = {
  asOf: new Date().toISOString(),
  users: users.map((u) => ({ id: u.id, email: u.email, created: u.created_at, lastSignIn: u.last_sign_in_at, provider: u.app_metadata?.provider })),
  trees: trees.map((t) => ({ id: t.id, user: t.user_id, name: t.name, people: t.individual_count, families: t.family_count, places: t.place_count, bytes: t.gedcom_bytes, provider: t.provider, imported: t.imported_at })),
  members: members,
  events,
  ledger,
  counts: { readings: readings.count, media: media.count },
};
writeFileSync(process.argv[2], JSON.stringify(snapshot));
console.log('users', users.length, 'trees', trees.length, 'events', events.length, 'ledger rows (30d)', ledger.length, 'members', members.length, 'models', [...new Set(ledger.map((r) => r.model))]);
