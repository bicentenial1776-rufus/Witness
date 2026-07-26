// Share unfurler, served by Vercel at app.witnesslives.com/s/{token}
// (see ../vercel.json). Lives here rather than a Supabase Edge Function
// because Supabase's gateway rewrites text/html responses to text/plain
// (phishing protection on their domain) — link-preview crawlers then
// render the raw source as a "Text Document". Crawlers read the OG tags;
// humans follow the instant refresh into the SPA's /shared/{token} page.

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
  // Tokens are exactly 32 hex chars (128-bit, share-links.ts). Anything
  // else is not a token — reject before the string ever reaches HTML,
  // closing the reflected-XSS door on the app origin.
  const token = String(req.query.token ?? '');
  if (!/^[0-9a-f]{32}$/.test(token)) {
    res.status(404).send('Not found');
    return;
  }

  let share = null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_share`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (response.ok) share = await response.json();
  } catch {
    // fall through to the generic page
  }

  const html = share
    ? page(
        `${share.payload.fullName}, ${share.payload.years} — a story from ${
          share.sharer_name ? `${share.sharer_name}’s` : 'a'
        } family tree`,
        share.payload.lines[0] ?? 'A life from a real family tree, told by Witness.',
        `${APP_URL}/shared/${token}`,
      )
    : page(
        'A family story on Witness',
        'This shared story has expired or was taken back.',
        `${APP_URL}/shared/${token}`,
      );

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(html);
};
