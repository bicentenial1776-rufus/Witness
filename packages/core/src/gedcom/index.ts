import { detectCuriosities } from './analyze/curiosities.js';
import { PlaceRegistry } from './normalize/places.js';
import { parseFamily } from './parser/family.js';
import { parseIndividual } from './parser/individual.js';
import { child, value } from './parser/query.js';
import { buildTree } from './parser/tree.js';
import type { Family, Individual, ParsedGedcom } from './types/witness.js';

export * from './types/witness.js';

/**
 * Parses a full GEDCOM 5.5.1 file into a structured, platform-agnostic
 * object: individuals map, families map, deduplicated place references,
 * flagged data curiosities, and parse metadata.
 */
export function parseGedcom(text: string, sourceFile?: string): ParsedGedcom {
  const start = Date.now();
  const { records, warnings } = buildTree(text);
  const places = new PlaceRegistry();

  const individuals = new Map<string, Individual>();
  const families = new Map<string, Family>();

  let gedcomVersion: string | undefined;
  let charset: string | undefined;
  let treeName: string | undefined;
  let exportDate: string | undefined;

  for (const record of records) {
    switch (record.tag) {
      case 'INDI': {
        const individual = parseIndividual(record, places);
        if (individual) individuals.set(individual.id, individual);
        break;
      }
      case 'FAM': {
        const family = parseFamily(record, places);
        if (family) families.set(family.id, family);
        break;
      }
      case 'HEAD': {
        gedcomVersion = value(child(record, 'GEDC'), 'VERS');
        charset = value(record, 'CHAR');
        treeName = value(child(record, 'SOUR'), '_TREE');
        exportDate = value(record, 'DATE');
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
    curiosities,
    metadata: {
      sourceFile,
      gedcomVersion,
      charset,
      treeName,
      exportDate,
      individualCount: individuals.size,
      familyCount: families.size,
      placeCount: placeList.length,
      parseWarnings: warnings,
      parseDurationMs: Date.now() - start,
    },
  };
}
