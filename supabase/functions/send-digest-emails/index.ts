// Weekly digest email worker: "This Week in Your Family", delivered by
// Resend to every account that opted in (profiles.digest_email_enabled),
// invoked Sundays 13:00 UTC by pg_cron (migration 20260724210000). Same
// editorial engine as the app's digest screen (_shared/digest.ts). A
// last-sent guard makes re-invocations idempotent; accounts whose week
// holds no anniversaries simply receive nothing.
//
// Manual testing: POST {"force": true, "only": "email@example.com"} sends
// regardless of the last-sent guard, optionally to a single account.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { requireCronSecret } from '../_shared/cron.ts';
import { weeklyDigest, type DigestEntry } from '../_shared/digest.ts';

const FROM = 'Witness <hello@witnesslives.com>';
const APP_URL = 'https://app.witnesslives.com';

const INK = '#1C1917';
const PARCHMENT = '#F7F3EE';
const AMBER = '#B45309';

function eventPhrase(entry: DigestEntry): string {
  const verb = entry.eventType === 'birth' ? 'was born' : 'died';
  return entry.yearsAgo !== null
    ? `${verb} ${entry.yearsAgo} years ago this week`
    : `${verb} this week in ${entry.year ?? 'history'}`;
}

function entryHtml(entry: DigestEntry): string {
  const day = entry.occursOn.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return `
    <tr><td style="padding: 14px 0; border-bottom: 1px solid #E7E0D8;">
      <div style="color: ${AMBER}; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">${day}</div>
      <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px; color: ${INK}; margin-top: 2px;">${entry.fullName}</div>
      <div style="color: #57534E; font-size: 14px; margin-top: 2px;">
        ${entry.fullName.split(' ')[0]} ${eventPhrase(entry)}${entry.placeRaw ? ` · ${entry.placeRaw}` : ''}
      </div>
    </td></tr>`;
}

function digestHtml(entries: DigestEntry[]): string {
  return `
  <div style="background: ${PARCHMENT}; padding: 32px 16px; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" style="max-width: 560px; margin: 0 auto; background: #FFFDFA; border: 1px solid #E7E0D8; border-radius: 12px; padding: 28px; width: 100%;">
      <tr><td>
        <div style="color: ${AMBER}; font-size: 13px; letter-spacing: 4px; font-weight: 600;">WITNESS</div>
        <h1 style="font-family: Georgia, 'Times New Roman', serif; color: ${INK}; font-size: 26px; margin: 10px 0 2px;">This Week in Your Family</h1>
        <div style="color: #57534E; font-size: 14px; margin-bottom: 8px;">Anniversaries from your own tree, chosen for the stories they carry.</div>
        <table role="presentation" style="width: 100%;">${entries.map(entryHtml).join('')}</table>
        <div style="margin-top: 22px;">
          <a href="${APP_URL}/digest" style="background: ${AMBER}; color: ${PARCHMENT}; text-decoration: none; padding: 12px 22px; border-radius: 10px; font-weight: 600; font-size: 15px;">Open the week ›</a>
        </div>
        <div style="color: #8A8378; font-size: 12px; margin-top: 24px;">
          You asked for this weekly note in Witness. Turn it off any time on the You screen.
        </div>
      </td></tr>
    </table>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return Response.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });

  let force = false;
  let only: string | null = null;
  try {
    const body = (await req.json()) as { force?: boolean; only?: string };
    force = body?.force === true;
    only = body?.only ?? null;
  } catch {
    // empty body — the cron case
  }

  // requireCronSecret above already gates every caller (the cron job and
  // manual test runs both send x-cron-secret), so force/only need no
  // second gate of their own.

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: optedIn, error } = await supabase
    .from('profiles')
    .select('id, digest_email_last_sent_at')
    .eq('digest_email_enabled', true);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const guard = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const profile of optedIn ?? []) {
    if (!force && profile.digest_email_last_sent_at && new Date(profile.digest_email_last_sent_at) > guard) {
      skipped++;
      continue;
    }

    const { data: user } = await supabase.auth.admin.getUserById(profile.id);
    const email = user?.user?.email;
    if (!email || (only && email !== only)) {
      skipped++;
      continue;
    }

    const { data: trees } = await supabase
      .from('trees')
      .select('id')
      .eq('user_id', profile.id)
      .order('imported_at', { ascending: false })
      .limit(1);
    const treeId = trees?.[0]?.id;
    if (!treeId) {
      skipped++;
      continue;
    }

    try {
      const digest = await weeklyDigest(supabase, treeId, now);
      if (digest.entries.length === 0) {
        skipped++;
        continue;
      }

      const top = digest.entries[0]!;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: email,
          subject: `This Week in Your Family — ${top.fullName} ${top.eventType === 'birth' ? 'was born' : 'died'} ${top.yearsAgo ?? 'many'} years ago`,
          html: digestHtml(digest.entries),
        }),
      });
      if (!response.ok) {
        errors.push(`${profile.id.slice(0, 8)}: resend ${response.status} ${(await response.text()).slice(0, 120)}`);
        continue;
      }

      await supabase
        .from('profiles')
        .update({ digest_email_last_sent_at: now.toISOString() })
        .eq('id', profile.id);
      sent++;
    } catch (err) {
      errors.push(`${profile.id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Errors carry profile-id prefixes, never email addresses, and the
  // opted-in headcount stays server-side — this response reaches anyone
  // holding the public anon key.
  if (errors.length) console.error('send-digest-emails errors:', errors);
  return Response.json({ sent, skipped, errors: errors.length });
});
