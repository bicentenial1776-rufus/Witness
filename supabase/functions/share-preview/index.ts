// Public share unfurler: app.witnesslives.com/s/{token} proxies here (see
// the web app's vercel.json). Link-preview crawlers (iMessage, Slack,
// social) read the OG tags; human browsers follow the instant refresh to
// the SPA's /shared/{token} page. Deployed with --no-verify-jwt — this is
// the one deliberately public function.

import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_URL = 'https://app.witnesslives.com';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(title: string, description: string, redirect: string): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:site_name" content="Witness">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0;url=${redirect}">
</head><body style="font-family: Georgia, serif; background: #F7F3EE; color: #1C1917; padding: 40px;">
<p>${esc(description)}</p><p><a href="${redirect}">Continue to Witness ›</a></p>
</body></html>`;
}

Deno.serve(async (req) => {
  const token = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data } = await supabase.rpc('get_share', { p_token: token });

  const share = data as {
    sharer_name: string | null;
    payload: { fullName: string; years: string; lines: string[] };
  } | null;

  const html = share
    ? page(
        `${share.payload.fullName}, ${share.payload.years} — a story from ${share.sharer_name ? `${share.sharer_name}’s` : 'a'} family tree`,
        share.payload.lines[0] ?? 'A life from a real family tree, told by Witness.',
        `${APP_URL}/shared/${token}`,
      )
    : page(
        'A family story on Witness',
        'This shared story has expired or was taken back.',
        `${APP_URL}/shared/${token}`,
      );

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
});
