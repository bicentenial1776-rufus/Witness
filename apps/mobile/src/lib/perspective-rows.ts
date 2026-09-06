import {
  computeRelationshipRows,
  fetchFamilyGraph,
  type FamilyGraph,
  type PrecomputedRelationship,
} from '@witness/core/family';

import { getRelationshipDetailMap } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';

/**
 * Relationship rows seen from a chosen person. From the home person they
 * are the precomputed rows every list already reads; from anyone else —
 * "show me my mother's first cousins" — they are computed here on the
 * device from the family graph, a walk of about a tenth of a second, and
 * never written anywhere (the perspective lens is session-only by design).
 */
export interface PerspectiveRow {
  individual_id: string;
  label: string;
  tier: PrecomputedRelationship['tier'];
  generation_distance: number;
  line: string;
  is_direct_ancestor: boolean;
}

const graphs = new Map<string, Promise<FamilyGraph>>();
const computed = new Map<string, PerspectiveRow[]>();

function graphFor(treeId: string): Promise<FamilyGraph> {
  let pending = graphs.get(treeId);
  if (!pending) {
    pending = fetchFamilyGraph(supabase, treeId).catch((error: unknown) => {
      graphs.delete(treeId);
      throw error;
    });
    graphs.set(treeId, pending);
  }
  return pending;
}

export async function getRowsSeenFrom(treeId: string, fromId: string | null): Promise<PerspectiveRow[]> {
  if (!fromId) {
    const map = await getRelationshipDetailMap(treeId);
    return [...map.values()].map((r) => ({
      individual_id: r.individual_id,
      label: r.label,
      tier: r.tier,
      generation_distance: r.generation_distance,
      line: r.line,
      is_direct_ancestor: r.is_direct_ancestor,
    }));
  }
  const key = `${treeId}|${fromId}`;
  const hit = computed.get(key);
  if (hit) return hit;
  const graph = await graphFor(treeId);
  const rows = computeRelationshipRows(graph, fromId).map((r) => ({
    individual_id: r.individual_id,
    label: r.label,
    tier: r.tier,
    generation_distance: r.generation_distance,
    line: r.line,
    is_direct_ancestor: r.is_direct_ancestor,
  }));
  computed.set(key, rows);
  return rows;
}

/** After an import or a home-person change the graph and every walk are stale. */
export function invalidatePerspectiveRows(): void {
  graphs.clear();
  computed.clear();
}
