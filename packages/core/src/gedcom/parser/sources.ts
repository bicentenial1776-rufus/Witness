import type { GedcomNode } from '../types/raw.js';
import type { SourceCitation, SourceRecord } from '../types/witness.js';
import { child, children, value } from './query.js';
import type { SharedRecords } from './records.js';
import { resolveMediaRef } from './records.js';
import { stripXref } from './xref.js';

/**
 * Source records and citations, the "how do we know this?" layer.
 *
 * Records: `0 @S…@ SOUR` with TITL/AUTH/PUBL and the source database's
 * Ancestry _APID. Citations: `SOUR @S…@` pointers under the person
 * (level 1) or under a specific fact (level 2), carrying a PAGE locator,
 * a DATA.TEXT excerpt of the record, a DATA.WWW link, and the record's
 * own _APID. Inline (non-pointer) SOUR payloads — rare outside
 * hand-edited files — are skipped: without a record to cite there is
 * nothing to show for them.
 */

export function parseSourceRecord(node: GedcomNode): SourceRecord | null {
  if (!node.xref) return null;
  return {
    id: stripXref(node.xref),
    title: value(node, 'TITL'),
    author: value(node, 'AUTH'),
    publisher: value(node, 'PUBL'),
    apid: value(node, '_APID'),
  };
}

const POINTER = /^@.+@$/;

/** Friendly fact labels for the tags that carry citations in real exports. */
const FACT_LABELS: Record<string, string> = {
  NAME: 'name',
  SEX: 'sex',
  BIRT: 'birth',
  DEAT: 'death',
  BURI: 'burial',
  RESI: 'residence',
  OCCU: 'occupation',
  EVEN: 'custom',
  PROB: 'probate',
  _MILT: 'military',
  BAPM: 'baptism',
  CHR: 'christening',
  IMMI: 'immigration',
  EMIG: 'emigration',
  MARR: 'marriage',
  DIV: 'divorce',
};

function factLabel(tag: string): string {
  return FACT_LABELS[tag] ?? tag.replace(/^_/, '').toLowerCase();
}

function parseCitation(node: GedcomNode, fact: string, shared: SharedRecords): SourceCitation | null {
  const raw = node.value.trim();
  if (!POINTER.test(raw)) return null;
  const data = child(node, 'DATA');
  const media = children(node, 'OBJE').map((mediaNode) => resolveMediaRef(mediaNode, shared));
  return {
    sourceId: stripXref(raw),
    fact,
    page: value(node, 'PAGE'),
    text: value(data, 'TEXT'),
    url: value(data, 'WWW'),
    apid: value(node, '_APID'),
    ...(media.length > 0 ? { media } : {}),
  };
}

/**
 * Collects every citation in an INDI or FAM record: SOUR children of the
 * record itself cite the person/family as a whole, SOUR grandchildren
 * cite the fact they sit under. Deeper nesting doesn't occur in 5.5.1.
 */
export function collectCitations(
  record: GedcomNode,
  recordFact: string,
  shared: SharedRecords,
): SourceCitation[] {
  const citations: SourceCitation[] = [];
  for (const node of record.children) {
    if (node.tag === 'SOUR') {
      const citation = parseCitation(node, recordFact, shared);
      if (citation) citations.push(citation);
      continue;
    }
    for (const grandchild of node.children) {
      if (grandchild.tag !== 'SOUR') continue;
      const citation = parseCitation(grandchild, factLabel(node.tag), shared);
      if (citation) citations.push(citation);
    }
  }
  return citations;
}
