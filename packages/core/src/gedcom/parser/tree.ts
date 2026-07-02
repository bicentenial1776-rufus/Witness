import type { GedcomNode } from '../types/raw.js';
import { tokenizeLine } from './tokenizer.js';

export interface BuildTreeResult {
  records: GedcomNode[];
  warnings: string[];
}

/**
 * Builds a tree of top-level (level 0) records from raw GEDCOM text.
 * Uses a level-indexed stack rather than recursion so arbitrarily deep or
 * malformed nesting can't blow the call stack, and CONT/CONC lines (which
 * carry no level semantics of their own) attach to whatever node is
 * currently on top of the stack.
 */
export function buildTree(text: string): BuildTreeResult {
  const warnings: string[] = [];
  const records: GedcomNode[] = [];
  const stack: GedcomNode[] = [];
  const lines = text.split(/\r\n|\r|\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;

    const parsed = tokenizeLine(raw);
    if (!parsed) {
      if (raw.trim().length > 0) {
        warnings.push(`Skipped malformed line ${i + 1}: ${raw.slice(0, 80)}`);
      }
      continue;
    }

    if (parsed.tag === 'CONT' || parsed.tag === 'CONC') {
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.value += (parsed.tag === 'CONT' ? '\n' : '') + parsed.value;
      } else {
        warnings.push(`CONT/CONC with no parent at line ${i + 1}`);
      }
      continue;
    }

    const node: GedcomNode = {
      level: parsed.level,
      tag: parsed.tag,
      xref: parsed.xref,
      value: parsed.value,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1]!.level >= node.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (!parent) {
      records.push(node);
    } else {
      parent.children.push(node);
    }
    stack.push(node);
  }

  return { records, warnings };
}
