import type { PersonRegisterLink, RegisterDef } from './types.js';

/**
 * The provenance-labeled narrative blocks a confirmed link contributes.
 * Consumed by the narrative edge functions when they assemble prompts —
 * candidates never appear in prose, and every block names where the fact
 * came from, so the sourced tier stays sourced.
 */
export interface RegisterNarrativeBlock {
  registerKey: string;
  /** "From Deportation records (Grand-Pré, 1755)" — printed with the fact. */
  provenanceLabel: string;
  text: string;
}

export function registerNarrativeBlocks(
  links: readonly PersonRegisterLink[],
  registers: ReadonlyMap<string, RegisterDef>,
): RegisterNarrativeBlock[] {
  const blocks: RegisterNarrativeBlock[] = [];
  for (const link of links) {
    if (link.status !== 'confirmed' && link.status !== 'parsed_from_gedcom') continue;
    const register = registers.get(link.registerKey);
    if (!register) continue;
    const text = [link.recordName, link.recordSummary].filter(Boolean).join(' — ');
    if (!text) continue;
    blocks.push({
      registerKey: link.registerKey,
      provenanceLabel: register.provenanceLabel,
      text,
    });
  }
  return blocks;
}
