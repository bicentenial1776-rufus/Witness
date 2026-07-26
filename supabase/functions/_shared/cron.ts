// Gate for the cron-invoked service-role workers. The functions gateway
// only demands A valid JWT and the anon key is public by design, so
// "reachable through the gateway" means "reachable by anyone" — these
// workers therefore demand a shared secret on every call. pg_cron sends
// it via an x-cron-secret header whose value lives in Vault (the cron
// migrations reference vault.decrypted_secrets, never the literal);
// manual runs read WITNESS_CRON_SECRET from packages/core/.env.

export function requireCronSecret(req: Request): Response | null {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('cron secret required', { status: 403 });
  }
  return null;
}
