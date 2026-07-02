import type { GedcomLine } from '../types/raw.js';

const LINE_RE = /^(\d+)\s+(.*)$/;

/**
 * Parses one raw GEDCOM line into level/xref/tag/value.
 * Returns null for blank or structurally malformed lines so callers can skip them.
 */
export function tokenizeLine(rawLine: string): GedcomLine | null {
  const line = rawLine.replace(/\r$/, '');
  if (line.trim().length === 0) return null;

  const match = LINE_RE.exec(line);
  if (!match) return null;

  const level = Number(match[1]);
  if (!Number.isInteger(level) || level < 0) return null;

  let rest = match[2] ?? '';
  let xref: string | undefined;

  if (rest.startsWith('@')) {
    const closeIdx = rest.indexOf('@', 1);
    if (closeIdx !== -1) {
      const candidate = rest.slice(0, closeIdx + 1);
      const after = rest.slice(closeIdx + 1);
      if (after.startsWith(' ')) {
        xref = candidate;
        rest = after.slice(1);
      }
    }
  }

  const spaceIdx = rest.indexOf(' ');
  const tag = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx);
  const value = spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1);

  if (!tag) return null;

  return { level, xref, tag: tag.toUpperCase(), value };
}
