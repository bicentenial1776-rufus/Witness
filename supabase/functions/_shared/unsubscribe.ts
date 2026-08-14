// Unsubscribe-link tokens for the weekly digest email. A token is
// HMAC-SHA256(profile id) under CRON_SECRET — holding a valid one proves the
// link came out of an email this project sent, which is exactly the standard
// an unsubscribe needs: no login, but no forging either. Reusing CRON_SECRET
// keeps the secret roster at one; rotating it politely breaks the links in
// already-sent emails (the endpoint's invalid-token page points at the
// in-app toggle, so nobody is stranded).

const encoder = new TextEncoder();

async function hmacKey(): Promise<CryptoKey | null> {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return null;
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** Hex HMAC of a profile id, or null when CRON_SECRET is unset. */
export async function signProfileId(profileId: string): Promise<string | null> {
  const key = await hmacKey();
  if (!key) return null;
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(profileId));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time check that `sig` is the HMAC of `profileId`. */
export async function verifyProfileSig(profileId: string, sig: string): Promise<boolean> {
  const expected = await signProfileId(profileId);
  if (!expected || sig.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return mismatch === 0;
}
