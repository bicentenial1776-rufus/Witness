import { fetchHistoricalEvents, type HistoricalEvent } from '@witness/core/history';

import { supabase } from '@/lib/supabase';

// The event library is a ~50-row global table that changes on the order of
// releases, not sessions: one fetch per app launch, shared by Explore,
// the shelf, and every ancestor card's "Lived Through" tags.
let pending: Promise<readonly HistoricalEvent[]> | null = null;

export function getEventLibrary(): Promise<readonly HistoricalEvent[]> {
  pending ??= fetchHistoricalEvents(supabase);
  return pending;
}
