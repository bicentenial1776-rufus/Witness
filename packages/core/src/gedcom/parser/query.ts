import type { GedcomNode } from '../types/raw.js';

export function child(node: GedcomNode | undefined, tag: string): GedcomNode | undefined {
  return node?.children.find((c) => c.tag === tag);
}

export function children(node: GedcomNode | undefined, tag: string): GedcomNode[] {
  return node?.children.filter((c) => c.tag === tag) ?? [];
}

export function value(node: GedcomNode | undefined, tag: string): string | undefined {
  const found = child(node, tag)?.value.trim();
  return found ? found : undefined;
}
