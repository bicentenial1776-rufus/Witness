/**
 * Web variant: local scheduled notifications don't exist in the browser;
 * the web answer is the email digest (WEB_APP_DESIGN.md §5, Phase B).
 * Until then the toggle reads disabled and arming is a no-op.
 */

export const DIGEST_NOTIFICATION_URL = '/digest';

export async function isDigestNotificationEnabled(): Promise<boolean> {
  return false;
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
  _enabled: boolean,
  _treeId: string,
): Promise<boolean> {
  return false;
}
