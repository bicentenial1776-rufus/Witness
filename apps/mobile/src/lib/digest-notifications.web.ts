import { supabase } from '@/lib/supabase';

/**
 * Web variant: the weekly digest arrives as EMAIL here (send-digest-emails
 * Edge Function, Sundays), so the toggle reads and writes the server-side
 * opt-in on the profile — it follows the account, not the device. Same
 * exported surface as the native module; `armDigestNotification` is a
 * no-op because the server owns scheduling.
 */

export const DIGEST_NOTIFICATION_URL = '/digest';

export async function isDigestNotificationEnabled(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data } = await supabase
    .from('profiles')
    .select('digest_email_enabled')
    .eq('id', auth.user.id)
    .maybeSingle();
  return Boolean(data?.digest_email_enabled);
}

/** Next Sunday 09:00 local; if it's Sunday before 9am, today qualifies. */
export function nextDigestFireDate(now: Date): Date {
  const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
  let daysAhead = (7 - now.getDay()) % 7;
  if (daysAhead === 0 && now.getHours() >= 9) daysAhead = 7;
  fire.setDate(fire.getDate() + daysAhead);
  return fire;
}

export async function armDigestNotification(_treeId: string): Promise<void> {}

export async function setDigestNotificationEnabled(
  enabled: boolean,
  _treeId: string,
): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { error } = await supabase
    .from('profiles')
    .update({ digest_email_enabled: enabled })
    .eq('id', auth.user.id);
  return error ? !enabled : enabled;
}
