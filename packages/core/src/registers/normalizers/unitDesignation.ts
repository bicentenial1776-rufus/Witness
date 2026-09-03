/**
 * Civil War unit-designation parser
 * (docs/witness-civil-war-prompt.md, decision 7): a deterministic parse
 * of the strings genealogy exports actually carry — "Co. K, 5th Iowa
 * Inf.", "5 IA INF", "Fifth Regiment Iowa Volunteer Infantry" — into a
 * canonical unit key on the `US-{STATE}-{BRANCH}-{NUMBER}` scheme
 * (USCT units key as US-USCT-…). The vocabulary is a versioned data
 * file (data/registers/cw-regiments/unit-terms.json), passed in; only
 * the walk is code.
 *
 * Confidence: 'high' needs state + number + branch all present; 'medium'
 * lacks the branch (reported, never assumed); anything less is null —
 * the caller surfaces it as an unparsed military fact for tuning.
 */

export interface UnitTerms {
  states: Record<string, string>;
  branches: Record<string, string>;
  ordinal_words: Record<string, number>;
  ranks: string[];
  noise_words: string[];
}

export interface ParsedUnit {
  unitKey: string;
  state: string;
  branch: string | null;
  number: number;
  company: string | null;
  rank: string | null;
  confidence: 'high' | 'medium';
}

export function makeUnitParser(terms: UnitTerms) {
  // Longest keys first so "heavy artillery" wins over "artillery".
  const stateKeys = Object.keys(terms.states).sort((a, b) => b.length - a.length);
  const branchKeys = Object.keys(terms.branches).sort((a, b) => b.length - a.length);
  const rankSet = new Set(terms.ranks);
  const noiseSet = new Set(terms.noise_words);

  return function parseUnitDesignation(text: string): ParsedUnit | null {
    let working = ` ${text.toLowerCase()} `
      .replace(/[.,;:()]/g, ' ')
      .replace(/\s+/g, ' ');

    // Company: "co k" / "company k" — a single letter after the word.
    let company: string | null = null;
    working = working.replace(/\b(?:co|comp|company)\s+([a-m])\b/g, (_, letter: string) => {
      company = letter.toUpperCase();
      return ' ';
    });

    // Rank: a leading title, when present.
    let rank: string | null = null;
    const tokens = working.trim().split(' ');
    if (tokens.length > 0 && rankSet.has(tokens[0]!)) {
      rank = tokens[0]!;
      working = ` ${tokens.slice(1).join(' ')} `;
    }

    // State: longest match anywhere in the string.
    let state: string | null = null;
    for (const key of stateKeys) {
      const re = new RegExp(`\\b${key.replace(/\s/g, '\\s+')}\\b`);
      if (re.test(working)) {
        state = terms.states[key]!;
        working = working.replace(re, ' ');
        break;
      }
    }
    if (!state) return null;

    // Branch: longest match of what remains.
    let branch: string | null = null;
    for (const key of branchKeys) {
      const re = new RegExp(`\\b${key.replace(/\s/g, '\\s+')}\\b`);
      if (re.test(working)) {
        branch = terms.branches[key]!;
        working = working.replace(re, ' ');
        break;
      }
    }

    // Number: "5", "5th", "5 th", or an ordinal word.
    let number: number | null = null;
    // '3d' and '2d' are the period's own ordinals, common in Dyer.
    const numeric = /\b(\d{1,3})\s*(?:st|nd|rd|th|d)?\b/.exec(working);
    if (numeric) number = Number(numeric[1]);
    if (number === null) {
      for (const [word, value] of Object.entries(terms.ordinal_words)) {
        if (new RegExp(`\\b${word}\\b`).test(working)) {
          number = value;
          break;
        }
      }
    }
    if (number === null || number < 1 || number > 300) return null;

    // Whatever remains must be noise words, or this is not a designation
    // (guards against "5th son born in Iowa" reading as a regiment).
    const leftover = working
      .trim()
      .split(' ')
      .filter((t) => t && !noiseSet.has(t) && !/^\d{1,3}(st|nd|rd|th|d)?$/.test(t) && t !== 'years');
    if (leftover.length > 2) return null;

    return {
      unitKey: `US-${state}-${branch ?? 'UNK'}-${number}`,
      state,
      branch,
      number,
      company,
      rank,
      confidence: branch ? 'high' : 'medium',
    };
  };
}
