import './node-polyfills.js';
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, requireEnv } from './env.js';

/**
 * Creates confirmed beta accounts via the auth admin API and prints their
 * credentials. signUp (see create-test-user.ts) can't be used here: it leaves
 * the account unconfirmed unless the project has confirmations off, and the
 * beta tester never sees the confirmation mail — we hand them a password
 * directly. The profiles row is created by the on_auth_user_created trigger.
 *
 * Each account is comped with a lifetime `premium` entitlement unless
 * --no-grant says otherwise, so a tester never meets the paywall.
 *
 *   npm run create-beta-user -- someone@example.com
 *   npm run create-beta-user -- a@example.com "Ada Lovelace" b@example.com
 *   npm run create-beta-user -- --file testers.csv     # email,Name per line
 *   npm run create-beta-user -- someone@example.com --no-grant
 */

loadEnv();

type Invitee = { email: string; name?: string };

function parseFile(path: string): Invitee[] {
  return readFileSync(path, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .filter((line) => !/^email\s*,/i.test(line)) // tolerate a header row
    .map((line) => {
      const [email, ...rest] = line.split(',');
      const name = rest.join(',').trim().replace(/^"|"$/g, '');
      return { email: email.trim(), name: name || undefined };
    });
}

/** Positional args: an email, optionally followed by that person's name. */
function parseArgs(argv: string[]): Invitee[] {
  const fileFlag = argv.indexOf('--file');
  if (fileFlag !== -1) {
    const path = argv[fileFlag + 1];
    if (!path) throw new Error('--file needs a path');
    return parseFile(path);
  }
  const invitees: Invitee[] = [];
  for (const arg of argv) {
    if (arg.includes('@')) invitees.push({ email: arg });
    else if (invitees.length) invitees[invitees.length - 1].name = arg;
    else throw new Error(`Expected an email address, got: ${arg}`);
  }
  return invitees;
}

// Ambiguous glyphs (0/O, 1/l/I) are left out so a password survives being read
// aloud or retyped from a message.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(length = 16): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * Comps the account so no paywall stands between a tester and the thing we
 * asked them to look at. RevenueCat's identity is the Supabase user id (the
 * app calls Purchases.logIn with it), and entitlements aren't platform-scoped,
 * so one grant covers iOS and the web app both.
 *
 * Two calls, not one: the promotional grant 404s (`7259 subscriber not found`)
 * for someone who has never opened the app, and only the public SDK key can
 * create a subscriber. The secret key is rejected outright on that endpoint.
 * Note REVENUECAT_SECRET_API_KEY is the *v1* key — the v2 key 403s here.
 */
async function grantEntitlement(userId: string): Promise<void> {
  const publicKey = requireEnv('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
  const secretKey = requireEnv('REVENUECAT_SECRET_API_KEY');
  const entitlement = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'premium';
  const base = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`;

  const ensure = await fetch(base, {
    headers: { Authorization: `Bearer ${publicKey}`, 'X-Platform': 'ios' },
  });
  if (!ensure.ok) throw new Error(`subscriber create failed: ${await ensure.text()}`);

  // 'lifetime' is RevenueCat's ~200-year expiry, not a distinct product type.
  const grant = await fetch(`${base}/entitlements/${entitlement}/promotional`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration: 'lifetime' }),
  });
  if (!grant.ok) throw new Error(`entitlement grant failed: ${await grant.text()}`);
}

const argv = process.argv.slice(2);
const shouldGrant = !argv.includes('--no-grant');
const invitees = parseArgs(argv.filter((a) => a !== '--no-grant'));

if (invitees.length === 0) {
  console.error('Usage: npm run create-beta-user -- <email> ["Name"] [<email> ...]');
  console.error('       npm run create-beta-user -- --file testers.csv');
  console.error('       --no-grant   create the account without comping it');
  process.exit(1);
}

const url = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const created: Array<{ email: string; password: string }> = [];
const skipped: Array<{ email: string; reason: string }> = [];

for (const { email, name } of invitees) {
  const password = generatePassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { ...(name ? { full_name: name } : {}), beta: true },
  });

  if (error) {
    skipped.push({ email, reason: error.message });
    console.error(`✗ ${email}: ${error.message}`);
    continue;
  }

  const userId = data.user!.id;

  if (shouldGrant) {
    try {
      await grantEntitlement(userId);
    } catch (grantError) {
      // The account is real and usable — it just hits the paywall. Say which
      // half failed rather than implying the whole invite needs redoing.
      const reason = grantError instanceof Error ? grantError.message : String(grantError);
      skipped.push({ email, reason: `account created, but ${reason}` });
      console.error(`⚠ ${email} — ${userId}: account created, NOT comped: ${reason}`);
      created.push({ email, password });
      continue;
    }
  }

  created.push({ email, password });
  console.log(`✓ ${email} — ${userId}${shouldGrant ? ' (comped)' : ''}`);
}

if (created.length) {
  console.log('\nCredentials to send:\n');
  for (const { email, password } of created) {
    console.log(`  ${email}`);
    console.log(`  password: ${password}\n`);
  }
}

console.log(`Created ${created.length}, skipped ${skipped.length}.`);
if (skipped.length) process.exit(1);
