import type { ExposureConfig, ExposureResult, RegisterPersonFacts } from './types.js';

/**
 * The generic exposure scorer: could this person plausibly appear in this
 * register at all? Pure config against tree facts — date windows, place
 * fragments, sex, birth-year range, a surname roster — with every point
 * carrying its reason, because downstream everything is explained in
 * plain words. Registers with genuinely novel signals get a plugin; the
 * ordinary ones get config only.
 */
export function scoreExposure(
  person: RegisterPersonFacts,
  config: ExposureConfig,
): ExposureResult {
  const none: ExposureResult = { score: 0, exposed: false, reasons: [] };
  if (config.sex && person.sex && person.sex !== 'U' && person.sex !== config.sex) return none;

  let score = 0;
  const reasons: string[] = [];

  const windowsHit = new Set<number>();
  const placesHit = new Set<number>();
  let coincidence = false;

  for (const event of person.events) {
    const inWindows: number[] = [];
    (config.dateWindows ?? []).forEach((w, i) => {
      if (event.year !== null && event.year >= w.from && event.year <= w.to) inWindows.push(i);
    });
    const inPlaces: number[] = [];
    (config.placeSignals ?? []).forEach((p, i) => {
      const parts = event.placeParts ?? [];
      if (parts.some((part) => part.toLowerCase().includes(p.pattern.toLowerCase()))) {
        inPlaces.push(i);
      }
    });
    for (const i of inWindows) windowsHit.add(i);
    for (const i of inPlaces) placesHit.add(i);
    if (inWindows.length > 0 && inPlaces.length > 0) coincidence = true;
  }

  for (const i of windowsHit) {
    const w = config.dateWindows![i]!;
    score += w.weight;
    reasons.push(w.reason);
  }
  for (const i of placesHit) {
    const p = config.placeSignals![i]!;
    score += p.weight;
    reasons.push(p.reason);
  }
  if (coincidence && config.coincidenceBonus) {
    score += config.coincidenceBonus;
    reasons.push('a dated event sits inside the window at a signal place');
  }

  const range = config.birthYearRange;
  if (
    range &&
    person.birthYear !== null &&
    person.birthYear >= range.from &&
    person.birthYear <= range.to
  ) {
    score += range.weight;
    reasons.push(range.reason);
  }

  const roster = config.surnames;
  if (roster) {
    const surname = person.fullName.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
    if (roster.list.some((s) => s.toLowerCase() === surname)) {
      score += roster.weight;
      reasons.push(roster.reason);
    }
  }

  return { score, exposed: score >= config.threshold, reasons };
}
