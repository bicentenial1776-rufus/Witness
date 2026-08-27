/**
 * The perspective lens (Portrait redesign, 2026-08-27): a SESSION-ONLY
 * re-anchoring of relationship framing on an ancestor other than the home
 * person. Deliberately not persisted and deliberately not the home-person
 * flow — `trees.home_person_id` and the precomputed relationship rows are
 * never touched. Screens that honor the lens compute live walks from this
 * person instead of reading the cache, and show a visible "seen from"
 * band with a reset.
 */

export interface Perspective {
  id: string;
  name: string;
}

let current: Perspective | null = null;
const listeners = new Set<() => void>();

export function getPerspective(): Perspective | null {
  return current;
}

export function setPerspective(next: Perspective | null): void {
  current = next;
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore. Returns the unsubscribe. */
export function subscribePerspective(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
