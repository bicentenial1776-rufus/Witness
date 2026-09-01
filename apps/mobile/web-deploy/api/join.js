// Invite unfurler, served by Vercel at app.witnesslives.com/j/{token}
// (see ../vercel.json) — the share unfurler's twin (api/share.js) for
// family invitations. Crawlers read the OG tags; humans follow the
// instant refresh into the SPA's /join/{token} page, where the seat is
// actually taken. Same reason it lives here and not in an Edge Function:
// Supabase's gateway rewrites text/html to text/plain.

const SUPABASE_URL = 'https://bdjsahbjptpcmouqozvs.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q';
const APP_URL = 'https://app.witnesslives.com';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(title, description, redirect) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:site_name" content="Witness">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(redirect)}">
<meta property="og:image" content="${APP_URL}/og-share.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${APP_URL}/og-share.png">
<meta http-equiv="refresh" content="0;url=${esc(redirect)}">
</head><body style="font-family: Georgia, serif; background: #F7F3EE; color: #1C1917; padding: 40px;">
<p>${esc(description)}</p><p><a href="${esc(redirect)}">Continue to Witness &rsaquo;</a></p>
</body></html>`;
}

module.exports = async (req, res) => {
  // Tokens are exactly 32 hex chars (family-sharing.ts). Anything else is
  // not a token — reject before the string ever reaches HTML.
  const token = String(req.query.token ?? '');
  if (!/^[0-9a-f]{32}$/.test(token)) {
    res.status(404).send('Not found');
    return;
  }

  let invite = null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_invite`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (response.ok) invite = await response.json();
  } catch {
    // fall through to the generic page
  }

  const html = invite
    ? page(
        invite.inviterName
          ? `${invite.inviterName} has kept a seat for you — the ${invite.treeName}`
          : `A seat in the ${invite.treeName}`,
        `You're invited into a family tree of ${Number(
          invite.individualCount ?? 0,
        ).toLocaleString()} people on Witness — every relationship told from where you sit in the family.`,
        `${APP_URL}/join/${token}`,
      )
    : page(
        'A family invitation on Witness',
        'This invitation has been used, taken back, or has expired.',
        `${APP_URL}/join/${token}`,
      );

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Short cache: an invite is single-use and revocable; a stale unfurl is
  // fine, a stale landing page is not — the SPA re-peeks live anyway.
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).send(html);
};
