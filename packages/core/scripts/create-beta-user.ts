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
 *   npm run create-beta-user -- someone@example.com
 *   npm run create-beta-user -- a@example.com "Ada Lovelace" b@example.com
 *   npm run create-beta-user -- --file testers.csv     # email,Name per line
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

const invitees = parseArgs(process.argv.slice(2));

if (invitees.length === 0) {
  console.error('Usage: npm run create-beta-user -- <email> ["Name"] [<email> ...]');
  console.error('       npm run create-beta-user -- --file testers.csv');
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

  created.push({ email, password });
  console.log(`✓ ${email} — ${data.user?.id}`);
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
