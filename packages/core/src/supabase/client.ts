import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

export type WitnessSupabaseClient = SupabaseClient<Database>;

/**
 * Thin factory so callers (Node scripts today, the Expo app later) don't
 * each re-type the generic. Takes explicit credentials rather than reading
 * env vars itself, since Node and Expo source config differently.
 */
export function createWitnessClient(url: string, anonKey: string): WitnessSupabaseClient {
  return createClient<Database>(url, anonKey);
}
