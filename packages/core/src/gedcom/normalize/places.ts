import type { PlaceRef } from '../types/witness.js';

/**
 * Interns raw PLAC values into a deduplicated array of place references,
 * so events can carry a small placeId instead of repeating the full string
 * (5,495 individuals reuse a much smaller set of distinct places).
 */
export class PlaceRegistry {
  private idsByRaw = new Map<string, string>();
  private list: PlaceRef[] = [];

  intern(raw: string | undefined): string | undefined {
    const trimmed = raw?.replace(/\s+/g, ' ').trim();
    if (!trimmed) return undefined;

    const existing = this.idsByRaw.get(trimmed);
    if (existing) return existing;

    const id = `P${this.list.length + 1}`;
    const parts = trimmed
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    this.idsByRaw.set(trimmed, id);
    this.list.push({ id, raw: trimmed, parts });
    return id;
  }

  all(): PlaceRef[] {
    return this.list;
  }
}
