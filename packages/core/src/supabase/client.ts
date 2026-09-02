import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

export type WitnessSupabaseClient = SupabaseClient<Database>;

/**
 * Thin factory so callers (Node scripts today, the Expo app later) don't
 * each re-type the generic. Takes explicit credentials rather than reading
 * env vars itself, since Node and Expo source config differently.
 */
export function createWitnessClient(
  url: string,
  anonKey: string,
  // Node < 22 has no global WebSocket and supabase-js throws in the
  // constructor without one — Node scripts pass a `ws` transport here
  // ({ realtime: { transport } }); the app never needs to.
  options?: Parameters<typeof createClient>[2],
): WitnessSupabaseClient {
  return createClient<Database>(url, anonKey, options);
}
