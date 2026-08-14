// One-click unsubscribe for the weekly digest email. Every digest carries a
// List-Unsubscribe header (RFC 8058) and a footer link pointing here, both
// minted by send-digest-emails with an HMAC token (_shared/unsubscribe.ts).
//
// GET renders a confirm page rather than acting — mail scanners prefetch
// GETs, and a prefetch must never unsubscribe anyone. POST (the RFC 8058
// one-click path, and the confirm page's button) flips the flag.
//
// Deployed with verify_jwt = false (supabase/config.toml): mail clients and
// browsers arrive with no Supabase key, and the HMAC token is the actual
// authorization here.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { verifyProfileSig } from '../_shared/unsubscribe.ts';

const PAGE_STYLE = `
  background: #F7F3EE; margin: 0; padding: 48px 24px; min-height: 100vh;
  font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; box-sizing: border-box;`;
const CARD_STYLE = `
  max-width: 460px; margin: 0 auto; background: #FFFDFA; border: 1px solid #E7E0D8;
  border-radius: 12px; padding: 28px;`;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex"><title>${title} — Witness</title></head>
    <body style="${PAGE_STYLE}"><div style="${CARD_STYLE}">
      <div style="color: #B45309; font-size: 13px; letter-spacing: 4px; font-weight: 600;">WITNESS</div>
      <h1 style="font-family: Georgia, 'Times New Roman', serif; color: #1C1917; font-size: 24px; margin: 10px 0 8px;">${title}</h1>
      ${body}
    </div></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

const INVALID = page(
  'This link isn’t valid',
  `<p style="color: #57534E; font-size: 15px;">It may be from an older email. You can turn the
   weekly digest off any time on the You screen in Witness.</p>`,
  400,
);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid') ?? '';
  const sig = url.searchParams.get('sig') ?? '';
  if (!uid || !sig || !(await verifyProfileSig(uid, sig))) return INVALID;

  if (req.method === 'GET') {
    // Confirm page: the button re-submits the same token as a POST.
    return page(
      'Stop the weekly digest?',
      `<p style="color: #57534E; font-size: 15px;">No more Sunday emails about your family’s
        anniversaries. You can turn it back on any time on the You screen in Witness.</p>
       <form method="POST" action="${url.pathname}?uid=${uid}&amp;sig=${sig}" style="margin-top: 18px;">
         <button type="submit" style="background: #B45309; color: #F7F3EE; border: none;
           padding: 12px 22px; border-radius: 10px; font-weight: 600; font-size: 15px; cursor: pointer;">
           Unsubscribe</button>
       </form>`,
    );
  }

  if (req.method !== 'POST') return new Response('GET or POST', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { error } = await supabase
    .from('profiles')
    .update({ digest_email_enabled: false })
    .eq('id', uid);
  if (error) {
    return page(
      'Something went wrong',
      `<p style="color: #57534E; font-size: 15px;">The unsubscribe didn’t go through — try the
       link again, or turn the weekly email off on the You screen in Witness.</p>`,
      500,
    );
  }

  return page(
    'You’re unsubscribed',
    `<p style="color: #57534E; font-size: 15px;">The weekly digest email is off. Anniversaries
     still appear in the app — and the You screen can turn the email back on whenever you like.</p>`,
  );
});
