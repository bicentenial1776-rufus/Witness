import type { Json } from '@witness/core/supabase';

import { supabase } from '@/lib/supabase';

/**
 * First-party usage logging only (docs/privacy.html) — never a third-party
 * tracker, nothing sold or shared. Fire-and-forget: a logging failure must
 * never interrupt the action it's attached to, so this never throws.
 * Nothing reads this back through the app; see the "insert own usage
 * events" policy on `usage_events` — it's an operator query surface, not a
 * feature.
 */
export async function logEvent(
  userId: string,
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await supabase.from('usage_events').insert({
      user_id: userId,
      event_name: eventName,
      properties: properties as unknown as Json,
      source: 'client',
    });
    if (error) console.warn('logEvent failed', eventName, error.message);
  } catch (error) {
    console.warn('logEvent failed', eventName, error);
  }
}
