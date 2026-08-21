// The read-mark's plumbing (Betsey, 2026-08-19). Opening a portrait
// records the visit; browsing surfaces ask which of their rows have
// been visited and hang a small star on those. Server-side rows (RLS
// per user) so the marks follow the reader across devices.

import { supabase } from '@/lib/supabase';

/** Fire-and-forget: the mark must never slow a portrait down. */
export function recordVisit(individualId: string, treeId: string): void {
  void (async () => {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.from('ancestor_visits').upsert(
      {
        individual_id: individualId,
        tree_id: treeId,
        user_id: userId,
        last_visited_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,individual_id' },
    );
  })();
}

/** Which of these people has the reader already been to? */
export async function fetchVisitedSet(ids: string[]): Promise<Set<string>> {
  const visited = new Set<string>();
  for (let i = 0; i < ids.length; i += 400) {
    const { data } = await supabase
      .from('ancestor_visits')
      .select('individual_id')
      .in('individual_id', ids.slice(i, i + 400));
    for (const row of data ?? []) visited.add(row.individual_id);
  }
  return visited;
}

/** The star itself, as text so every row style can carry it inline. */
export const VISITED_MARK = '★';
