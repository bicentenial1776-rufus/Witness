import { detectCuriosities } from './analyze/curiosities.js';
import { PlaceRegistry } from './normalize/places.js';
import { parseFamily } from './parser/family.js';
import { parseIndividual } from './parser/individual.js';
import { collectSharedRecords } from './parser/records.js';
import { child, value } from './parser/query.js';
import { parseSourceRecord } from './parser/sources.js';
import { buildTree } from './parser/tree.js';
import type {
  Family,
  GedcomMetadata,
  Individual,
  ParsedGedcom,
  SourceRecord,
  TreeProvider,
} from './types/witness.js';

export * from './types/witness.js';
export { extractGedcomText, isZipData } from './gdz.js';

// HEAD.SOUR payloads seen in the wild, most specific first. FTM before
// Ancestry: Family Tree Maker headers mention both ("FTM ... Ancestry.com").
const PROVIDER_PATTERNS: [RegExp, TreeProvider][] = [
  [/family\s*tree\s*maker|^FTM\b/i, 'familytreemaker'],
  [/ancestry/i, 'ancestry'],
  [/familysearch|^FS\b/i, 'familysearch'],
  [/myheritage/i, 'myheritage'],
  [/findmypast|find\s*my\s*past/i, 'findmypast'],
  [/rootsmagic/i, 'rootsmagic'],
  [/gramps/i, 'gramps'],
  [/legacy/i, 'legacy'],
];

/**
 * Normalizes the exporting program/platform from the HEAD.SOUR payload (the
 * system id and its NAME sub-line), corroborated by the Ancestry tree id —
 * some Ancestry exports carry a bare registered id like "AncestryPRD", but
 * a SOUR._TREE.RIN is Ancestry's alone.
 */
export function detectProvider(
  sourceSystem: string | undefined,
  sourceName: string | undefined,
  ancestryTreeId: string | undefined,
): TreeProvider | undefined {
  for (const haystack of [sourceSystem, sourceName]) {
    if (!haystack) continue;
    for (const [pattern, provider] of PROVIDER_PATTERNS) {
      if (pattern.test(haystack)) return provider;
    }
  }
  return ancestryTreeId ? 'ancestry' : undefined;
}

/** Which parsing rules a HEAD.GEDC.VERS payload selects. */
export function detectSpecVersion(gedcomVersion: string | undefined): GedcomMetadata['specVersion'] {
  if (!gedcomVersion) return 'unknown';
  if (gedcomVersion.startsWith('7')) return '7.0';
  if (gedcomVersion.startsWith('5.5')) return '5.5.1';
  return 'unknown';
}

/**
 * Parses a full GEDCOM file into a structured, platform-agnostic object:
 * individuals map, families map, deduplicated place references, flagged
 * data curiosities, and parse metadata.
 *
 * Supports GEDCOM 5.5.1 (Ancestry) and GEDCOM 7.0 (FamilySearch). The
 * HEAD section is read first to pick the rules; unknown versions parse
 * with 5.5.1 rules and a warning. The 7.0-specific differences (SNOTE
 * shared notes, PHRASE date qualifiers, TITL under FILE) are handled in
 * the record parsers, which accept both conventions.
 */
export function parseGedcom(text: string, sourceFile?: string): ParsedGedcom {
  const start = Date.now();
  const { records, warnings } = buildTree(text);
  const places = new PlaceRegistry();

  const individuals = new Map<string, Individual>();
  const families = new Map<string, Family>();
  const sources = new Map<string, SourceRecord>();

  // Pass 1: HEAD (version routing) and shared records that later records
  // point into (NOTE/SNOTE, OBJE).
  const head = records.find((r) => r.tag === 'HEAD');
  const gedcomVersion = value(child(head, 'GEDC'), 'VERS');
  const charset = value(head, 'CHAR');
  const treeName = value(child(head, 'SOUR'), '_TREE');
  // Ancestry exports carry the tree's numeric id as RIN under SOUR._TREE;
  // together with each INDI xref (@I<personId>@) it reconstructs the
  // person's URL on ancestry.com. Absent in other vendors' exports.
  const ancestryTreeId = value(child(child(head, 'SOUR'), '_TREE'), 'RIN');
  // The SOUR payload is the writing program's registered id; NAME beneath it
  // is the human-readable product name. Either can carry the recognizable
  // vendor string, so both feed provider detection.
  const sourceSystem = value(head, 'SOUR');
  const sourceName = value(child(head, 'SOUR'), 'NAME');
  const provider = detectProvider(sourceSystem, sourceName, ancestryTreeId);
  const exportDate = value(head, 'DATE');
  const specVersion = detectSpecVersion(gedcomVersion);
  if (specVersion === 'unknown') {
    warnings.push(
      `Unknown GEDCOM version "${gedcomVersion ?? 'missing'}" — parsing with 5.5.1 rules`,
    );
  }

  const shared = collectSharedRecords(records);

  // Pass 2: individuals and families.
  for (const record of records) {
    switch (record.tag) {
      case 'INDI': {
        const individual = parseIndividual(record, places, shared);
        if (individual) individuals.set(individual.id, individual);
        break;
      }
      case 'FAM': {
        const family = parseFamily(record, places);
        if (family) families.set(family.id, family);
        break;
      }
      case 'SOUR': {
        const source = parseSourceRecord(record);
        if (source) sources.set(source.id, source);
        break;
      }
      default:
        break;
    }
  }

  const curiosities = detectCuriosities(individuals, families);
  const placeList = places.all();

  return {
    individuals,
    families,
    places: placeList,
    sources,
    curiosities,
    metadata: {
      sourceFile,
      gedcomVersion,
      specVersion,
      charset,
      treeName,
      sourceSystem,
      provider,
      ancestryTreeId,
      exportDate,
      individualCount: individuals.size,
      familyCount: families.size,
      placeCount: placeList.length,
      parseWarnings: warnings,
      parseDurationMs: Date.now() - start,
    },
  };
}
