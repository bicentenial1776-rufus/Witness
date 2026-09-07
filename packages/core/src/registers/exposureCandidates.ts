import { fillDeepLink } from './deeplink.js';
import { scoreExposure } from './exposure.js';
import { splitName } from '../history/passengers.js';
import type { RegisterConfig, RegisterPersonFacts } from './types.js';

/**
 * Variant B candidates: a register with no person-level roll to match
 * against (the Civil War regiments — the 6.3M-name soldier index is
 * never ingested) still has something to say about a person: from his
 * sex, birth years, and where the record puts him, he could plausibly be
 * in it. That exposure IS the candidate. The card carries the reasons
 * and a prefilled search of the outside index; the user confirms by
 * attaching the entity (the regiment), never by our guess.
 */
export interface ExposureCandidate {
  person: RegisterPersonFacts;
  score: number;
  reasons: string[];
  /** The register's deep-link template filled from the person's name. */
  deepLink: string | null;
}

export function exposureCandidates(
  config: RegisterConfig,
  people: readonly RegisterPersonFacts[],
): ExposureCandidate[] {
  const exposure = config.exposure;
  if (!exposure) return [];
  const out: ExposureCandidate[] = [];
  for (const person of people) {
    const result = scoreExposure(person, exposure);
    if (!result.exposed) continue;
    const { givenNames, surname } = splitName(person.fullName);
    const deepLink = config.deepLinkTemplate
      ? fillDeepLink(config.deepLinkTemplate, { given: givenNames.split(/\s+/)[0] ?? '', surname })
      : null;
    out.push({ person, score: result.score, reasons: result.reasons, deepLink });
  }
  return out.sort((a, b) => b.score - a.score || a.person.fullName.localeCompare(b.person.fullName));
}
