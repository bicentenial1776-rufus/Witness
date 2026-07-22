import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';

export async function invokeError(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error);
  try {
    const body = await (error as { context?: Response }).context?.json?.();
    return body?.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Finds this ancestor's open research brief, or generates one, then
 * navigates to it. Returns an error message on failure; on success,
 * navigation has already happened and the return value is null.
 */
export async function openResearchBrief(individualId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('research_briefs')
    .select('id')
    .eq('individual_id', individualId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    router.push({ pathname: '/research/[briefId]', params: { briefId: existing.id } });
    return null;
  }

  const { data, error } = await supabase.functions.invoke('generate-research-brief', {
    body: { individualId },
  });
  if (error) return invokeError(error);
  router.push({ pathname: '/research/[briefId]', params: { briefId: data.id } });
  return null;
}
