import type { GedcomNode } from '../types/raw.js';
import type { MediaRef } from '../types/witness.js';
import { child, value } from './query.js';
import { stripXref } from './xref.js';

/**
 * Shared record registries built in a first pass over the file, so that
 * individuals parsed later can resolve pointers:
 *
 * - Notes: 5.5.1 uses top-level NOTE records; GEDCOM 7.0 replaces them
 *   with SNOTE (shared note) records. Both map xref → text.
 * - Media: OBJE records, with the 7.0 twist that TITL moved from a
 *   sibling of FILE to a child of FILE. We read both placements
 *   regardless of version — real exports mix conventions.
 */

export interface SharedRecords {
  notes: Map<string, string>;
  media: Map<string, { file?: string; title?: string }>;
}

export function collectSharedRecords(records: GedcomNode[]): SharedRecords {
  const notes = new Map<string, string>();
  const media = new Map<string, { file?: string; title?: string }>();

  for (const record of records) {
    if (!record.xref) continue;
    if (record.tag === 'NOTE' || record.tag === 'SNOTE') {
      const text = record.value.trim();
      if (text) notes.set(stripXref(record.xref), text);
    } else if (record.tag === 'OBJE') {
      media.set(stripXref(record.xref), parseMediaRecord(record));
    }
  }
  return { notes, media };
}

function parseMediaRecord(node: GedcomNode): { file?: string; title?: string } {
  const fileNode = child(node, 'FILE');
  return {
    file: fileNode?.value.trim() || undefined,
    // 5.5.1: TITL sits beside FILE; 7.0: TITL sits under FILE.
    title: value(node, 'TITL') ?? value(fileNode, 'TITL'),
  };
}

const POINTER = /^@.+@$/;

/** Resolves a NOTE/SNOTE substructure to its text (inline or shared). */
export function resolveNote(node: GedcomNode, shared: SharedRecords): string | undefined {
  const raw = node.value.trim();
  if (POINTER.test(raw)) return shared.notes.get(stripXref(raw));
  return raw || undefined;
}

/** Resolves an OBJE substructure (pointer or inline) into a MediaRef. */
export function resolveMediaRef(node: GedcomNode, shared: SharedRecords): MediaRef {
  const primary = value(node, '_PRIM') === 'Y';
  const raw = node.value.trim();
  if (POINTER.test(raw)) {
    const objeId = stripXref(raw);
    const record = shared.media.get(objeId);
    return { objeId, file: record?.file, title: record?.title, primary };
  }
  return { ...parseMediaRecord(node), primary };
}
